/**
 * GET /me/export: everything the user has stored, as plain JSON. Times are ISO
 * strings. Leaves out the LINE id, photo keys and photos, other users' data and
 * the built-in exercise and food databases (records carry names instead).
 */
export interface DataExport {
  exportedAt: string;
  account: { displayName: string | null; createdAt: string };
  consents: { doc: string; version: string; agreedAt: string }[];
  profile: Record<string, unknown> | null;
  bodyMetrics: Record<string, unknown>[];
  /** Each with items (exercise names), sets and cardio. */
  workoutSessions: Record<string, unknown>[];
  /** Each with items (exercise names). */
  workoutTemplates: Record<string, unknown>[];
  customExercises: Record<string, unknown>[];
  /** Each with items (food names); no photos. */
  meals: Record<string, unknown>[];
  customFoods: Record<string, unknown>[];
  /** Each with messages. */
  aiConversations: Record<string, unknown>[];
  aiPrograms: Record<string, unknown>[];
  aiUsage: { day: string; kind: string; count: number }[];
}
