import type { DataExport } from "@gac/shared";
import { apiFetch } from "./api";

/** Fetches GET /me/export and returns the file name and JSON text to save. */
export async function fetchExport(
  today: string,
): Promise<{ fileName: string; json: string }> {
  const data = await apiFetch<DataExport>("/me/export");
  return {
    fileName: `gym-coach-export-${today}.json`,
    json: JSON.stringify(data, null, 2),
  };
}

/** Calls DELETE /me. */
export async function deleteAccount(): Promise<void> {
  await apiFetch<void>("/me", { method: "DELETE" });
}

/** Saves text as a download via a Blob URL and a temporary <a download>. */
export function saveFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
