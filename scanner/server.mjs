import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { access, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const port = Number(process.env.PORT ?? 8080);
const secret = process.env.SCANNER_SHARED_SECRET?.trim();
const maxBytes = 5 * 1024 * 1024;

if (!secret || secret.length < 32) throw new Error("SCANNER_SHARED_SECRET must be at least 32 characters.");

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function authorized(request) {
  const value = request.headers["x-raktakosh-scanner-token"];
  if (typeof value !== "string") return false;
  const received = Buffer.from(value);
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function definitionsReady() {
  try {
    const entries = await readdir("/var/lib/clamav");
    return entries.some((entry) => /\.(cvd|cld)$/i.test(entry));
  } catch {
    return false;
  }
}

async function body(request) {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > maxBytes) throw Object.assign(new Error("Invalid content length."), { status: 413 });
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error("Document too large."), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function scan(buffer) {
  const filename = join(tmpdir(), "raktakosh-scan", randomUUID());
  await writeFile(filename, buffer, { mode: 0o600, flag: "wx" });
  try {
    await executeFile("clamscan", ["--no-summary", "--stdout", "--database=/var/lib/clamav", filename], { timeout: 30_000, maxBuffer: 16 * 1024 });
    return "clean";
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 1) return "malicious";
    throw error;
  } finally {
    await rm(filename, { force: true });
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return json(response, await definitionsReady() ? 200 : 503, { status: await definitionsReady() ? "ok" : "definitions_pending" });
    }
    if (request.method !== "POST" || request.url !== "/scan") return json(response, 404, { error: "Not found." });
    if (!authorized(request)) return json(response, 401, { error: "Unauthorized." });
    if (request.headers["content-type"] !== "application/octet-stream") return json(response, 415, { error: "Unsupported content type." });
    if (!(await definitionsReady())) return json(response, 503, { error: "Virus definitions are not ready." });
    const verdict = await scan(await body(request));
    return json(response, verdict === "clean" ? 200 : 422, { verdict, engine: "clamav" });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? error.status : 503;
    return json(response, status, { error: "Scanning unavailable. The document was not accepted." });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Raktakosh document scanner listening on ${port}`));
