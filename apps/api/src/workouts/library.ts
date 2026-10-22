import type { Exercise } from "@gac/shared";
import type { Db } from "../users/repo";
import { listBuiltinExercises } from "./repo";

/** Plain code-unit order on slug; independent of database collation. */
export const bySlugOrder = (a: Exercise, b: Exercise): number =>
  a.slug! < b.slug! ? -1 : a.slug! > b.slug! ? 1 : 0;

// The built-in list never changes at runtime; keep the first read so the
// model gets the same list (and prompt cache prefix) on every call.
let builtinLibrary: Promise<Exercise[]> | undefined;

export function getBuiltinLibrary(db: Db): Promise<Exercise[]> {
  if (!builtinLibrary) {
    const loading = listBuiltinExercises(db).then((rows) =>
      [...rows].sort(bySlugOrder),
    );
    // A failed read must not stick.
    loading.catch(() => {
      if (builtinLibrary === loading) builtinLibrary = undefined;
    });
    builtinLibrary = loading;
  }
  return builtinLibrary;
}

/** Clears the remembered built-in list. Exists for tests only. */
export function resetBuiltinLibraryCache(): void {
  builtinLibrary = undefined;
}
