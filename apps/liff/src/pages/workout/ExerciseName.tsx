import type { Exercise } from "@gac/shared";

export function ExerciseName({ exercise }: { exercise: Exercise }) {
  return (
    <>
      <span>{exercise.nameZh}</span>
      {exercise.nameEn && <small className="muted"> {exercise.nameEn}</small>}
    </>
  );
}
