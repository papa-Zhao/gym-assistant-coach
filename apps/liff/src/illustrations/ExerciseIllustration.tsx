import type { Exercise } from "@gac/shared";
import { poseFor } from "./poses";

const ROUND = { strokeLinecap: "round", strokeLinejoin: "round" } as const;
/** Below this size the direction arrow is too small to read, so it is left out. */
const ARROW_MIN_SIZE = 56;

/** Decorative drawing of an exercise; the name is always shown beside it. */
export function ExerciseIllustration({
  exercise,
  size,
}: {
  exercise: Pick<Exercise, "slug" | "kind" | "muscleGroup" | "photoUrl">;
  size: 40 | 64;
}) {
  if (exercise.photoUrl) {
    return (
      <img
        className="illus-photo"
        src={exercise.photoUrl}
        alt=""
        width={size}
        height={size}
      />
    );
  }
  const pose = poseFor(exercise);
  return (
    <svg
      className="illus"
      viewBox="0 0 116 112"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {pose.equipment.map((d, i) => (
        <path
          key={`e${i}`}
          d={d}
          stroke="var(--color-text-muted)"
          strokeWidth={2}
          {...ROUND}
        />
      ))}
      <path
        d={pose.body}
        stroke="var(--color-primary)"
        strokeWidth={7}
        {...ROUND}
      />
      <circle
        cx={pose.head[0]}
        cy={pose.head[1]}
        r={7.5}
        fill="var(--color-primary)"
      />
      {pose.load?.map((d, i) => (
        <path
          key={`l${i}`}
          d={d}
          stroke="var(--color-text)"
          strokeWidth={3.5}
          {...ROUND}
        />
      ))}
      {size >= ARROW_MIN_SIZE && (
        <path
          d={pose.arrow}
          stroke="var(--color-text)"
          strokeWidth={2.5}
          {...ROUND}
        />
      )}
    </svg>
  );
}
