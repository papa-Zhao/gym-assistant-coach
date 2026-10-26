export const REST_KEY = "gac.restSec";
export const REST_DEFAULT_SEC = 90;
export const REST_MIN_SEC = 30;
export const REST_MAX_SEC = 300;
export const REST_STEP_SEC = 15;

function clamp(n: number): number {
  return Math.min(REST_MAX_SEC, Math.max(REST_MIN_SEC, n));
}

/** The saved rest target in seconds; the default when storage is unusable. */
export function getRestSec(): number {
  try {
    const raw = window.localStorage.getItem(REST_KEY);
    if (raw === null) return REST_DEFAULT_SEC;
    const n = Number(raw);
    return Number.isInteger(n) ? clamp(n) : REST_DEFAULT_SEC;
  } catch {
    return REST_DEFAULT_SEC;
  }
}

/** Saves the rest target (clamped); a storage failure is ignored. */
export function setRestSec(n: number): void {
  try {
    window.localStorage.setItem(REST_KEY, String(clamp(n)));
  } catch {
    // Storage may be blocked (private mode); the target just won't persist.
  }
}

export const REST_SOUND_KEY = "gac.restSound";

/** Whether the rest-end beep is on; true when storage is unusable. */
export function getRestSound(): boolean {
  try {
    return window.localStorage.getItem(REST_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Saves the beep preference; a storage failure is ignored. */
export function setRestSound(on: boolean): void {
  try {
    window.localStorage.setItem(REST_SOUND_KEY, on ? "on" : "off");
  } catch {
    // Storage may be blocked (private mode); the choice just won't persist.
  }
}
