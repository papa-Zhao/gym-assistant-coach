import type { Exercise } from "@gac/shared";
import { describe, expect, it } from "vitest";
import type { RawProgramDay } from "../src/ai/advisor";
import {
  PROGRAM_MAX_DAYS,
  PROGRAM_MAX_EXERCISES,
  programText,
  shapeProgram,
} from "../src/ask/program";

const ex = (slug: string, nameZh: string, kind = "strength"): Exercise =>
  ({
    id: `id-${slug}`,
    slug,
    nameZh,
    nameEn: null,
    kind,
    muscleGroup: kind === "strength" ? "chest" : null,
    equipment: "barbell",
    equipmentCategory: "free_weight",
    isCustom: false,
  }) as Exercise;

const many = Array.from({ length: 12 }, (_, i) => ex(`s${i}`, `動作${i}`));
const library = [
  ex("bench", "槓鈴臥推"),
  ex("press", "啞鈴肩推"),
  ex("squat", "深蹲"),
  ex("run", "跑步機跑步", "cardio"),
  ...many,
];
const day = (
  name: string,
  ...exercises: [string, number, number][]
): RawProgramDay => ({
  name,
  exercises: exercises.map(([slug, sets, reps]) => ({ slug, sets, reps })),
});

describe("shapeProgram", () => {
  it("skips unknown, cardio and duplicate slugs and keeps order", () => {
    const out = shapeProgram(
      [
        day(
          "推日",
          ["nope", 3, 8],
          ["bench", 4, 8],
          ["run", 1, 30],
          ["press", 3, 10],
          ["bench", 5, 5],
        ),
      ],
      library,
    );
    expect(out).toEqual([
      {
        name: "推日",
        items: [
          { exerciseId: "id-bench", nameZh: "槓鈴臥推", sets: 4, reps: 8 },
          { exerciseId: "id-press", nameZh: "啞鈴肩推", sets: 3, reps: 10 },
        ],
      },
    ]);
  });

  it("rounds and clamps sets and reps", () => {
    const out = shapeProgram(
      [
        day(
          "A",
          ["bench", 0, 0],
          ["press", 99, 200],
          ["squat", 3.6, 8.4],
          ["s0", 4.5, 12],
        ),
      ],
      library,
    );
    expect(out[0]!.items.map((i) => [i.sets, i.reps])).toEqual([
      [1, 1],
      [10, 50],
      [4, 8],
      [5, 12],
    ]);
  });

  it("caps days at 7 and exercises at 10", () => {
    const days = Array.from({ length: 9 }, (_, i) =>
      day(`D${i}`, ["bench", 3, 8]),
    );
    expect(shapeProgram(days, library)).toHaveLength(PROGRAM_MAX_DAYS);
    const slugs = many.map((e) => [e.slug!, 3, 8] as [string, number, number]);
    const out = shapeProgram([day("長", ...slugs)], library);
    expect(out[0]!.items).toHaveLength(PROGRAM_MAX_EXERCISES);
    expect(out[0]!.items[9]!.exerciseId).toBe("id-s9");
  });

  it("drops empty days and numbers blank names by kept position", () => {
    const out = shapeProgram(
      [
        day("A", ["bench", 3, 8]),
        day("全壞", ["nope", 3, 8], ["run", 1, 1]),
        day("   ", ["press", 3, 8]),
      ],
      library,
    );
    expect(out.map((d) => d.name)).toEqual(["A", "第 2 天"]);
  });

  it("caps names at 30 code points", () => {
    const out = shapeProgram([day("字".repeat(40), ["bench", 3, 8])], library);
    expect(Array.from(out[0]!.name)).toHaveLength(30);
  });

  it("returns [] when nothing is valid", () => {
    expect(shapeProgram([], library)).toEqual([]);
    expect(
      shapeProgram([day("A", ["nope", 3, 8], ["run", 1, 1])], library),
    ).toEqual([]);
  });
});

describe("programText", () => {
  it("writes one line per day", () => {
    const d = {
      name: "推日",
      items: [
        { nameZh: "槓鈴臥推", sets: 4, reps: 8 },
        { nameZh: "啞鈴肩推", sets: 3, reps: 10 },
      ],
    };
    expect(programText([d])).toBe("【推日】槓鈴臥推 4×8、啞鈴肩推 3×10");
    expect(programText([d, { ...d, name: "拉日" }])).toBe(
      "【推日】槓鈴臥推 4×8、啞鈴肩推 3×10\n【拉日】槓鈴臥推 4×8、啞鈴肩推 3×10",
    );
  });
});
