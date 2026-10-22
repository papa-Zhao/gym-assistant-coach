export const ASK_MAX_CHARS = 500;

export interface AdviceItem {
  name: string;
  detail: string;
}

export interface Advice {
  title: string;
  items: AdviceItem[];
  body: string;
  todayLine: string | null;
  notices: string[];
}

export type AskResponse =
  | { outcome: "answer"; advice: Advice }
  | { outcome: "limit" | "refused" | "unavailable" };
