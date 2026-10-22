export const AI_MODEL = "claude-haiku-5-5";
/** Thinking tokens count toward max_tokens, so keep this generous. */
export const MEAL_TEXT_MAX_TOKENS = 4000;
/** Client settings so the whole webhook can answer within LINE's deadline. */
export const AI_CLIENT_TIMEOUT_MS = 20_000;
export const AI_CLIENT_MAX_RETRIES = 1;
