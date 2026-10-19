import type { TodayWorkoutSummary } from "./repo";

const KG = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** One-line summary of today's finished workouts for the bot's today card. */
export function formatWorkoutSummary(s: TodayWorkoutSummary): string {
  const name = s.templateName ?? "訓練";
  const parts = [`${name}・${s.exerciseCount} 個動作`];
  if (s.setCount > 0) parts[0] += `・${KG.format(s.volumeKg)} kg`;
  if (s.cardioMinutes > 0) parts.push(`有氧 ${s.cardioMinutes} 分鐘`);
  return parts.join("・");
}
