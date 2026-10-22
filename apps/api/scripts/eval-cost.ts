// USD per million tokens for claude-haiku-5-5 (prompts <= 100K tokens).
// Cache figures are assumed multipliers of the input price (read 0.1x,
// write 1.25x), not published rates. Estimate only.
const INPUT_PRICE = 0.1;
export const PRICE_PER_MTOK = {
  input: INPUT_PRICE,
  output: 0.5,
  cacheRead: INPUT_PRICE * 0.1,
  cacheWrite: INPUT_PRICE * 1.25,
};

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

/** Estimated USD cost of one request's token usage. */
export function usageCost(u: Usage): number {
  return (
    (u.input * PRICE_PER_MTOK.input +
      u.output * PRICE_PER_MTOK.output +
      u.cacheRead * PRICE_PER_MTOK.cacheRead +
      u.cacheCreation * PRICE_PER_MTOK.cacheWrite) /
    1_000_000
  );
}
