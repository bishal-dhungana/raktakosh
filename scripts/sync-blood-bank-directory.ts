import "dotenv/config";
import type { ResultSetHeader } from "mysql2/promise";
import { fetchOfficialBloodBanks, NPHL_BLOOD_BANK_DIRECTORY_URL, NPHL_BLOOD_BANK_SOURCE_LABEL } from "../server/blood-bank-directory";
import { getPool, initializeDatabase } from "../server/db";

if (process.env.MIGRATION_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;

const syncedAt = new Date().toISOString();

await initializeDatabase();
const records = await fetchOfficialBloodBanks();
const pool = getPool();

for (const record of records) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute<ResultSetHeader>(
      `INSERT INTO blood_bank_directory (source, external_id, name, province, district, source_district, municipality, address, phone, email, services, total_stock, source_url, stock_source_url, last_synced_at, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), province = VALUES(province), district = VALUES(district), source_district = VALUES(source_district), municipality = VALUES(municipality), address = VALUES(address), phone = VALUES(phone), email = VALUES(email), services = VALUES(services), total_stock = VALUES(total_stock), source_url = VALUES(source_url), stock_source_url = VALUES(stock_source_url), last_synced_at = VALUES(last_synced_at), active = 1, updated_at = VALUES(updated_at)`,
      [NPHL_BLOOD_BANK_SOURCE_LABEL, record.externalId, record.name, record.province, record.district, record.sourceDistrict, record.municipality, record.address, record.phone, record.email, record.services, record.totalStock, NPHL_BLOOD_BANK_DIRECTORY_URL, `${NPHL_BLOOD_BANK_DIRECTORY_URL}/stock/${record.externalId}`, syncedAt, syncedAt, syncedAt]
    );
    const [directoryRows] = await connection.execute("SELECT id FROM blood_bank_directory WHERE source = ? AND external_id = ? LIMIT 1", [NPHL_BLOOD_BANK_SOURCE_LABEL, record.externalId]);
    const row = (directoryRows as Array<{ id: number }>)[0];
    if (!row) throw new Error(`Could not save NPHL directory entry ${record.externalId}.`);
    await connection.execute("DELETE FROM blood_bank_stock WHERE blood_bank_id = ?", [row.id]);
    for (const stock of record.stock) {
      await connection.execute(
        "INSERT INTO blood_bank_stock (blood_bank_id, component, component_category, blood_group, rh_factor, available_quantity, reported_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [row.id, stock.component, stock.componentCategory, stock.bloodGroup, stock.rhFactor, stock.quantity, syncedAt]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const ids = records.map((record) => record.externalId);
await pool.execute(`UPDATE blood_bank_directory SET active = 0, updated_at = ? WHERE source = ? AND external_id NOT IN (${ids.map(() => "?").join(",")})`, [syncedAt, NPHL_BLOOD_BANK_SOURCE_LABEL, ...ids]);
await pool.end();
console.log(`Synced ${records.length} official NPHL Blood Bank directory records at ${syncedAt}.`);
