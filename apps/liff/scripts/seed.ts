import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEED = fileURLToPath(
  new URL("../../../db/migrations/0004_seed_exercises.sql", import.meta.url),
);

/** Built-in exercises from the seed migration. Dev tooling and tests only. */
export function parseSeed(): { slug: string; nameZh: string }[] {
  const sql = readFileSync(SEED, "utf8");
  return [...sql.matchAll(/^\s*\('([^']+)',\s*'([^']+)'/gm)].map((m) => ({
    slug: m[1]!,
    nameZh: m[2]!,
  }));
}
