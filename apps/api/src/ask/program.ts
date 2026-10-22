import type { Exercise } from "@gac/shared";
import type { RawProgramDay } from "../ai/advisor";
import { MAX_TEMPLATE_NAME } from "../workouts/repo";

export const PROGRAM_MAX_DAYS = 7;
export const PROGRAM_MAX_EXERCISES = 10;

export interface ShapedProgramDay {
  name: string;
  items: { exerciseId: string; nameZh: string; sets: number; reps: number }[];
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(n)));

/** Keeps known strength built-ins only; returns [] when nothing is left. */
export function shapeProgram(
  raw: RawProgramDay[],
  library: Exercise[],
): ShapedProgramDay[] {
  const bySlug = new Map<string, Exercise>();
  for (const e of library) {
    if (e.slug !== null && e.kind === "strength") bySlug.set(e.slug, e);
  }
  const days: ShapedProgramDay[] = [];
  for (const day of raw) {
    if (days.length === PROGRAM_MAX_DAYS) break;
    const seen = new Set<string>();
    const items: ShapedProgramDay["items"] = [];
    for (const ex of day.exercises) {
      if (items.length === PROGRAM_MAX_EXERCISES) break;
      const found = bySlug.get(ex.slug);
      if (!found || seen.has(ex.slug)) continue;
      seen.add(ex.slug);
      items.push({
        exerciseId: found.id,
        nameZh: found.nameZh,
        sets: clamp(ex.sets, 1, 10),
        reps: clamp(ex.reps, 1, 50),
      });
    }
    if (items.length === 0) continue;
    const name = Array.from(day.name.replace(/[\p{Cc}\s]+/gu, " ").trim())
      .slice(0, MAX_TEMPLATE_NAME)
      .join("")
      .trimEnd();
    days.push({ name: name || `第 ${days.length + 1} 天`, items });
  }
  return days;
}

/** One line per day: 【推日】槓鈴臥推 4×8、啞鈴肩推 3×10 */
export function programText(
  days: {
    name: string;
    items: { nameZh: string; sets: number; reps: number }[];
  }[],
): string {
  return days
    .map(
      (d) =>
        `【${d.name}】${d.items
          .map((i) => `${i.nameZh} ${i.sets}×${i.reps}`)
          .join("、")}`,
    )
    .join("\n");
}
