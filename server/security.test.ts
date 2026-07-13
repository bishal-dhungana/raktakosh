import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decryptMfaSecret, encryptMfaSecret, generateTotpSecret, verifyTotp } from "./security";

process.env.MFA_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

test("encrypts TOTP secrets at rest and rejects malformed codes", () => {
  const secret = generateTotpSecret();
  const encrypted = encryptMfaSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptMfaSecret(encrypted), secret);
  assert.equal(verifyTotp(secret, "not-a-code"), false);
  assert.equal(verifyTotp(secret, "12345"), false);
});
