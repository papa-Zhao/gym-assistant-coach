import { fontFamily, minTouchTarget, radius, tokensCss } from "@gac/shared";

/** Design-token variables plus the few base rules the LIFF screens need. */
export function themeCss(): string {
  return `${tokensCss()}
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: ${fontFamily.body};
  font-size: var(--font-size-body);
}
main {
  box-sizing: border-box;
  min-height: 100vh;
  padding: var(--space-6) var(--space-4);
}
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: ${radius.lg}px;
  padding: var(--space-6);
}
h1 {
  margin: 0 0 var(--space-3);
  font-family: var(--font-display);
  font-weight: 900;
  font-size: var(--font-size-title);
}
p { margin: 0 0 var(--space-4); line-height: 1.7; }
h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-heading);
}
.card + .card, h1 + .card, .step + h1 { margin-top: var(--space-4); }
.step { margin: 0 0 var(--space-2); color: var(--color-text-muted); font-size: var(--font-size-caption); }
.muted { color: var(--color-text-muted); font-size: var(--font-size-caption); }
.stack { display: flex; flex-direction: column; gap: var(--space-4); }
.stack p { margin: 0; }
fieldset { margin: 0; padding: 0; border: 0; }
legend { padding: 0; margin-bottom: var(--space-2); font-weight: 700; }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chips.column { flex-direction: column; }
.chip {
  display: flex;
  align-items: center;
  min-height: ${minTouchTarget}px;
  box-sizing: border-box;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  cursor: pointer;
}
.chip.selected {
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
  font-weight: 700;
}
.chip input { position: absolute; opacity: 0; pointer-events: none; }
.chip:has(input:focus-visible) { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.field { display: flex; flex-direction: column; gap: var(--space-2); font-weight: 700; }
.field input, .field select {
  min-height: ${minTouchTarget}px;
  box-sizing: border-box;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-body);
}
.kcal { text-align: center; }
.kcal-num {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: var(--font-size-display);
  color: var(--color-primary);
}
.kcal-unit { margin-left: var(--space-2); color: var(--color-text-muted); }
.macros { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.macro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-alt);
}
.explain {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  color: var(--color-on-accent-soft);
}
.explain p + p { margin-top: var(--space-2); font-weight: 700; }
.error-text, .errors { color: var(--color-danger); }
.errors { margin: 0; padding-left: var(--space-5); }
button.secondary {
  background: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
.list { padding: var(--space-4) var(--space-6); }
.list h2 { color: var(--color-text-muted); font-size: var(--font-size-caption); }
.list .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  width: 100%;
  min-height: ${minTouchTarget}px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-text);
  font-weight: 400;
  text-align: left;
  text-decoration: none;
}
.badge {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-surface-alt);
  color: var(--color-text-muted);
  font-size: var(--font-size-caption);
}
.seg {
  display: flex;
  gap: var(--space-1);
  margin: 0 0 var(--space-4);
  padding: var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--color-surface-alt);
}
.seg button {
  flex: 1;
  padding: 0 var(--space-2);
  background: transparent;
  color: var(--color-text-muted);
}
.seg button[aria-pressed="true"] {
  background: var(--color-surface);
  color: var(--color-text);
}
.metric-value { font-family: var(--font-display); font-weight: 900; font-size: var(--font-size-display); }
.metric-unit { margin-left: var(--space-1); color: var(--color-text-muted); }
.change { margin: 0; color: var(--color-accent); font-weight: 700; }
.chart { display: block; width: 100%; height: auto; }
.chart-range { display: flex; justify-content: space-between; }
.legend { display: flex; gap: var(--space-4); margin: 0; }
.legend span::before {
  content: "";
  display: inline-block;
  margin-right: var(--space-1);
  vertical-align: middle;
}
.legend .l-dot::before { width: 8px; height: 8px; border-radius: 50%; background: var(--color-border); }
.legend .l-line::before { width: 16px; height: 3px; background: var(--color-primary); }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-top: var(--space-4); }
button.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: ${radius.lg}px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: 400;
  text-align: left;
}
button.tile[aria-pressed="true"] {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}
button.tile strong { font-size: var(--font-size-heading); }
.tile.back { margin-top: var(--space-3); }
a.card.link { display: block; color: inherit; text-decoration: none; }
.card.soon { display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box; min-height: ${minTouchTarget}px; font-weight: 400; color: var(--color-text); text-align: left; }
.card + a.card, a.card + .card, .tiles + .card, .card + p.muted, p.muted + .card { margin-top: var(--space-4); }
.workout { padding-bottom: calc(${minTouchTarget}px * 2 + var(--space-8) + env(safe-area-inset-bottom)); }
.workout-head { display: flex; align-items: baseline; justify-content: space-between; }
.workout-head h1 { margin: 0 0 var(--space-3); }
.elapsed { color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.exercise-card { display: flex; flex-direction: column; gap: var(--space-2); }
.exercise-card p { margin: 0; }
.exercise-name { margin: 0; font-family: var(--font-display); font-weight: 900; font-size: var(--font-size-title); }
.exercise-name small { font-family: var(--font-body); font-weight: 400; }
.exercise-card .badge { align-self: flex-start; }
.set-grid { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
.set-row { display: grid; grid-template-columns: 0.8fr 1.3fr 0.9fr 0.9fr 1fr 3.25rem; gap: var(--space-1); align-items: center; }
.set-row.cardio-row { grid-template-columns: auto 1fr auto; gap: var(--space-2); }
.set-row > button.mini { width: 100%; padding: 0; }
.set-head { color: var(--color-text-muted); font-size: var(--font-size-caption); }
.done-mark { color: var(--color-accent); font-weight: 700; }
.set-no { font-weight: 700; }
.set-cell input {
  box-sizing: border-box;
  width: 100%;
  min-height: ${minTouchTarget}px;
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-body);
  text-align: center;
}
.set-cell input.primary-border { border-color: var(--color-primary); }
.set-editor { display: flex; flex-direction: column; gap: var(--space-2); }
.field-error { font-size: var(--font-size-caption); }
.editor-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
button.mini { padding: 0 var(--space-3); font-size: var(--font-size-caption); }
button.text-button { background: transparent; color: var(--color-primary); }
.bottom-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}
.bottom-bar > button { flex: 1; }
.confirm-row { display: flex; flex-direction: column; gap: var(--space-2); }
.confirm-actions { display: flex; gap: var(--space-2); }
.confirm-actions > button { flex: 1; }
.bottom-bar > .confirm-row { flex: 1; }
.start-button { margin-top: var(--space-6); }
.exercise-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
.exercise-head .exercise-name { flex: 1; min-width: 0; }
.set-hint { margin: 0; }
.card-links { display: flex; gap: var(--space-2); }
.card-links a { display: inline-flex; align-items: center; min-height: ${minTouchTarget}px; padding: 0 var(--space-2); }
.history-item h3 { margin: var(--space-3) 0 var(--space-1); font-size: var(--font-size-body); font-weight: 700; }
.history-item p { margin: 0; }
.tips h2, .tips h3 { margin: 0; }
.tips h3 { font-size: var(--font-size-body); font-weight: 700; }
.tips ul { margin: 0; padding-left: var(--space-5); line-height: 1.7; }
.tips li + li { margin-top: var(--space-1); }
.rest-timer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-4);
  flex-wrap: wrap;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
}
@keyframes rest-flash {
  0%, 100% { background: var(--color-primary-soft); }
  50% { background: var(--color-primary); }
}
.rest-timer.ended { animation: rest-flash 1s ease-in-out 3; }
@media (prefers-reduced-motion: reduce) {
  .rest-timer.ended { animation: none; background: var(--color-primary); color: var(--color-on-primary); }
}
.rest-timer.ended .rest-label { color: var(--color-on-primary); }
.rest-timer.ended button.secondary { color: var(--color-on-primary); border-color: var(--color-on-primary); }
.rest-timer.compact { padding: var(--space-1) var(--space-4); flex-wrap: nowrap; }
.rest-pinned {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: var(--space-2) var(--space-4);
  padding-top: calc(var(--space-2) + env(safe-area-inset-top));
  background: var(--color-bg);
}
.rest-pinned:empty { display: none; }
.rest-pinned .rest-timer { margin-bottom: 0; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.rest-label { font-variant-numeric: tabular-nums; }
.rest-actions { display: flex; gap: var(--space-2); }
.picker-list .row { align-items: flex-start; gap: var(--space-2); }
.illus { background: var(--color-surface-alt); border-radius: var(--radius-sm); flex-shrink: 0; }
.illus-photo { object-fit: cover; border-radius: var(--radius-sm); flex-shrink: 0; }
.row-name { flex: 1; min-width: 0; }
.row-tag {
  flex-shrink: 0;
  white-space: nowrap;
  height: 28px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
}
.picker-list { margin-top: var(--space-4); }
.template-row { display: flex; flex-direction: column; gap: var(--space-2); }
.bar-row { display: grid; grid-template-columns: 4em 1fr auto; gap: var(--space-2); align-items: center; }
.bar-track { height: 8px; border-radius: var(--radius-pill); background: var(--color-surface-alt); }
.bar-fill { display: block; height: 100%; border-radius: var(--radius-pill); background: var(--color-accent); }
.picker-chips { margin-top: var(--space-3); }
.picker-actions { margin-top: var(--space-4); }
.picker-photo { margin-top: var(--space-3); margin-bottom: var(--space-3); }
.chip[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); font-weight: 700; }
button.chip { color: var(--color-text); font-weight: 400; }
.meal-page { padding-bottom: calc(${minTouchTarget}px * 3 + var(--space-8) + env(safe-area-inset-bottom)); }
.meal-page .chips { margin-bottom: var(--space-4); }
.meal-photo { display: block; width: 100%; max-height: 240px; object-fit: cover; border-radius: ${radius.lg}px; margin-bottom: var(--space-4); }
.meal-items:not(:empty) { margin-bottom: var(--space-4); }
.meal-item { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); }
.meal-item + .meal-item { margin-top: 0; }
.meal-item-head { display: flex; flex-direction: column; gap: var(--space-1); }
.ai-tag { margin-left: var(--space-2); padding: 0 var(--space-2); border-radius: var(--radius-pill); background: var(--color-primary-soft); color: var(--color-text); font-size: var(--font-size-caption); font-weight: 400; white-space: nowrap; }
.meal-item-controls { display: flex; align-items: center; gap: var(--space-2); }
.step-btn { min-width: ${minTouchTarget}px; padding: 0; }
.grams-input {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  min-height: ${minTouchTarget}px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-body);
  text-align: center;
}
.food-row { gap: var(--space-2); }
.food-kcal { flex-shrink: 0; }
.food-source { margin: 0; }
.meal-bar { flex-direction: column; gap: var(--space-2); }
.meal-bar p { margin: 0; }
.meal-total { text-align: center; }
.meal-kcal { margin: 0 0 var(--space-2); }
.meal-list { padding: var(--space-2) 0 0; }
.meal-row { gap: var(--space-2); color: inherit; }
.meal-type { flex-shrink: 0; width: 3em; font-weight: 700; }
.meal-row-kcal, .meal-add { flex-shrink: 0; color: var(--color-text-muted); }
.meal-add { color: var(--color-primary); font-weight: 700; }
.splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  text-align: center;
}
.splash .splash-name {
  margin: var(--space-2) 0 0;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: var(--font-size-title);
}
.splash p { margin: 0; }
.splash-logo { animation: splash-breathe 2.4s ease-in-out infinite; }
@keyframes splash-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.skeleton-stack { display: flex; flex-direction: column; gap: var(--space-3); }
.skeleton-stack > .card + .card { margin-top: 0; }
.skeleton-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
.skeleton {
  position: relative;
  display: block;
  overflow: hidden;
  max-width: 100%;
  border-radius: var(--radius-sm);
  background: var(--color-surface-alt);
}
.skeleton.pill { border-radius: var(--radius-pill); }
.skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--color-surface), transparent);
  opacity: 0.6;
  transform: translateX(-100%);
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
@keyframes skeleton-shimmer { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) {
  .splash-logo, .skeleton::after { animation: none; }
  .skeleton::after { display: none; }
}
button {
  min-height: ${minTouchTarget}px;
  padding: 0 var(--space-6);
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-family: inherit;
  font-size: var(--font-size-body);
  font-weight: 700;
  cursor: pointer;
  transition: transform 120ms ease-out, background-color 150ms ease-out, opacity 150ms ease-out;
}
button:active:not(:disabled), a.pill-link:active { transform: scale(0.97); }
button:focus-visible, a:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  button, a.pill-link { transition: none; }
  button:active:not(:disabled), a.pill-link:active { transform: none; }
}

/* ---- Refresh: shared pieces (icons, card headers, numbers) ---- */
:root { --shadow-card: 0 1px 2px rgba(43, 36, 32, 0.04), 0 6px 20px rgba(43, 36, 32, 0.06); }
@media (prefers-color-scheme: dark) { :root { --shadow-card: none; } }
.card { box-shadow: var(--shadow-card); }
.icon { flex-shrink: 0; vertical-align: middle; }
.num { font-variant-numeric: tabular-nums; }
main > h1 { margin-bottom: var(--space-4); }
.card-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
.card-head h2 { flex: 1; margin: 0; }
.card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--color-primary-soft);
  color: var(--color-primary-strong);
  flex-shrink: 0;
}
.card-chevron { color: var(--color-text-muted); }
a.card.link:active { transform: scale(0.99); }
.card-links { gap: var(--space-3); margin-top: var(--space-4); }
.card-links a.pill-link {
  flex: 1;
  justify-content: center;
  gap: var(--space-1);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-text);
  font-weight: 700;
  text-decoration: none;
  transition: transform 120ms ease-out;
}
.card-links a.pill-link.primary { border-color: transparent; background: var(--color-primary); color: var(--color-on-primary); }
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${minTouchTarget}px;
  min-width: ${minTouchTarget}px;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
}
.icon-btn.danger { color: var(--color-danger); }

/* Records */
.records > .card + .card, .records > .card + a.card, .records > a.card + .card { margin-top: var(--space-4); }
.records .metric-value { line-height: 1; }
.weight-row { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); }
.weight-row p { margin: 0; }
.change { align-self: flex-start; font-weight: 700; }
.weight-value { margin-bottom: var(--space-2) !important; }
.change { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--font-size-caption); color: var(--color-text-muted); }
.change.down, .change.up {
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-accent-soft);
  color: var(--color-on-accent-soft);
}
.sparkline { flex-shrink: 0; }
.sparkline path { fill: none; stroke: var(--color-primary); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.stat-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
}
.stat-label { color: var(--color-text-muted); font-size: var(--font-size-caption); }
.stat-value { font-family: var(--font-display); font-weight: 900; font-size: 28px; line-height: 1.1; }
.stat-value small { margin-left: var(--space-1); font-family: var(--font-body); font-weight: 400; font-size: var(--font-size-caption); color: var(--color-text-muted); }

/* Today's intake: ring + macro bars */
.ring { position: relative; flex-shrink: 0; }
.ring svg { display: block; }
.ring-track { fill: none; stroke: var(--color-surface-alt); }
.ring-fill { fill: none; stroke: var(--color-primary); stroke-linecap: round; transition: stroke-dashoffset 600ms ease-out; }
@media (prefers-reduced-motion: reduce) { .ring-fill { transition: none; } }
.ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ring-value { font-family: var(--font-display); font-weight: 900; font-size: 28px; line-height: 1; }
.ring-unit { margin-top: var(--space-1); color: var(--color-text-muted); font-size: 12px; }
.today-kcal { display: flex; align-items: center; gap: var(--space-5); }
.today-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.kcal-left { margin: 0; font-size: var(--font-size-caption); color: var(--color-text-muted); }
.kcal-left strong { color: var(--color-text); font-size: var(--font-size-heading); }
.macro-bars { display: flex; flex-direction: column; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.macro-bar { display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-2); font-size: var(--font-size-caption); }
.macro-bar-num { text-align: right; font-weight: 700; }
.macro-bar .bar-track { grid-column: 1 / -1; height: 6px; }
.macro-bar.protein .bar-fill { background: var(--color-primary); }
.macro-bar.carb .bar-fill { background: var(--color-accent); }
.macro-bar.fat .bar-fill { background: var(--color-text-muted); }
.meal-list { margin-top: var(--space-4); padding: 0; border-top: 1px solid var(--color-border); }
.meal-list .row { border-bottom: 1px solid var(--color-border); min-height: 52px; }
.meal-list .row:last-child { border-bottom: 0; }
.meal-row-kcal { display: inline-flex; align-items: center; gap: 2px; }
.meal-type { color: var(--color-text-muted); font-weight: 700; }
.meal-add {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-primary-soft);
  color: var(--color-primary-strong);
}

/* Active workout */
.workout-head { align-items: center; gap: var(--space-3); }
.workout-head h1 { margin: 0; min-width: 0; }
.elapsed {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-surface-alt);
  color: var(--color-text);
  font-size: var(--font-size-caption);
  font-weight: 700;
}
button.discard-button {
  min-height: 36px;
  margin: var(--space-1) 0 var(--space-2);
  padding: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-caption);
  font-weight: 400;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.workout > .card + .card, .workout > .exercise-card { margin-top: var(--space-4); }
.exercise-card { gap: var(--space-3); }
.exercise-head { align-items: center; gap: var(--space-3); }
.exercise-title { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); }
.exercise-title .exercise-name { line-height: 1.25; }
.exercise-name small { display: block; margin-top: 2px; font-size: var(--font-size-caption); }
.exercise-head .icon-btn { margin-right: calc(var(--space-2) * -1); }
.last-time { margin: 0; }
.explain.hint { display: flex; align-items: flex-start; gap: var(--space-2); margin: 0; }
.explain.hint .icon { margin-top: 3px; }
.set-row { grid-template-columns: 2.6rem 1.3fr 0.9fr 0.9fr 1fr ${minTouchTarget}px; }
.set-head { padding: 0 var(--space-2); }
.set-row.done {
  min-height: ${minTouchTarget}px;
  padding: 0 0 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  font-variant-numeric: tabular-nums;
}
.set-row.done .icon-btn { color: var(--color-on-accent-soft); }
.set-row.done .done-mark { color: var(--color-on-accent-soft); }
.set-row.active { padding: 0 var(--space-2); }
.set-row.cardio-row { grid-template-columns: auto 1fr auto; }
.cardio { display: flex; flex-direction: column; gap: var(--space-2); }
button.add-set {
  min-height: ${minTouchTarget}px;
  border: 1.5px dashed var(--color-border);
  background: transparent;
  color: var(--color-primary);
}
.set-editor .editor-actions > button { flex: 1; }
.bottom-bar { box-shadow: 0 -4px 16px rgba(43, 36, 32, 0.06); }

/* Rest timer */
.rest-timer { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); }
.rest-label { font-size: var(--font-size-heading); }
.rest-actions button.mini { display: inline-flex; align-items: center; gap: 2px; }
.rest-actions button.icon-mini { width: ${minTouchTarget}px; padding: 0; justify-content: center; }

/* Meal edit */
.meal-types { margin-bottom: var(--space-4); }
.meal-types button { min-height: 40px; }
.meal-types button[aria-pressed="true"] { box-shadow: 0 1px 3px rgba(43, 36, 32, 0.12); color: var(--color-primary-strong); }
.meal-item-head { flex-direction: row; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
.meal-item-title { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.meal-item-head .icon-btn { margin: calc(var(--space-2) * -1) calc(var(--space-2) * -1) 0 0; }
.meal-item-controls {
  gap: 0;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-bg);
}
.meal-item-controls:has([aria-invalid="true"]) { border-color: var(--color-danger); }
.meal-item-controls .step-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${minTouchTarget}px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary-strong);
}
.meal-item-controls .grams-input {
  border: 0;
  background: transparent;
  font-weight: 700;
  font-size: var(--font-size-heading);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.meal-item-controls .grams-input:focus-visible { outline: none; }
.meal-item-controls:focus-within { border-color: var(--color-primary); }
.grams-unit { flex: 1; padding-left: var(--space-1); color: var(--color-text-muted); }
.meal-total-row { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.meal-total { margin: 0; }
.meal-total strong { font-family: var(--font-display); font-weight: 900; font-size: var(--font-size-title); }
.meal-total-macros { margin: 0; }
.meal-bar > button { flex: none; width: 100%; }
button.danger-text { color: var(--color-danger); }

/* Shared: list rows with icons, quiet buttons, danger */
.list h2 { margin-bottom: var(--space-1); }
.list .row { gap: var(--space-3); min-height: 52px; border-bottom: 1px solid var(--color-border); }
.list .row:last-of-type { border-bottom: 0; }
.list .row:disabled { opacity: 0.55; }
.row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--color-surface-alt);
  color: var(--color-text);
  flex-shrink: 0;
}
.row-chevron { color: var(--color-text-muted); }
.list .row.danger-row { color: var(--color-danger); }
.danger-row .row-icon { color: var(--color-danger); }
.settings > .card + .card { margin-top: var(--space-4); }
button.danger { background: var(--color-danger); color: var(--color-on-primary); }
button.secondary.quiet { border-color: var(--color-border); color: var(--color-text); }
button.block { width: 100%; }

/* Body metrics */
.body-page .body-main .card-head { margin-bottom: 0; }
.body-page .metric-value { line-height: 1; }
.body-page .stack > .change { margin-top: calc(var(--space-2) * -1); }
.tiles button.tile { gap: var(--space-2); box-shadow: var(--shadow-card); }
.tile-change { color: var(--color-text-muted); font-size: var(--font-size-caption); font-variant-numeric: tabular-nums; }
.body-tip { margin: var(--space-4) 0; text-align: center; }

/* Workout history */
.history > .card + .card { margin-top: var(--space-4); }
.history > button.secondary { width: 100%; margin-top: var(--space-4); }
.history-card .card-head { margin-bottom: var(--space-1); }
.history-stats { margin: 0 0 var(--space-3) calc(36px + var(--space-3)); }
.history-item { padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.history-item + .history-item { margin-top: var(--space-3); }
.history-item h3 { margin: 0 0 var(--space-2); }
.history-sets { display: flex; flex-direction: column; gap: var(--space-1); }
.history-sets p { color: var(--color-text-muted); font-size: 15px; }

/* Profile */
.stepbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); }
.stepbar .step { margin: 0; }
.stepbar-track { display: flex; gap: var(--space-1); width: 96px; }
.stepbar-track span { flex: 1; height: 6px; border-radius: var(--radius-pill); background: var(--color-surface-alt); }
.stepbar-track span.on { background: var(--color-primary); }
.profile > h1 { margin-bottom: var(--space-4); }
.chips.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); }
.chips.split .chip { justify-content: center; }
.chip { transition: background-color 150ms ease-out, border-color 150ms ease-out; }
.chip.selected { color: var(--color-primary-strong); border-width: 1.5px; }
.chips.column .chip { gap: var(--space-3); min-height: 52px; border-radius: var(--radius-md); }
.chips.column .chip::before {
  content: "";
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  border: 2px solid var(--color-border);
  border-radius: 50%;
  flex-shrink: 0;
}
.chips.column .chip.selected::before { border: 5px solid var(--color-primary); }
.profile .kcal { padding: var(--space-2) 0; }
.profile .kcal-num { line-height: 1; }
.macro { border-top: 3px solid transparent; }
.macro.protein { border-top-color: var(--color-primary); }
.macro.carb { border-top-color: var(--color-accent); }
.macro.fat { border-top-color: var(--color-text-muted); }
`;
}
