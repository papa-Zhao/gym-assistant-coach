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
      "M30 14 L100 14",
      "M100 14 L100 100",
      "M40 14 L45 34",
      "M76 14 L71 34",
      "M42 78 L74 78",
      "M58 78 L58 100",
    ],
    load: ["M45 34 L47.5 45", "M71 34 L68.5 45"],
    head: [58, 38],
    body: "M58 45 L58 74 M58 74 L82 74 L84 96 M56 52 L42 55 L46 40 M60 52 L74 55 L70 40",
    arrow:
      "M18 46 L32 46 M26 52 L32 46 L26 40 M96 46 L84 46 M90 40 L84 46 L90 52",
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
      "M85.5 66 L85.5 86",
      "M16 78 L50 78",
      "M22 78 L22 94",
      "M44 78 L44 94",
    ],
    load: ["M46 57 L46 67", "M96 62 A4 4 0 1 0 104 62 A4 4 0 1 0 96 62"],
    head: [33, 39],
    body: "M34 46 L36 74 M36 74 L58 72 L81.5 75.5 M34.5 51 L28 64 L43 62",
    arrow: "M76 46 L56 46 M62 40 L56 46 L62 52",
  },
  "one-arm-dumbbell-row": {
    equipment: ["M62 76 L106 76", "M68 76 L68 98", "M100 76 L100 98"],
    load: ["M37 55 L49 55 M37 52.5 L37 57.5 M49 52.5 L49 57.5"],
    head: [63, 46.5],
    body: "M28 48 L56 48 M28 48 L32 71 L28 94 M52 50 L63 59 L68 72 M52 50 L42 38 L43 54",
    arrow: "M16 66 L16 44 M22 50 L16 44 L10 50",
  },
  "t-bar-row": {
    equipment: ["M106 96 L46 60", "M100 96 L112 96"],
    load: ["M58.5 58.5 L50.5 72"],
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
      "M23 45.5 L33 45.5 M23 41 L23 50 M33 41 L33 50",
      "M83 45.5 L93 45.5 M83 41 L83 50 M93 41 L93 50",
    ],
    head: [58, 25],
    body: "M58 32 L58 60 M58 37 L43 40 L28 43 M58 37 L73 40 L88 43 M58 60 L51 82 L49 104 M58 60 L65 82 L67 104",
    arrow:
      "M20 74 L20 58 M26 64 L20 58 L14 64 M96 74 L96 58 M102 64 L96 58 L90 64",
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
  "barbell-curl": {
    equipment: [],
    load: [
      "M44 42 L88 42",
      "M50 34 L50 50",
      "M82 34 L82 50",
    ],
    head: [44, 24],
    body: "M44 31 L44 59 M44 59 L47 81 L47 103 M44 59 L41 81 L39 103 M44 36 L51 50 L66 45",
    arrow: "M104 64 L104 42 M98 48 L104 42 L110 48",
  },
  "dumbbell-curl": {
    equipment: [],
    load: [
      "M55 36 L69 36 M55 31.5 L55 40.5 M69 31.5 L69 40.5",
    ],
    head: [44, 24],
    body: "M44 31 L44 59 M44 59 L47 81 L47 103 M44 59 L41 81 L39 103 M44 36 L50 50 L60 39",
    arrow: "M84 62 L84 40 M78 46 L84 40 L90 46",
  },
  "ez-bar-curl": {
    equipment: [],
    load: [
      "M44 42 L56 42 L60 37.5 L64 46.5 L68 37.5 L72 46.5 L76 42 L88 42",
      "M50 34 L50 50",
      "M82 34 L82 50",
    ],
    head: [44, 24],
    body: "M44 31 L44 59 M44 59 L47 81 L47 103 M44 59 L41 81 L39 103 M44 36 L51 50 L66 45",
    arrow: "M104 64 L104 42 M98 48 L104 42 L110 48",
  },
  "hammer-curl": {
    equipment: [],
    load: [
      "M63 32.5 L63 44.5 M58.5 32.5 L67.5 32.5 M58.5 44.5 L67.5 44.5",
    ],
    head: [44, 24],
    body: "M44 31 L44 59 M44 59 L47 81 L47 103 M44 59 L41 81 L39 103 M44 36 L50 50 L60 39",
    arrow: "M84 62 L84 40 M78 46 L84 40 L90 46",
  },
  "cable-curl": {
    equipment: [
      "M108 56 L108 104",
      "M106 94 L108 94",
      "M98.5 92 L69 47.5",
    ],
    load: [
      "M98 94 A4 4 0 1 0 106 94 A4 4 0 1 0 98 94",
      "M69 41 L69 53",
    ],
    head: [44, 24],
    body: "M44 31 L44 59 M44 59 L47 81 L47 103 M44 59 L41 81 L39 103 M44 36 L51 50 L66 45",
    arrow: "M20 66 L20 44 M14 50 L20 44 L26 50",
  },
  "triceps-pushdown": {
    equipment: [
      "M108 5 L108 104",
      "M106 19 L108 19",
      "M98.5 21 L65 57",
    ],
    load: [
      "M98 19 A4 4 0 1 0 106 19 A4 4 0 1 0 98 19",
      "M65 52 L65 64",
    ],
    head: [45, 24],
    body: "M46 31 L44 59 M44 59 L47 81 L47 103 M44 59 L41 81 L39 103 M45.5 36 L50 50 L61 60",
    arrow: "M86 70 L86 92 M80 86 L86 92 L92 86",
  },
  "skull-crusher": {
    equipment: [
      "M20 80 L84 80",
      "M30 80 L30 100",
      "M76 80 L76 100",
    ],
    load: [
      "M8 50 L44 50",
      "M12 43 L12 57",
      "M40 43 L40 57",
    ],
    head: [30, 68],
    body: "M37 71 L65 71 M65 71 L87 76 L90 98 M44 71 L40 56.5 L27 53",
    arrow: "M30 34 L46 25 M39.5 23.5 L46 25 L43.5 31.5",
  },
  "close-grip-bench-press": {
    equipment: [
      "M20 80 L84 80",
      "M30 80 L30 100",
      "M76 80 L76 100",
    ],
    load: [
      "M21 40 L81 40",
      "M27 32 L27 48",
      "M75 32 L75 48",
    ],
    head: [30, 68],
    body: "M37 71 L65 71 M65 71 L87 76 L90 98 M44 71 L51 57.5 L51 43",
    arrow: "M98 54 L98 32 M92 38 L98 32 L104 38",
  },
  "bench-dip": {
    equipment: [
      "M8 66 L38 66",
      "M12 66 L12 102",
      "M34 66 L34 102",
      "M8 102 L108 102",
    ],
    head: [46, 42],
    body: "M46 49 L48 77 M48 77 L70 76 L78 98 M46.3 54 L33 48 L34 63",
    arrow: "M100 72 L100 50 M94 56 L100 50 L106 56",
  },
  "overhead-triceps-extension": {
    equipment: [],
    load: [
      "M30.5 31 L30.5 43 M26 31 L35 31 M26 43 L35 43",
    ],
    head: [54, 26],
    body: "M49 32 L49 60 M49 60 L52 82 L52 104 M49 60 L46 82 L44 104 M49 37 L42 23 L34 35",
    arrow: "M18 44 L18 22 M12 28 L18 22 L24 28",
  },
  "plank": {
    equipment: [
      "M8 96 L108 96",
    ],
    head: [87.5, 73.5],
    body: "M80 75.5 L52.8 82 M52.8 82 L29.9 87.5 L9 92.5 M78 77 L79 92 L94 92",
    arrow: "M46 66 L46 46 M40 52 L46 46 L52 52",
  },
  "hanging-leg-raise": {
    equipment: [
      "M14 14 L72 14",
      "M18 14 L18 6",
      "M68 14 L68 6",
    ],
    head: [53, 37],
    body: "M46 42.5 L47 70.5 M47 70.5 L71 70.5 L93 70.5 M45.5 46 L37.5 32 L30.5 18",
    arrow: "M84 100 L84 80 M78 86 L84 80 L90 86",
  },
  "cable-crunch": {
    equipment: [
      "M108 5 L108 104",
      "M106 18 L108 18",
      "M98.5 20 L84 50",
    ],
    load: [
      "M98 18 A4 4 0 1 0 106 18 A4 4 0 1 0 98 18",
      "M83 50 L83 62",
    ],
    head: [67.5, 52.5],
    body: "M62 58 L42 78 M42 78 L42 100 L20 100 M60 61 L72 70 L80 58",
    arrow: "M96 62 L96 86 M90 80 L96 86 L102 80",
  },
  "ab-crunch-machine": {
    equipment: [
      "M34 80 L62 80",
      "M48 80 L48 100",
      "M100 100 L100 50",
      "M100 55 L64 63",
    ],
    load: [
      "M60.5 53 L63.5 68",
    ],
    head: [58.5, 44],
    body: "M54 50.5 L44 77 M44 77 L68 76 L70 98 M53 55 L57.5 69.5 L71.5 62.5",
    arrow: "M70 18 L84 32 M75.5 32 L84 32 L84 23.5",
  },
  "treadmill-incline-walk": {
    equipment: [
      "M14 102 L98 86",
      "M96 86.5 L90 46",
      "M90 46 L78 48",
    ],
    head: [56, 15],
    body: "M54 22.5 L50 50 M50 50 L56 72 L66 90 M50 50 L44 72 L34 93 M53.5 27 L58 41 L70 48 M53.5 27 L47 40 L40 52",
    arrow: "M8 50 L22 50 M8 58 L18 58 M8 66 L22 66",
  },
  "outdoor-run": {
    equipment: [
      "M8 92 L108 92",
    ],
    head: [60, 18],
    body: "M59 25 L54 52 M54 52 L74 62 L70 84 M54 52 L45 73 L28 88 M58.5 30 L69 41 L80 32 M58.5 30 L48 40 L39 51",
    arrow: "M8 36 L22 36 M8 44 L18 44 M8 52 L22 52",
  },
  "stair-climber": {
    equipment: [
      "M8 106 L30 106 L30 96 L54 96 L54 84 L78 84 L78 72 L104 72",
      "M98 72 L98 38",
      "M98 40 L78 42",
    ],
    head: [59, 14],
    body: "M56 21 L49 48 M49 48 L70 57 L68 80.5 M49 48 L48 70 L44 92.5 M55 26 L63 38 L76 43",
    arrow: "M8 40 L22 40 M8 48 L18 48 M8 56 L22 56",
  },
  "stationary-bike": {
    equipment: [
      "M30 105 L102 105",
      "M38 60 L52 60",
      "M45 61 L49 105",
      "M94 105 L90 46",
      "M90 46 L82 46",
      "M72 92 A8 8 0 1 0 88 92 A8 8 0 1 0 72 92",
      "M68 80 L59 98",
    ],
    head: [67, 27],
    body: "M62 33 L45 56 M45 56 L67 58 L68 80 M45 56 L54 77 L59 98 M60.5 36 L72 46 L86 44",
    arrow: "M8 40 L22 40 M8 48 L18 48 M8 56 L22 56",
  },
  "rowing-machine": {
    equipment: [
      "M10 100 L94 100",
      "M42 95 L58 95",
      "M82 86 L85 99",
      "M92 88 A8 8 0 1 0 108 88 A8 8 0 1 0 92 88",
      "M91 64 L96 81",
    ],
    load: [
      "M90 57 L90 67",
    ],
    head: [63, 57],
    body: "M60 64 L50 90 M50 90 L68 74 L78 94 M59 67 L73 63 L87 62",
    arrow: "M8 50 L22 50 M8 58 L18 58 M8 66 L22 66",
  },
  "elliptical": {
    equipment: [
      "M8 104 L100 104",
      "M8 94 A6 6 0 1 0 20 94 A6 6 0 1 0 8 94",
      "M20 95 L80 99",
      "M90 100 L72 26",
    ],
    head: [52, 16],
    body: "M52 23 L51 51 M51 51 L59 72 L64 94 M51 51 L46 73 L37 93 M51.5 28 L60 40 L73 38",
    arrow: "M8 40 L22 40 M8 48 L18 48 M8 56 L22 56",
  },
  "jump-rope": {
    equipment: [
      "M33 53 A25 47 0 0 1 83 53",
      "M20 106 L96 106",
    ],
    head: [58, 19],
    body: "M58 26 L58 54 M58 54 L54 76 L53 98 M58 54 L62 76 L63 98 M52 31 L47 45 L35 52 M64 31 L69 45 L81 52",
    arrow: "M6 50 L20 50 M6 58 L16 58 M6 66 L20 66",
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
