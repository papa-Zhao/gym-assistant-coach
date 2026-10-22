// Shared by the manual eval scripts: the built-in exercise list comes from the
// seed migration, so no database is needed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  equipmentCategory,
  type Equipment,
  type Exercise,
  type ExerciseKind,
  type MuscleGroup,
} from "@gac/shared";
import { bySlugOrder } from "../src/workouts/library";

// Only 0004 is parsed: no later migration adds built-in exercises today.
const SEED_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/migrations/0004_seed_exercises.sql",
);

// Row order: (slug, name_zh, name_en, kind, muscle_group, equipment).
const ROW =
  /^\s*\(((?:'(?:[^']|'')*'|null)(?:\s*,\s*(?:'(?:[^']|'')*'|null))*)\)/;
const FIELD = /'((?:[^']|'')*)'|null/g;

export function parseSeed(sql: string): Exercise[] {
  const out: Exercise[] = [];
  for (const line of sql.split("\n")) {
    const row = ROW.exec(line);
    if (!row?.[1]) continue;
    const f = Array.from(row[1].matchAll(FIELD), (m) =>
      m[1] === undefined ? null : m[1].replaceAll("''", "'"),
    );
    const [slug, nameZh, nameEn, kind, muscleGroup, equipment] = f;
    if (
      f.length !== 6 ||
      !slug ||
      !nameZh ||
      (kind !== "strength" && kind !== "cardio") ||
      !equipment ||
      !(EQUIPMENT as readonly string[]).includes(equipment) ||
      (muscleGroup !== null &&
        !(MUSCLE_GROUPS as readonly string[]).includes(muscleGroup!))
    ) {
      throw new Error("bad seed row");
    }
    out.push({
      id: slug,
      slug,
      nameZh,
      nameEn: nameEn ?? null,
      kind: kind as ExerciseKind,
      muscleGroup: muscleGroup as MuscleGroup | null,
      equipment: equipment as Equipment,
      equipmentCategory: equipmentCategory(equipment as Equipment),
      isCustom: false,
    });
  }
  return out.sort(bySlugOrder);
}

/** All built-in seed exercises (any kind) in slug order; callers filter, e.g. to strength for the advisor. */
export function loadSeedLibrary(): Exercise[] {
  return parseSeed(readFileSync(SEED_PATH, "utf8"));
}
