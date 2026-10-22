import {
  EQUIPMENT,
  EQUIPMENT_CATEGORIES,
  EXERCISE_KINDS,
  MUSCLE_GROUPS,
  equipmentCategory,
  type Equipment,
  type EquipmentCategory,
  type Exercise,
  type ExerciseKind,
  type MuscleGroup,
  MEAL_PHOTO_MAX_BYTES,
  type ApiError,
  type IdentifyEquipmentResponse,
} from "@gac/shared";
import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler } from "../http.js";
import type { AppDeps } from "../deps.js";
import {
  archiveCustomExercise,
  createCustomExercise,
  listExercises,
} from "./repo";
import { identifyEquipment } from "./identify";
import { badRequest, sendWorkoutError, workoutAuth } from "./http";

const listSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      q: { type: "string", maxLength: 60 },
      muscle: { type: "string", enum: [...MUSCLE_GROUPS] },
      category: { type: "string", enum: [...EQUIPMENT_CATEGORIES] },
      kind: { type: "string", enum: [...EXERCISE_KINDS] },
    },
  },
} as const;

const createSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["nameZh", "kind", "equipment"],
    properties: {
      nameZh: { type: "string", minLength: 1, maxLength: 30 },
      nameEn: { type: "string", minLength: 1, maxLength: 60 },
      kind: { type: "string", enum: [...EXERCISE_KINDS] },
      muscleGroup: { type: "string", enum: [...MUSCLE_GROUPS] },
      equipment: { type: "string", enum: [...EQUIPMENT] },
    },
  },
} as const;

const idSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
} as const;

interface CreateBody {
  nameZh: string;
  nameEn?: string;
  kind: ExerciseKind;
  muscleGroup?: MuscleGroup;
  equipment: Equipment;
}

export const exerciseRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, sessionSecret } = deps;
    app.setErrorHandler(apiErrorHandler);
    const authenticate = workoutAuth(sessionSecret);

    // Photo bytes arrive raw from the LIFF. Registered in this plugin only,
    // and only /exercises/identify reads them.
    app.addContentTypeParser(
      "application/octet-stream",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );

    app.post(
      "/exercises/identify",
      { onRequest: authenticate, bodyLimit: MEAL_PHOTO_MAX_BYTES },
      async (req, reply): Promise<IdentifyEquipmentResponse> => {
        if (!Buffer.isBuffer(req.body)) {
          return reply
            .code(415)
            .send({ error: "unsupported_media_type" } satisfies ApiError);
        }
        return identifyEquipment(
          {
            db,
            identifier: deps.equipmentIdentifier,
            now: deps.now,
          },
          req.workoutUserId as string,
          req.body,
        );
      },
    );

    app.get<{
      Querystring: {
        q?: string;
        muscle?: MuscleGroup;
        category?: EquipmentCategory;
        kind?: ExerciseKind;
      };
    }>(
      "/exercises",
      { onRequest: authenticate, schema: listSchema },
      async (req): Promise<Exercise[]> =>
        listExercises(db, req.workoutUserId as string, req.query),
    );

    app.post<{ Body: CreateBody }>(
      "/exercises",
      { onRequest: authenticate, schema: createSchema },
      async (req, reply) => {
        const b = req.body;
        const nameZh = b.nameZh.trim();
        const nameEn = b.nameEn?.trim();
        if (nameZh.length < 1 || nameEn?.length === 0) return badRequest(reply);
        const cardioGear =
          equipmentCategory(b.equipment) === "cardio_equipment";
        if (b.kind === "strength") {
          if (!b.muscleGroup || cardioGear) return badRequest(reply);
        } else if (b.muscleGroup !== undefined || !cardioGear) {
          return badRequest(reply);
        }
        const created = await createCustomExercise(
          db,
          req.workoutUserId as string,
          {
            nameZh,
            nameEn: nameEn ?? null,
            kind: b.kind,
            muscleGroup: b.muscleGroup ?? null,
            equipment: b.equipment,
          },
        );
        return reply.code(201).send(created);
      },
    );

    app.delete<{ Params: { id: string } }>(
      "/exercises/:id",
      { onRequest: authenticate, schema: idSchema },
      async (req, reply) => {
        try {
          await archiveCustomExercise(
            db,
            req.workoutUserId as string,
            req.params.id,
          );
        } catch (err) {
          return sendWorkoutError(reply, err);
        }
        return reply.code(204).send();
      },
    );
  };
