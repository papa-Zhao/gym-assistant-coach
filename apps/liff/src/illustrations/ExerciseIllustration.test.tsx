import { MUSCLE_GROUPS, type MuscleGroup } from "@gac/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExerciseIllustration } from "./ExerciseIllustration";
import { parseSeed } from "../../scripts/seed";
import { FALLBACK_BY_MUSCLE, POSES, poseFor } from "./poses";
import type { Pose } from "./types";

const strength = (slug: string | null, muscleGroup: MuscleGroup = "chest") => ({
  slug,
  kind: "strength" as const,
  muscleGroup,
});

function html(
  exercise: Parameters<typeof ExerciseIllustration>[0]["exercise"],
  size: 40 | 64,
) {
  return render(<ExerciseIllustration exercise={exercise} size={size} />)
    .container.innerHTML;
}

function paths(pose: Pose): string[] {
  return [...pose.equipment, ...(pose.load ?? []), pose.body, pose.arrow];
}

const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  Q: 4,
  A: 7,
  Z: 0,
};

/** Absolute coordinates of a path, as [x, y] pairs (H/V give one axis only). */
function points(
  d: string,
): { x?: number | undefined; y?: number | undefined }[] {
  const out: { x?: number | undefined; y?: number | undefined }[] = [];
  for (const [, cmd, args] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const nums = (args ?? "").match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
    const n = ARITY[cmd!.toUpperCase()]!;
    if (cmd === "H") out.push(...nums.map((x) => ({ x })));
    else if (cmd === "V") out.push(...nums.map((y) => ({ y })));
    else if (n > 0)
      for (let i = 0; i < nums.length; i += n) {
        const chunk = nums.slice(i, i + n);
        // A: rx ry rotation large-arc sweep x y — only the last pair is a point.
        const coords = cmd === "A" ? chunk.slice(5) : chunk;
        for (let j = 0; j < coords.length; j += 2)
          out.push({ x: coords[j], y: coords[j + 1] });
      }
  }
  return out;
}

describe("ExerciseIllustration", () => {
  it("renders pose with token colours only", () => {
    const out = html(strength("barbell-bench-press"), 64);
    expect(out).not.toContain("#");
    expect(out).toContain("var(--color-primary)");
  });

  it("40px omits arrow, 64px draws it", () => {
    const small = render(
      <ExerciseIllustration exercise={strength("lat-pulldown")} size={40} />,
    ).container;
    const big = render(
      <ExerciseIllustration exercise={strength("lat-pulldown")} size={64} />,
    ).container;
    const arrow = POSES["lat-pulldown"]!.arrow;
    expect(small.querySelector(`path[d="${arrow}"]`)).toBeNull();
    expect(big.querySelector(`path[d="${arrow}"]`)).not.toBeNull();
  });

  it("is decorative", () => {
    const { container } = render(
      <ExerciseIllustration exercise={strength("lat-pulldown")} size={40} />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("custom strength exercise borrows muscle group pose", () => {
    expect(poseFor(strength(null, "back"))).toBe(POSES["lat-pulldown"]);
  });

  it("custom cardio borrows treadmill-run", () => {
    expect(poseFor({ slug: null, kind: "cardio", muscleGroup: null })).toBe(
      POSES["treadmill-run"],
    );
  });

  it("unknown slug falls back without throwing", () => {
    expect(() => html(strength("no-such-exercise"), 40)).not.toThrow();
    expect(poseFor(strength("no-such-exercise"))).toBe(
      POSES["barbell-bench-press"],
    );
  });

  it("custom strength exercise without muscle group uses default pose", () => {
    expect(poseFor({ slug: null, kind: "strength", muscleGroup: null })).toBe(
      POSES["barbell-bench-press"],
    );
  });

  it("inherited object keys are not treated as poses", () => {
    expect(poseFor(strength("constructor", "back"))).toBe(
      POSES["lat-pulldown"],
    );
  });

  it("every pose stays inside the canvas with 4 margin", () => {
    for (const [slug, pose] of Object.entries(POSES)) {
      const all = [
        ...paths(pose).flatMap(points),
        // Head circle extends by its radius.
        { x: pose.head[0] - 7.5, y: pose.head[1] - 7.5 },
        { x: pose.head[0] + 7.5, y: pose.head[1] + 7.5 },
      ];
      for (const { x, y } of all) {
        if (x !== undefined) {
          expect(x, `${slug} x`).toBeGreaterThanOrEqual(4);
          expect(x, `${slug} x`).toBeLessThanOrEqual(112);
        }
        if (y !== undefined) {
          expect(y, `${slug} y`).toBeGreaterThanOrEqual(4);
          expect(y, `${slug} y`).toBeLessThanOrEqual(108);
        }
      }
    }
  });

  it("poses cover chest, back and shoulders slugs", () => {
    const slugs = [
      "incline-dumbbell-press",
      "chest-press-machine",
      "cable-crossover",
      "push-up",
      "pec-deck-fly",
      "pull-up",
      "barbell-row",
      "seated-cable-row",
      "one-arm-dumbbell-row",
      "t-bar-row",
      "overhead-press",
      "dumbbell-shoulder-press",
      "shoulder-press-machine",
      "dumbbell-lateral-raise",
      "face-pull",
    ];
    for (const slug of slugs) expect(POSES[slug], slug).toBeDefined();
  });

  it("poses cover arms, core and cardio slugs", () => {
    const slugs = [
      "barbell-curl",
      "dumbbell-curl",
      "ez-bar-curl",
      "hammer-curl",
      "cable-curl",
      "triceps-pushdown",
      "skull-crusher",
      "close-grip-bench-press",
      "bench-dip",
      "overhead-triceps-extension",
      "plank",
      "hanging-leg-raise",
      "cable-crunch",
      "ab-crunch-machine",
      "treadmill-incline-walk",
      "outdoor-run",
      "stair-climber",
      "stationary-bike",
      "rowing-machine",
      "elliptical",
      "jump-rope",
    ];
    for (const slug of slugs) expect(POSES[slug], slug).toBeDefined();
  });

  it("every seeded exercise has a pose", () => {
    const seeded = parseSeed().map((e) => e.slug);
    expect(seeded).toHaveLength(57);
    for (const slug of seeded) expect(POSES[slug], slug).toBeDefined();
  });

  it("POSES has no slug outside the seed", () => {
    const seeded = new Set(parseSeed().map((e) => e.slug));
    for (const slug of Object.keys(POSES))
      expect(seeded.has(slug), slug).toBe(true);
  });

  it("every muscle group fallback points at an existing pose", () => {
    for (const group of MUSCLE_GROUPS)
      expect(POSES[FALLBACK_BY_MUSCLE[group]], group).toBeDefined();
  });

  it("each muscle group borrows its representative exercise", () => {
    expect(FALLBACK_BY_MUSCLE).toEqual({
      chest: "barbell-bench-press",
      back: "lat-pulldown",
      shoulders: "overhead-press",
      biceps: "dumbbell-curl",
      triceps: "triceps-pushdown",
      quads: "barbell-back-squat",
      hamstrings: "romanian-deadlift",
      glutes: "barbell-hip-thrust",
      calves: "standing-calf-raise",
      core: "plank",
    });
  });

  it("pose paths use only allowed commands", () => {
    for (const pose of Object.values(POSES))
      for (const d of paths(pose))
        expect(d).toMatch(/^[MLHVCQAZmlhvcqaz0-9\s.,-]+$/);
  });
});
