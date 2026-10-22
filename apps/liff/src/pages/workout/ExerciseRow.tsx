import { EQUIPMENT_CATEGORY_LABELS, type Exercise } from "@gac/shared";
import { ExerciseIllustration } from "../../illustrations/ExerciseIllustration";
import { ExerciseName } from "./ExerciseName";

interface ExerciseRowProps {
  exercise: Exercise;
  disabled: boolean;
  onPick: (exercise: Exercise) => void;
}

export function ExerciseRow({ exercise, disabled, onPick }: ExerciseRowProps) {
  return (
    <button
      type="button"
      className="row"
      disabled={disabled}
      onClick={() => onPick(exercise)}
    >
      <ExerciseIllustration exercise={exercise} size={40} />
      <span className="row-name">
        <ExerciseName exercise={exercise} />
      </span>
      <span className="badge row-tag">
        {EQUIPMENT_CATEGORY_LABELS[exercise.equipmentCategory]}
      </span>
    </button>
  );
}
