import {
  GRAMS_LIMITS,
  MAX_MEAL_ITEMS,
  MEAL_TYPES,
  isValidGrams,
  taipeiDate,
  type ApiError,
  type DayMeals,
  type Food,
  type MealDetail,
  type MealInput,
} from "@gac/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { apiErrorHandler } from "../http.js";
import type { AppDeps } from "../deps.js";
import { withPhotoDeadline } from "../photos/store";
import { errName } from "./photo";
import { workoutAuth } from "../workouts/http";
import {
  MealInputError,
  createMeal,
  deleteMeal,
  getMeal,
  listDayMeals,
  mealPhotoKey,
  searchFoods,
  updateMeal,
} from "./repo";

const uuid = { type: "string", format: "uuid" } as const;
const mealType = { enum: [...MEAL_TYPES] } as const;

// Exactly one of id (keep an existing item) or foodId (add a new one).
// Fine decimals are checked in the handler: Ajv multipleOf is float-unsafe.
const itemsSchema = {
  type: "array",
  minItems: 1,
  maxItems: MAX_MEAL_ITEMS,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["grams"],
    properties: {
      id: uuid,
      foodId: uuid,
      grams: {
        type: "number",
        minimum: GRAMS_LIMITS.min,
        maximum: GRAMS_LIMITS.max,
      },
    },
    oneOf: [{ required: ["id"] }, { required: ["foodId"] }],
  },
} as const;

const searchSchema = {
  querystring: {
    type: "object",
    required: ["q"],
    properties: { q: { type: "string", minLength: 1, maxLength: 40 } },
  },
} as const;

const daySchema = {
  querystring: {
    type: "object",
    properties: { date: { type: "string", format: "date" } },
  },
} as const;

const idSchema = {
  params: { type: "object", required: ["id"], properties: { id: uuid } },
} as const;

const createSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["eatenOn", "mealType", "items"],
    properties: {
      eatenOn: { type: "string", format: "date" },
      mealType,
      items: itemsSchema,
    },
  },
} as const;

const updateSchema = {
  ...idSchema,
  body: {
    type: "object",
    additionalProperties: false,
    required: ["mealType", "items"],
    properties: { mealType, items: itemsSchema },
  },
} as const;

const notFound = (reply: FastifyReply) =>
  reply.code(404).send({ error: "not_found" } satisfies ApiError);

const invalidGrams = (reply: FastifyReply) =>
  reply.code(400).send({ error: "invalid_grams" } satisfies ApiError);

/** Maps a typed MealInputError to 400 { error: code }; rethrows the rest. */
function sendInputError(reply: FastifyReply, err: unknown) {
  if (!(err instanceof MealInputError)) throw err;
  return reply.code(400).send({ error: err.code } satisfies ApiError);
}

/**
 * Ajv coerces "150" to 150 before the schema runs, so reject string grams on
 * the raw body first.
 */
async function requireNumericGrams(req: FastifyRequest, reply: FastifyReply) {
  const items = (req.body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const grams = (item as { grams?: unknown } | null)?.grams;
    if (grams !== undefined && typeof grams !== "number") {
      return reply.code(400).send({ error: "bad_request" } satisfies ApiError);
    }
  }
}

export const mealRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, sessionSecret, now, photoStore } = deps;
    app.setErrorHandler(apiErrorHandler);
    const auth = { onRequest: workoutAuth(sessionSecret) };
    const write = { ...auth, preValidation: requireNumericGrams };
    const uid = (req: { workoutUserId?: string }) =>
      req.workoutUserId as string;

    app.get<{ Querystring: { q: string } }>(
      "/foods",
      { ...auth, schema: searchSchema },
      async (req, reply) => {
        const q = req.query.q.trim();
        if (!q) {
          return reply
            .code(400)
            .send({ error: "bad_request" } satisfies ApiError);
        }
        return { foods: await searchFoods(db, q) } satisfies {
          foods: Food[];
        };
      },
    );

    app.get<{ Querystring: { date?: string } }>(
      "/meals",
      { ...auth, schema: daySchema },
      async (req): Promise<DayMeals> => {
        const clock = now();
        return listDayMeals(
          db,
          uid(req),
          req.query.date ?? taipeiDate(clock),
          clock,
        );
      },
    );

    app.get<{ Params: { id: string } }>(
      "/meals/:id",
      { ...auth, schema: idSchema },
      async (req, reply): Promise<MealDetail | FastifyReply> => {
        const meal = await getMeal(db, uid(req), req.params.id);
        if (!meal) return notFound(reply);
        const key = await mealPhotoKey(db, uid(req), req.params.id);
        let photoUrl: string | null = null;
        if (key !== null) {
          try {
            photoUrl = await photoStore.signedUrl(key);
          } catch (err) {
            req.log.warn(
              { event: "meal_photo_sign_failed", errName: errName(err) },
              "meal photo signing failed",
            );
          }
        }
        return { ...meal, photoUrl };
      },
    );

    app.post<{ Body: MealInput }>(
      "/meals",
      { ...write, schema: createSchema },
      async (req, reply) => {
        if (!req.body.items.every((i) => isValidGrams(i.grams))) {
          return invalidGrams(reply);
        }
        try {
          const meal = await createMeal(
            db,
            uid(req),
            req.body,
            "manual",
            now(),
          );
          return reply.code(201).send(meal);
        } catch (err) {
          return sendInputError(reply, err);
        }
      },
    );

    app.put<{ Params: { id: string }; Body: Omit<MealInput, "eatenOn"> }>(
      "/meals/:id",
      { ...write, schema: updateSchema },
      async (req, reply) => {
        if (!req.body.items.every((i) => isValidGrams(i.grams))) {
          return invalidGrams(reply);
        }
        try {
          const meal = await updateMeal(
            db,
            uid(req),
            req.params.id,
            req.body,
            now(),
          );
          return meal ?? notFound(reply);
        } catch (err) {
          return sendInputError(reply, err);
        }
      },
    );

    app.delete<{ Params: { id: string } }>(
      "/meals/:id",
      { ...auth, schema: idSchema },
      async (req, reply) => {
        const deleted = await deleteMeal(db, uid(req), req.params.id);
        if (!deleted) return notFound(reply);
        await Promise.all(
          deleted.photoKeys.map(async (key) => {
            try {
              await withPhotoDeadline(
                () => photoStore.delete(key),
                deps.photoTimeoutMs,
              );
            } catch (err) {
              req.log.warn(
                { event: "meal_photo_delete_failed", errName: errName(err) },
                "meal photo delete failed",
              );
            }
          }),
        );
        return reply.code(204).send();
      },
    );
  };
