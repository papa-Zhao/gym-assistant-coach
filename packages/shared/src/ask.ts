export const ASK_MAX_CHARS = 500;

export interface AdviceItem {
  name: string;
  detail: string;
}

export interface ProgramItem {
  nameZh: string;
  sets: number;
  reps: number;
}

export interface ProgramDay {
  name: string;
  items: ProgramItem[];
}

export interface Program {
  id: string;
  days: ProgramDay[];
}

export interface Advice {
  title: string;
  items: AdviceItem[];
  body: string;
  todayLine: string | null;
  notices: string[];
  program: Program | null;
}

export type AskResponse =
  | { outcome: "answer"; advice: Advice }
  | { outcome: "limit" | "refused" | "unavailable" };

export interface SaveProgramDayResponse {
  outcome: "saved" | "already_saved";
  templateName: string;
}
