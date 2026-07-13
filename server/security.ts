import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function requiredSecurityKey(name: string, expectedBytes: number): Buffer {
  const encoded = process.env[name]?.trim();
  if (!encoded) throw new Error(`${name} must be configured before staff multi-factor authentication can run.`);
  const key = Buffer.from(encoded, "base64");
  if (key.length !== expectedBytes) throw new Error(`${name} must be a base64-encoded ${expectedBytes}-byte value.`);
  return key;
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let current = 0;
  let output = "";
  for (const byte of value) {
    current = (current << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(current >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(current << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  const normalized = value.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let current = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("The authenticator secret is invalid.");
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totpCode(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function verifyTotp(secret: string, submittedCode: string): boolean {
  if (!/^\d{6}$/.test(submittedCode)) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (const offset of [-1, 0, 1]) {
    const expected = Buffer.from(totpCode(secret, counter + offset));
    const received = Buffer.from(submittedCode);
    if (expected.length === received.length && timingSafeEqual(expected, received)) return true;
  }
  return false;
}

export function totpUri(email: string, secret: string): string {
  const issuer = "Raktakosh";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function encryptMfaSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requiredSecurityKey("MFA_ENCRYPTION_KEY", 32), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptMfaSecret(value: string): string {
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("The stored authenticator secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", requiredSecurityKey("MFA_ENCRYPTION_KEY", 32), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8");
}
