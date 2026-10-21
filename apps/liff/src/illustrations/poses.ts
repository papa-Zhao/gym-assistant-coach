import type { Exercise, MuscleGroup } from "@gac/shared";
import type { Pose } from "./types";

export const POSES: Record<string, Pose> = {
  "barbell-bench-press": {
    equipment: ["M20 80 L96 80", "M30 80 L30 100", "M86 80 L86 100"],
    load: ["M14 38 L78 38", "M20 30 L20 46", "M72 30 L72 46"],
    head: [30, 68],
    body: "M37 71 L76 71 M76 71 L88 58 L96 100 M44 71 L40 56 L42 38 M52 71 L54 56 L52 38",
    arrow: "M92 46 L92 24 M86 30 L92 24 L98 30",
  },
  "lat-pulldown": {
    equipment: [
      "M56 12 L98 12",
      "M98 12 L98 102",
      "M56 20 L56 34",
      "M40 84 L72 84",
      "M56 84 L56 102",
    ],
    load: ["M52 16 A4 4 0 1 0 60 16 A4 4 0 1 0 52 16", "M30 34 L82 34"],
    head: [56, 46],
    body: "M56 53 L56 82 M56 82 L80 82 L82 102 M56 58 L42 46 L38 34 M56 58 L70 46 L74 34",
    arrow: "M18 38 L18 62 M12 56 L18 62 L24 56",
  },
  "treadmill-run": {
    equipment: ["M16 96 L100 96", "M96 96 L90 56", "M90 56 L78 58"],
    head: [56, 26],
    body: "M56 33 L52 60 M52 60 L63 74 L59 92 M52 60 L42 72 L30 84 M55 40 L66 48 L72 40 M55 40 L46 50 L40 46",
    arrow: "M8 50 L22 50 M8 58 L18 58 M8 66 L22 66",
  },
};

/** Slug of the pose a custom exercise borrows, by muscle group. */
export const FALLBACK_BY_MUSCLE: Record<MuscleGroup, string> = {
  chest: "barbell-bench-press",
  back: "lat-pulldown",
  shoulders: "barbell-bench-press",
  biceps: "barbell-bench-press",
  triceps: "barbell-bench-press",
  quads: "barbell-bench-press",
  hamstrings: "barbell-bench-press",
  glutes: "barbell-bench-press",
  calves: "barbell-bench-press",
  core: "barbell-bench-press",
};
export const CARDIO_FALLBACK = "treadmill-run";
export const DEFAULT_FALLBACK = "barbell-bench-press";

/** The exercise's own pose, else one borrowed by kind / muscle group. */
export function poseFor(
  exercise: Pick<Exercise, "slug" | "kind" | "muscleGroup">,
): Pose {
  const own = exercise.slug ? POSES[exercise.slug] : undefined;
  if (own) return own;
  if (exercise.kind === "cardio") return POSES[CARDIO_FALLBACK]!;
  const slug = exercise.muscleGroup
    ? FALLBACK_BY_MUSCLE[exercise.muscleGroup]
    : DEFAULT_FALLBACK;
  return POSES[slug] ?? POSES[DEFAULT_FALLBACK]!;
}
