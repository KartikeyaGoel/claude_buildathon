import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const FORBIDDEN_PATTERNS = [
  /\bpool\.query\s*\(\s*`/,
  /\bclient\.query\s*\(\s*`/,
  /\bdb\.query\s*\(\s*`/,
];

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listTsFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith(".ts")) return [fullPath];
      return [];
    }),
  );
  return files.flat();
}

const failures: string[] = [];

for (const file of await listTsFiles(ROOT)) {
  const source = await readFile(file, "utf8");
  if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(source))) {
    failures.push(path.relative(process.cwd(), file));
  }
}

if (failures.length > 0) {
  console.error("Unsafe SQL template literal usage detected:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("Use parameterized SQL with a plain string and values array.");
  process.exit(1);
}
