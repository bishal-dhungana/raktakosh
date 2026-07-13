import "dotenv/config";
import { getPool, initializeDatabase } from "../server/db";

if (process.env.MIGRATION_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;

await initializeDatabase();
await getPool().end();
console.log("Raktakosh database migration completed.");
