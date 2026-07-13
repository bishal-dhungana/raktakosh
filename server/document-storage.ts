import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const signedDownloadSeconds = 60;
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type SupportedDocumentMime = "application/pdf" | "image/jpeg" | "image/png";
export type DocumentScanStatus = "clean" | "unscanned";
export type DocumentUploadSecurity = "malware_scanned" | "basic_validation" | "unavailable";

export type DocumentScanResult = {
  status: DocumentScanStatus;
  provider: "clamav" | "basic_validation";
  scannedAt: string | null;
};

export class DocumentWorkflowError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "DocumentWorkflowError";
  }
}

type StorageConfiguration = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function configuredValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function storageConfiguration(): StorageConfiguration | null {
  const bucket = configuredValue("R2_BUCKET");
  const endpoint = configuredValue("R2_ENDPOINT");
  const accessKeyId = configuredValue("R2_ACCESS_KEY_ID");
  const secretAccessKey = configuredValue("R2_SECRET_ACCESS_KEY");
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".r2.cloudflarestorage.com")) return null;
  } catch {
    return null;
  }
  return { bucket, endpoint, accessKeyId, secretAccessKey };
}

function scannerConfiguration(): { url: string; secret: string } | null {
  const url = configuredValue("DOCUMENT_SCANNER_URL");
  const secret = configuredValue("SCANNER_SHARED_SECRET");
  if (!url || !secret || secret.length < 32) return null;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/$/, ""), secret };
}

function retentionDays(): number {
  const value = Number(process.env.DOCUMENT_RETENTION_DAYS ?? 365);
  return Number.isInteger(value) && value >= 30 && value <= 3650 ? value : 365;
}

function r2(): { client: S3Client; bucket: string } {
  const config = storageConfiguration();
  if (!config) throw new DocumentWorkflowError("Private document storage is not configured.", 503);
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
    })
  };
}

export function documentWorkflowEnabled(): boolean {
  return documentUploadSecurity() !== "unavailable";
}

export function documentUploadSecurity(): DocumentUploadSecurity {
  if (process.env.DOCUMENT_STORAGE_MODE !== "r2" || storageConfiguration() === null) return "unavailable";
  if (process.env.DOCUMENT_SCAN_MODE === "basic_validation") return "basic_validation";
  return scannerConfiguration() !== null ? "malware_scanned" : "unavailable";
}

export function documentWorkflowUnavailableMessage(): string {
  if (process.env.DOCUMENT_STORAGE_MODE !== "r2") return "Secure document submission is not enabled yet.";
  if (!storageConfiguration()) return "Private document storage is not configured.";
  if (!scannerConfiguration()) return "Document malware scanning is not configured.";
  return "Secure document submission is unavailable. Please try again later.";
}

export function allowedDocumentMimeType(value: string): value is SupportedDocumentMime {
  return allowedMimeTypes.has(value);
}

export function detectDocumentMime(buffer: Buffer): SupportedDocumentMime | null {
  if (buffer.length < 4) return null;
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export function validateDocument(buffer: Buffer, declaredMimeType: string): SupportedDocumentMime {
  if (!buffer.length || buffer.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentWorkflowError("Upload one PDF, JPG, or PNG file no larger than 5 MB.", 400);
  }
  if (!allowedDocumentMimeType(declaredMimeType)) {
    throw new DocumentWorkflowError("Only PDF, JPG, and PNG documents are accepted.", 400);
  }
  const detected = detectDocumentMime(buffer);
  if (!detected || detected !== declaredMimeType) {
    throw new DocumentWorkflowError("The file content does not match its declared document type.", 400);
  }
  return detected;
}

export function safeDocumentName(value: string, mimeType: SupportedDocumentMime): string {
  const extension = mimeType === "application/pdf" ? ".pdf" : mimeType === "image/png" ? ".png" : ".jpg";
  const base = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 140);
  const withoutExtension = base.replace(/\.[a-z0-9]{1,8}$/i, "") || "verification-document";
  return `${withoutExtension}${extension}`;
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function documentObjectKey(reference: string, mimeType: SupportedDocumentMime): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
  const extension = mimeType === "application/pdf" ? "pdf" : mimeType === "image/png" ? "png" : "jpg";
  return `private/verification-documents/${date}/${reference}/${randomUUID()}.${extension}`;
}

export function documentRetentionUntil(reference = new Date()): string {
  const value = new Date(reference);
  value.setUTCDate(value.getUTCDate() + retentionDays());
  return value.toISOString();
}

export async function scanDocument(buffer: Buffer, mimeType: SupportedDocumentMime, checksum: string): Promise<DocumentScanResult> {
  if (documentUploadSecurity() === "basic_validation") {
    return { status: "unscanned", provider: "basic_validation", scannedAt: null };
  }
  const scanner = scannerConfiguration();
  if (!scanner) throw new DocumentWorkflowError(documentWorkflowUnavailableMessage(), 503);
  const timeout = AbortSignal.timeout(30_000);
  let response: globalThis.Response;
  try {
    response = await fetch(`${scanner.url}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.length),
        "X-Raktakosh-Scanner-Token": scanner.secret,
        "X-Raktakosh-Document-Mime": mimeType,
        "X-Raktakosh-Document-SHA256": checksum
      },
      body: new Uint8Array(buffer),
      signal: timeout
    });
  } catch {
    throw new DocumentWorkflowError("Document scanning is temporarily unavailable. No request was created.", 503);
  }
  const payload = await response.json().catch(() => null) as { verdict?: string } | null;
  if (response.status === 422 && payload?.verdict === "malicious") {
    throw new DocumentWorkflowError("The document could not pass the security scan. No request was created.", 422);
  }
  if (!response.ok || payload?.verdict !== "clean") {
    throw new DocumentWorkflowError("Document scanning is temporarily unavailable. No request was created.", 503);
  }
  return { status: "clean", provider: "clamav", scannedAt: new Date().toISOString() };
}

export async function storeCleanDocument(input: { key: string; buffer: Buffer; mimeType: SupportedDocumentMime; originalName: string; checksum: string }): Promise<void> {
  const { client, bucket } = r2();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: input.buffer,
    ContentType: input.mimeType,
    ContentDisposition: `attachment; filename="${input.originalName.replaceAll('"', "")}"`,
    Metadata: { sha256: input.checksum, classification: "private-verification-document" }
  }));
}

export async function removeStoredDocument(key: string): Promise<void> {
  const { client, bucket } = r2();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function signedDocumentDownload(key: string, originalName: string): Promise<{ url: string; expiresAt: string }> {
  const { client, bucket } = r2();
  const url = await getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${originalName.replaceAll('"', "")}"`
  }), { expiresIn: signedDownloadSeconds });
  return { url, expiresAt: new Date(Date.now() + signedDownloadSeconds * 1000).toISOString() };
}

export function matchesScannerSecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const received = Buffer.from(provided);
  const configured = Buffer.from(expected);
  return received.length === configured.length && timingSafeEqual(received, configured);
}
