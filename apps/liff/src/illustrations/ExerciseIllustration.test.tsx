import type { MuscleGroup } from "@gac/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExerciseIllustration } from "./ExerciseIllustration";
import { POSES, poseFor } from "./poses";
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
    expect(poseFor(strength("no-such-exercise"))).toBeDefined();
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

  it("pose paths use only allowed commands", () => {
    for (const pose of Object.values(POSES))
      for (const d of paths(pose))
        expect(d).toMatch(/^[MLHVCQAZmlhvcqaz0-9\s.,-]+$/);
  });
});
