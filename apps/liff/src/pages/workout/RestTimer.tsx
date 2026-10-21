import { useEffect, useRef, useState } from "react";
import {
  REST_MAX_SEC,
  REST_MIN_SEC,
  REST_STEP_SEC,
  getRestSec,
  setRestSec,
} from "./restSettings";

const HOUR_MS = 3600 * 1000;
const END_NOTICE_MS = 3000;

export function formatRest(totalSec: number): string {
  const total = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

interface RestTimerProps {
  /** Latest completedAt (epoch ms) across the session's strength sets. */
  lastCompletedAt: number;
  /** The completedAt whose countdown the user skipped, if any. */
  skippedFor: number | null;
  onSkip: (lastCompletedAt: number) => void;
}

/** Counts down from the last completed set; re-derived from the server data. */
export function RestTimer({
  lastCompletedAt,
  skippedFor,
  onSkip,
}: RestTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const [target, setTarget] = useState(getRestSec);
  const wasResting = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedMs = Math.max(0, now - lastCompletedAt);
  const remainingMs = target * 1000 - elapsedMs;
  const resting = remainingMs > 0;
  const hidden = elapsedMs > HOUR_MS || skippedFor === lastCompletedAt;

  // Vibrate once, when a countdown seen on screen reaches zero.
  useEffect(() => {
    if (
      wasResting.current &&
      !resting &&
      !hidden &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(200);
    }
    wasResting.current = resting;
  }, [resting, hidden]);

  if (hidden) return null;

  const adjust = (delta: number) => {
    const next = Math.min(REST_MAX_SEC, Math.max(REST_MIN_SEC, target + delta));
    setTarget(next);
    setRestSec(next);
  };

  let label: string;
  if (resting) label = `休息 ${formatRest(Math.ceil(remainingMs / 1000))}`;
  else if (-remainingMs < END_NOTICE_MS) label = "休息結束";
  else label = `已休息 ${formatRest(elapsedMs / 1000)}`;

  return (
    <div className="rest-timer" role="group" aria-label="休息計時">
      <strong className="rest-label">{label}</strong>
      {/* Announce only the end of the rest, not every tick. */}
      <span className="sr-only" role="status">
        {!resting && -remainingMs < END_NOTICE_MS ? "休息結束" : ""}
      </span>
      <div className="rest-actions">
        <button
          type="button"
          className="secondary mini"
          disabled={target <= REST_MIN_SEC}
          onClick={() => adjust(-REST_STEP_SEC)}
        >
          −15 秒
        </button>
        <button
          type="button"
          className="secondary mini"
          disabled={target >= REST_MAX_SEC}
          onClick={() => adjust(REST_STEP_SEC)}
        >
          +15 秒
        </button>
        <button
          type="button"
          className="secondary mini"
          onClick={() => onSkip(lastCompletedAt)}
        >
          跳過
        </button>
      </div>
    </div>
  );
}
