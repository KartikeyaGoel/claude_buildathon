import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveMigrationDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const devDir = join(here, "../db/migrations");
  if (existsSync(devDir)) return devDir;
  return join(here, "../../src/db/migrations");
}

const migrationDir = resolveMigrationDir();

const child = spawn(
  process.platform === "win32" ? "node-pg-migrate.cmd" : "node-pg-migrate",
  ["up", "--migrations-dir", migrationDir, "--database-url-var", "DATABASE_URL"],
  { stdio: "inherit" },
);

const exitCode = await new Promise<number>((resolve) => {
  child.on("close", (code) => resolve(code ?? 1));
});

process.exit(exitCode);
