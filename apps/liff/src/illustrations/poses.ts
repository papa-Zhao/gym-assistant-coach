import type { Exercise, MuscleGroup } from "@gac/shared";
import type { Pose } from "./types";

export const POSES: Record<string, Pose> = {
  "barbell-bench-press": {
    equipment: ["M20 80 L84 80", "M30 80 L30 100", "M76 80 L76 100"],
    load: ["M14 41 L78 41", "M20 33 L20 49", "M72 33 L72 49"],
    head: [30, 68],
    body: "M37 71 L67 71 M67 71 L89 77 L91 99 M44 71 L40 56 L42 41 M52 71 L54 56 L52 41",
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
    body: "M56 53 L56 82 M56 82 L80 82 L82 102 M56 58 L44 47 L38 34 M56 58 L68 47 L74 34",
    arrow: "M18 38 L18 62 M12 56 L18 62 L24 56",
  },
  "incline-dumbbell-press": {
    equipment: [
      "M60 82 L34 56",
      "M60 82 L82 82",
      "M68 82 L68 100",
      "M40 62 L40 100",
    ],
    load: ["M53 37 L67 37 M53 32.5 L53 41.5 M67 32.5 L67 41.5"],
    head: [39, 53],
    body: "M44 58 L64 78 M64 78 L87 74 L92 96 M51 65 L59 52 L60 37",
    arrow: "M82 48 L82 26 M88 32 L82 26 L76 32",
  },
  "chest-press-machine": {
    equipment: [
      "M38 42 L38 80",
      "M38 80 L66 80",
      "M50 80 L50 100",
      "M28 18 L28 100",
      "M28 18 L62 18",
      "M62 18 L77 49",
    ],
    load: ["M77 49 L77 61"],
    head: [43, 41],
    body: "M44 48 L46 76 M46 76 L70 74 L72 96 M44.5 53 L58 57 L73 55",
    arrow: "M88 56 L106 56 M100 62 L106 56 L100 50",
  },
  "cable-crossover": {
    equipment: [
      "M8 6 L8 104",
      "M108 6 L108 104",
      "M8 14 L10 14",
      "M106 14 L108 14",
      "M16 17.5 L36 59",
      "M100 17.5 L80 59",
    ],
    load: [
      "M10 14 A4 4 0 1 0 18 14 A4 4 0 1 0 10 14",
      "M98 14 A4 4 0 1 0 106 14 A4 4 0 1 0 98 14",
    ],
    head: [58, 27],
    body: "M58 34 L58 62 M58 39 L44 46 L36 59 M58 39 L72 46 L80 59 M58 62 L50 84 L48 104 M58 62 L66 84 L68 104",
    arrow:
      "M32 70 L44 77 M36 79 L44 77 L42 69 M84 70 L72 77 M74 69 L72 77 L80 79",
  },
  "push-up": {
    equipment: ["M8 89 L108 89"],
    head: [90, 54.5],
    body: "M14 85 L34.5 77 L56.5 68 L82.5 57.5 M79 59 L72 72 L80 85",
    arrow: "M60 52 L60 30 M66 36 L60 30 L54 36",
  },
  "pec-deck-fly": {
    equipment: [
      "M26 14 L90 14",
      "M58 14 L58 30",
      "M39 14 L47 32",
      "M77 14 L69 32",
      "M42 78 L74 78",
      "M58 78 L58 100",
    ],
    load: ["M47 32 L47 46", "M69 32 L69 46"],
    head: [58, 38],
    body: "M58 45 L58 74 M58 74 L82 74 L84 96 M56 50 L40 52 L40 36 M60 50 L76 52 L76 36",
    arrow:
      "M16 44 L29 44 M23 50 L29 44 L23 38 M100 44 L87 44 M93 38 L87 44 L93 50",
  },
  "pull-up": {
    equipment: ["M14 28 L102 28", "M18 28 L18 10", "M98 28 L98 10"],
    head: [58, 19],
    body: "M58 27 L58 55 M58 32 L46 42 L40 28 M58 32 L70 42 L76 28 M58 55 L51 77 L49 99 M58 55 L65 77 L67 99",
    arrow: "M94 76 L94 52 M100 58 L94 52 L88 58",
  },
  "barbell-row": {
    equipment: [],
    load: ["M22 59 L82 59", "M28 51 L28 67", "M76 51 L76 67"],
    head: [65, 35.5],
    body: "M38 58 L59.5 40 M38 58 L52 78 L48 99 M56.5 42.5 L41.5 43.5 L46 58",
    arrow: "M94 70 L94 48 M100 54 L94 48 L88 54",
  },
  "seated-cable-row": {
    equipment: [
      "M46 62 L96 62",
      "M106 38 L106 94",
      "M104 62 L106 62",
      "M86 66 L86 86",
      "M16 78 L50 78",
      "M22 78 L22 94",
      "M44 78 L44 94",
    ],
    load: ["M46 57 L46 67", "M96 62 A4 4 0 1 0 104 62 A4 4 0 1 0 96 62"],
    head: [33, 39],
    body: "M34 46 L36 74 M36 74 L58 72 L82 76 M34.5 51 L28 64 L43 62",
    arrow: "M76 46 L56 46 M62 40 L56 46 L62 52",
  },
  "one-arm-dumbbell-row": {
    equipment: ["M62 76 L106 76", "M68 76 L68 98", "M100 76 L100 98"],
    load: ["M35 56.5 L47 56.5 M35 53.5 L35 59.5 M47 53.5 L47 59.5"],
    head: [63, 46.5],
    body: "M28 48 L56 48 M28 48 L32 71 L28 94 M52 48 L63.5 57.5 L68 72 M52 48 L39 41 L41 56.5",
    arrow: "M16 66 L16 44 M22 50 L16 44 L10 50",
  },
  "t-bar-row": {
    equipment: ["M12 96 L51 55", "M10 96 L20 96"],
    load: ["M55 59 L46.5 51"],
    head: [64.5, 38],
    body: "M36 58 L59 42 M36 58 L50 78 L44 99 M55.5 44.5 L40.5 46 L46 60",
    arrow: "M82 72 L82 50 M88 56 L82 50 L76 56",
  },
  "overhead-press": {
    equipment: [],
    load: ["M20 18 L96 18", "M26 10 L26 26", "M90 10 L90 26"],
    head: [58, 28],
    body: "M58 35 L58 63 M52 40 L38 33 L40 18 M64 40 L78 33 L76 18 M58 63 L51 85 L49 107 M58 63 L65 85 L67 107",
    arrow: "M102 58 L102 36 M108 42 L102 36 L96 42",
  },
  "dumbbell-shoulder-press": {
    equipment: ["M42 79 L74 79", "M58 79 L58 102"],
    load: [
      "M34 30 L48 30 M34 25.5 L34 34.5 M48 25.5 L48 34.5",
      "M68 30 L82 30 M68 25.5 L68 34.5 M82 25.5 L82 34.5",
    ],
    head: [58, 40],
    body: "M58 47 L58 75 M58 75 L82 75 L84 97 M52 52 L39 45 L41 30 M64 52 L77 45 L75 30",
    arrow: "M102 52 L102 30 M108 36 L102 30 L96 36",
  },
  "shoulder-press-machine": {
    equipment: [
      "M40 40 L40 82",
      "M40 82 L68 82",
      "M54 82 L54 100",
      "M30 14 L30 100",
      "M30 14 L63 40",
    ],
    load: ["M57 40 L69 40"],
    head: [46.5, 43],
    body: "M47 50 L48 78 M48 78 L72 76 L74 98 M47 55 L62 55 L63 40",
    arrow: "M84 50 L84 28 M90 34 L84 28 L78 34",
  },
  "dumbbell-lateral-raise": {
    equipment: [],
    load: [
      "M23 43 L33 43 M23 38.5 L23 47.5 M33 38.5 L33 47.5",
      "M83 43 L93 43 M83 38.5 L83 47.5 M93 38.5 L93 47.5",
    ],
    head: [58, 25],
    body: "M58 32 L58 60 M58 37 L43 40 L28 43 M58 37 L73 40 L88 43 M58 60 L51 82 L49 104 M58 60 L65 82 L67 104",
    arrow:
      "M20 68 L20 52 M26 58 L20 52 L14 58 M96 68 L96 52 M102 58 L96 52 L90 58",
  },
  "face-pull": {
    equipment: ["M108 5 L108 101", "M106 19 L108 19", "M84 27 L98.5 20.5"],
    load: ["M98 19 A4 4 0 1 0 106 19 A4 4 0 1 0 98 19", "M84 21 L84 33"],
    head: [53, 28],
    body: "M54 35 L58 63 M58 63 L68 83 L74 103 M58 63 L50 84 L43 104 M54.5 40 L65 29.5 L80 27",
    arrow: "M92 45 L72 45 M78 39 L72 45 L78 51",
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
