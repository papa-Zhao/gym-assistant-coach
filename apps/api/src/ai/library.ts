import {
  EQUIPMENT_LABELS,
  MUSCLE_GROUP_LABELS,
  type Exercise,
} from "@gac/shared";

export interface LibraryView {
  /** Changes whenever any prompt-visible field of the library changes. */
  key: string;
  slugs: string[];
  /** One line per exercise: slug｜中文名｜器材｜肌群. */
  lines: string[];
}

export function deepFreeze<T extends object>(o: T): T {
  for (const v of Object.values(o)) {
    if (typeof v === "object" && v !== null) deepFreeze(v);
  }
  return Object.freeze(o);
}

/** Exercises without a slug (custom ones) never reach the model. */
export function libraryView(library: Exercise[]): LibraryView {
  const rows = library.filter(
    (e): e is Exercise & { slug: string } => e.slug !== null,
  );
  return {
    key: rows
      .map((e) =>
        [e.slug, e.nameZh, e.equipment, e.muscleGroup ?? ""].join("|"),
      )
      .join("\n"),
    slugs: rows.map((e) => e.slug),
    lines: rows.map((e) =>
      [
        e.slug,
        e.nameZh,
        EQUIPMENT_LABELS[e.equipment],
        e.muscleGroup ? MUSCLE_GROUP_LABELS[e.muscleGroup] : "—",
      ].join("｜"),
    ),
  };
}
