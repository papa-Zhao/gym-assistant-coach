export const UNKNOWN_FLOOR_KCAL = 1500;

export const MEDICAL_KEYWORDS: readonly string[] = [
  "受傷",
  "拉傷",
  "扭傷",
  "疼痛",
  "劇痛",
  "刺痛",
  "關節痛",
  "腰痛",
  "膝蓋痛",
  "疾病",
  "生病",
  "懷孕",
  "孕",
  "哺乳",
  "厭食",
  "暴食",
  "催吐",
  "飲食疾患",
  "飲食失調",
  "糖尿病",
  "高血壓",
  "心臟",
  "腎臟",
  "痛風",
  "手術",
  "吃藥",
  "藥物",
];

export const MEDICAL_NOTICE =
  "提到受傷、疼痛、疾病或懷孕時，請先諮詢醫師或專業人員，這裡的建議不能當作處方。";

export function needsMedicalNotice(...texts: string[]): boolean {
  return texts.some((t) => MEDICAL_KEYWORDS.some((k) => t.includes(k)));
}

// A daily marker, up to 20 non-digit chars, then a number followed by a kcal unit.
const DAILY_KCAL =
  /(?:每天|每日|一天|一日)[^\d]{0,20}?(\d{1,3}(?:,\d{3})+|\d+)\s*(?:kcal|大卡|卡)/gi;

/** Warning when the text suggests a daily intake below floorKcal; else null. */
export function lowKcalWarning(text: string, floorKcal: number): string | null {
  for (const m of text.matchAll(DAILY_KCAL)) {
    const kcal = Number((m[1] as string).replaceAll(",", ""));
    if (kcal < floorKcal) return `提醒：每天熱量建議不低於 ${floorKcal} kcal。`;
  }
  return null;
}
