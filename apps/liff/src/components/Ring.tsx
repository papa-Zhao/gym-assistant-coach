import type { ReactNode } from "react";

interface RingProps {
  /** 0–1; values above 1 draw a full ring. */
  progress: number;
  size?: number;
  stroke?: number;
  /** Rendered in the middle of the ring. */
  children?: ReactNode;
}

/** Decorative progress ring; the caller exposes the value as text. */
export function Ring({
  progress,
  size = 120,
  stroke = 10,
  children,
}: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true" focusable="false">
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
        />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
