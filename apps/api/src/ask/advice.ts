import type { Advice } from "@gac/shared";
import type { RawAdvice } from "../ai/advisor";
import { lowKcalWarning, MEDICAL_NOTICE, needsMedicalNotice } from "./safety";

export const DISCLAIMER = "AI 建議僅供參考，不能取代醫師或營養師的專業意見。";

const MAX_TITLE = 30;
const MAX_ITEMS = 3;
const MAX_ITEM_TEXT = 40;
const MAX_BODY = 800;

/** Trims, then truncates by code point. */
function clip(text: string, max: number): string {
  return Array.from(text.trim()).slice(0, max).join("").trimEnd();
}

/** Truncates and fills defaults; adds notices (medical first, then kcal). */
export function shapeAdvice(
  raw: RawAdvice,
  opts: { question: string; floorKcal: number; todayLine: string | null },
): Advice {
  const items: Advice["items"] = [];
  for (const item of raw.items) {
    const name = clip(item.name, MAX_ITEM_TEXT);
    if (name === "") continue;
    items.push({ name, detail: clip(item.detail, MAX_ITEM_TEXT) });
    if (items.length === MAX_ITEMS) break;
  }
  const title = clip(raw.title, MAX_TITLE) || "AI 建議";
  const body = clip(raw.body, MAX_BODY);

  const texts = [title, ...items.flatMap((i) => [i.name, i.detail]), body];
  const notices: string[] = [];
  if (needsMedicalNotice(opts.question, ...texts)) notices.push(MEDICAL_NOTICE);
  const kcal = texts
    .map((t) => lowKcalWarning(t, opts.floorKcal))
    .find((w) => w !== null);
  if (kcal) notices.push(kcal);
  return { title, items, body, todayLine: opts.todayLine, notices };
}

/** Plain-text form stored as the assistant turn. */
export function adviceText(a: Advice): string {
  return [
    a.title,
    ...a.items.map((i) =>
      i.detail ? `・${i.name}（${i.detail}）` : `・${i.name}`,
    ),
    a.body,
  ].join("\n");
}
