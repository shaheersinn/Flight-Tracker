// apps/worker/src/db/migrate.ts
import fs from "fs";
import path from "path";
import { getPool } from "./index";
import { monitors } from "@flight-tracker/shared";

async function migrate() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log("Running migrations...");
    const sql = fs.readFileSync(
      path.join(__dirname, "schema.sql"),
      "utf-8"
    );
    await client.query(sql);
    console.log("Schema applied.");

    // Seed monitors table
    for (const monitor of monitors) {
      await client.query(
        `INSERT INTO monitors (id, kind, config)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET config = $3`,
        [monitor.id, monitor.kind, JSON.stringify(monitor)]
      );
    }
    console.log(`Seeded ${monitors.length} monitors.`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
