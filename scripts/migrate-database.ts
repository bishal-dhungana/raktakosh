import "dotenv/config";
import { getPool, initializeDatabase } from "../server/db";

await initializeDatabase();
await getPool().end();
console.log("Raktakosh database migration completed.");
