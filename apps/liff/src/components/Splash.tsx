import { colors } from "@gac/shared";

// The approved「對話教練」mark (spec §10, option 1), the same as the LINE
// official account avatar. Brand colours stay fixed in dark mode, so they use
// the light tokens directly. `index.html` repeats this markup for the
// pre-JS splash; Splash.test.tsx keeps the two in sync.
const BRAND = colors.light.primary;
const BUBBLE = colors.light.bg;

/** The「對話教練」logo: a cream speech bubble holding a dumbbell. */
export function Logo({ size }: { size: number }) {
  return (
    <svg
      className="splash-logo"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="對話教練"
    >
      <circle cx="50" cy="50" r="50" fill={BRAND} />
      <path
        d="M28 24h44a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H46l-14 11v-11h-4a10 10 0 0 1-10-10V34a10 10 0 0 1 10-10z"
        fill={BUBBLE}
      />
      <g fill={BRAND}>
        <rect x="31" y="38" width="6" height="18" rx="2" />
        <rect x="63" y="38" width="6" height="18" rx="2" />
        <rect x="26" y="42" width="5" height="10" rx="1.5" />
        <rect x="69" y="42" width="5" height="10" rx="1.5" />
        <rect x="37" y="45" width="26" height="4" rx="2" />
      </g>
    </svg>
  );
}

/** Full-screen branded loading screen shown while LIFF logs in. */
export function Splash() {
  return (
    <main className="splash" aria-busy="true">
      <Logo size={96} />
      <p className="splash-name">Gym Assistant Coach</p>
      <p className="muted">正在準備你的資料…</p>
    </main>
  );
}
