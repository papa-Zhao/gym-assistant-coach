export const AI_MODEL = "claude-haiku-5-5";
/** Thinking tokens count toward max_tokens, so keep this generous. */
export const MEAL_TEXT_MAX_TOKENS = 4000;
export const MEAL_PHOTO_MAX_TOKENS = 4000;
/**
 * Client settings so the api answers before the bot's 30 s meal-call timeout:
 * worst case is one 20 s attempt, no retries.
 */
export const AI_CLIENT_TIMEOUT_MS = 20_000;
export const AI_CLIENT_MAX_RETRIES = 0;
export const EQUIPMENT_PHOTO_MAX_TOKENS = 4000;
export const ASK_MAX_TOKENS = 4000;
