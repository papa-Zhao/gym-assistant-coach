import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Not `new URL(path, import.meta.url)`: Vite rewrites that form into an asset
// URL under vitest, which fileURLToPath rejects.
const SEED = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../db/migrations/0004_seed_exercises.sql",
);

/** Built-in exercises from the seed migration. Dev tooling and tests only. */
export function parseSeed(): { slug: string; nameZh: string }[] {
  const sql = readFileSync(SEED, "utf8");
  return [...sql.matchAll(/^\s*\('([^']+)',\s*'([^']+)'/gm)].map((m) => ({
    slug: m[1]!,
    nameZh: m[2]!,
  }));
}
