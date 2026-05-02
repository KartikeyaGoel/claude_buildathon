import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "crucible-api",
});

pool.on("error", (err) => {
  console.error("[db] idle client error", err);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
