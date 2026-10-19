import { CARDIO_LIMITS, SET_LIMITS } from "@gac/shared";
import { ApiHttpError, AuthExpiredError } from "../../api";

interface Range {
  min: number;
  max: number;
}

export interface FieldSpec {
  limits: Range;
  /** Whole numbers only. */
  integer?: boolean;
  /** Allowed step in the value (0.5 for RPE); default is one decimal. */
  step?: number;
  message: string;
}

const dash = "–";

function integerSpec(limits: Range): FieldSpec {
  return {
    limits,
    integer: true,
    message: `請輸入 ${limits.min}${dash}${limits.max} 的整數`,
  };
}

function decimalSpec(limits: Range): FieldSpec {
  return {
    limits,
    message: `請輸入 ${limits.min}${dash}${limits.max} 的數字（最多一位小數）`,
  };
}

export const SPEC = {
  reps: integerSpec(SET_LIMITS.reps),
  weightKg: decimalSpec(SET_LIMITS.weightKg),
  rpe: {
    limits: SET_LIMITS.rpe,
    step: 0.5,
    message: `請輸入 ${SET_LIMITS.rpe.min}${dash}${SET_LIMITS.rpe.max}（0.5 一級）`,
  } satisfies FieldSpec,
  durationMin: integerSpec(CARDIO_LIMITS.durationMin),
  distanceKm: {
    limits: CARDIO_LIMITS.distanceKm,
    message: `請輸入 ${CARDIO_LIMITS.distanceKm.min}${dash}${CARDIO_LIMITS.distanceKm.max} 的數字（最多兩位小數）`,
    step: 0.01,
  } satisfies FieldSpec,
  inclinePct: decimalSpec(CARDIO_LIMITS.inclinePct),
  speedKmh: decimalSpec(CARDIO_LIMITS.speedKmh),
  level: integerSpec(CARDIO_LIMITS.level),
} as const;

export type FieldName = keyof typeof SPEC;

export type Parsed =
  { ok: true; value: number | undefined } | { ok: false; message: string };

/** Parses one text input; empty is `undefined` when optional, an error when required. */
export function parseField(
  raw: string,
  spec: FieldSpec,
  required: boolean,
): Parsed {
  const text = raw.trim();
  if (text === "") {
    return required
      ? { ok: false, message: spec.message }
      : { ok: true, value: undefined };
  }
  const value = Number(text);
  const step = spec.integer ? 1 : (spec.step ?? 0.1);
  const onGrid = Math.abs(value / step - Math.round(value / step)) < 1e-9;
  if (
    !Number.isFinite(value) ||
    value < spec.limits.min ||
    value > spec.limits.max ||
    !onGrid
  ) {
    return { ok: false, message: spec.message };
  }
  return { ok: true, value };
}

/** The text shown in an input for a stored value. */
export function toText(value: number | undefined | null): string {
  return value === undefined || value === null ? "" : String(value);
}

/** Maps a failed API call to a user-facing sentence; rethrows nothing. */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiHttpError && err.status === 409)
    return "還沒有任何紀錄，先完成一組再結束訓練";
  return fallback;
}

export function isAuthExpired(err: unknown): boolean {
  return err instanceof AuthExpiredError;
}
