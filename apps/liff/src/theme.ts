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
.set-row { display: grid; grid-template-columns: 1fr 1.4fr 1fr 1fr; gap: var(--space-2); align-items: center; }
.set-row.done { grid-template-columns: 1fr 1.4fr 1fr 1fr auto; }
.set-row.cardio-row { grid-template-columns: auto 1fr auto; }
.set-head { color: var(--color-text-muted); font-size: var(--font-size-caption); }
.done-mark { color: var(--color-accent); font-weight: 700; }
.set-no { font-weight: 700; }
.set-cell input {
  box-sizing: border-box;
  width: 100%;
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
.rest-timer {
  position: sticky;
  top: 0;
  z-index: 1;
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
.rest-pinned {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--space-3) var(--space-4) 0;
  background: var(--color-bg);
}
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
.chip[aria-pressed="true"] { background: var(--color-primary-soft); border-color: var(--color-primary); font-weight: 700; }
button.chip { color: var(--color-text); font-weight: 400; }
.meal-page { padding-bottom: calc(${minTouchTarget}px * 3 + var(--space-8) + env(safe-area-inset-bottom)); }
.meal-page .chips { margin-bottom: var(--space-4); }
.meal-items:not(:empty) { margin-bottom: var(--space-4); }
.meal-item { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); }
.meal-item + .meal-item { margin-top: 0; }
.meal-item-head { display: flex; flex-direction: column; gap: var(--space-1); }
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
}
`;
}
