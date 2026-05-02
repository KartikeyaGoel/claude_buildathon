import { spawn } from "node:child_process";

const child = spawn(
  process.platform === "win32" ? "node-pg-migrate.cmd" : "node-pg-migrate",
  ["up", "--migration-dir", "src/db/migrations", "--database-url-var", "DATABASE_URL"],
  { stdio: "inherit" },
);

const exitCode = await new Promise<number>((resolve) => {
  child.on("close", (code) => resolve(code ?? 1));
});

process.exit(exitCode);
