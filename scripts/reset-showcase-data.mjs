import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const dataDirectory = join(process.cwd(), "data");

if (existsSync(dataDirectory)) {
  rmSync(dataDirectory, { recursive: true, force: true });
}

console.log("Raktakosh data has been reset. Start the application to create a fresh workspace.");
