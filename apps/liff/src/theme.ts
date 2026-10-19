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
