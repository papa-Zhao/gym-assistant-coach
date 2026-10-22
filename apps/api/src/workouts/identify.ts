import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MUSCLE_GROUPS,
  equipmentCategory,
  type Equipment,
  type Exercise,
  type IdentifyEquipmentResponse,
  type MuscleGroup,
} from "@gac/shared";
import type {
  EquipmentGuess,
  EquipmentIdentifier,
} from "../ai/equipment-identifier";
import { withAiUse } from "../ai/usage";
import { InvalidImage, normalizePhoto } from "../photos/image";
import type { Db } from "../users/repo";
import { getBuiltinLibrary } from "./library";

const MAX_CANDIDATES = 5;
const MAX_NAME_CHARS = 30;

const isEquipment = (v: string): v is Equipment =>
  (EQUIPMENT as readonly string[]).includes(v);
const isMuscleGroup = (v: string): v is MuscleGroup =>
  (MUSCLE_GROUPS as readonly string[]).includes(v);

/**
 * Normalizes the photo (a bad one costs no use), asks the identifier, and
 * validates everything it said: unknown equipment becomes not_equipment,
 * candidates are limited to built-in exercises.
 */
export async function identifyEquipment(
  deps: { db: Db; identifier: EquipmentIdentifier; now: () => Date },
  userId: string,
  image: Buffer,
): Promise<IdentifyEquipmentResponse> {
  let jpeg: Buffer;
  try {
    jpeg = await normalizePhoto(image);
  } catch (err) {
    if (err instanceof InvalidImage) return { outcome: "invalid_image" };
    throw err;
  }

  const library = await getBuiltinLibrary(deps.db);
  const used = await withAiUse(deps.db, userId, "photo", deps.now(), () =>
    deps.identifier.identify(jpeg, library),
  );
  if (used.kind !== "done") return { outcome: used.kind };

  const result = used.result;
  if (result.kind !== "guess") return { outcome: result.kind };
  return shapeGuess(result.guess, library);
}

/**
 * Turns the identifier's guess into the response: unknown or "none"
 * equipment is not_equipment, candidates are limited to known built-in
 * slugs (deduped, in the AI's order, max 5), and the suggestion is derived.
 */
export function shapeGuess(
  guess: EquipmentGuess,
  library: Exercise[],
): IdentifyEquipmentResponse {
  if (!isEquipment(guess.equipment) || guess.equipment === "none") {
    return { outcome: "not_equipment" };
  }
  const equipment = guess.equipment;

  const bySlug = new Map<string, Exercise>();
  for (const e of library) if (e.slug !== null) bySlug.set(e.slug, e);
  const candidates: Exercise[] = [];
  for (const slug of new Set(guess.candidates)) {
    const e = bySlug.get(slug);
    if (e) candidates.push(e);
    if (candidates.length === MAX_CANDIDATES) break;
  }

  const nameZh =
    Array.from(guess.nameZh.trim())
      .slice(0, MAX_NAME_CHARS)
      .join("")
      .trimEnd() || EQUIPMENT_LABELS[equipment];
  const cardio = equipmentCategory(equipment) === "cardio_equipment";
  const muscleGroup =
    !cardio && isMuscleGroup(guess.muscleGroup) ? guess.muscleGroup : null;
  return {
    outcome: "found",
    equipment,
    candidates,
    suggestion: {
      nameZh,
      kind: cardio ? "cardio" : "strength",
      muscleGroup,
      equipment,
    },
  };
}
