import { createHash } from "node:crypto";

function hashSecret(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sqlLiteral(value) {
  return value.replaceAll("'", "''");
}

export async function up(pgm) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) return;

  const hash = hashSecret(adminApiKey);
  const prefix = sqlLiteral(adminApiKey.slice(0, 12));

  pgm.sql(`
    INSERT INTO users (api_key_hash, api_key_prefix, plan_tier, is_admin)
    VALUES ('${hash}', '${prefix}', 'admin', true)
    ON CONFLICT (api_key_hash) DO UPDATE
      SET plan_tier = 'admin',
          is_admin = true,
          updated_at = now();
  `);
}

export async function down(pgm) {
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) return;

  const hash = hashSecret(adminApiKey);
  pgm.sql(`DELETE FROM users WHERE api_key_hash = '${hash}' AND is_admin = true;`);
}
