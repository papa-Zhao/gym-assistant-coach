import {
  calcTargets,
  floorKcal,
  isBelowFloor,
  taipeiDate,
  validateProfile,
  type ApiError,
  type ProfileInput,
  type ProfileResponse,
  type Targets,
} from "@gac/shared";
import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler, bearerAuth } from "../http.js";
import type { AppDeps } from "../deps.js";
import { verifySession } from "../auth/session";
import {
  getProfile,
  overrideTargets,
  saveProfile,
  type StoredProfile,
} from "./repo";

const profileSchema = {
  body: {
    type: "object",
    required: [
      "sex",
      "birthYear",
      "heightCm",
      "weightKg",
      "activityLevel",
      "goal",
    ],
    additionalProperties: false,
    properties: {
      sex: { enum: ["male", "female"] },
      birthYear: { type: "integer" },
      heightCm: { type: "number" },
      weightKg: { type: "number" },
      activityLevel: {
        enum: ["sedentary", "light", "moderate", "active", "very_active"],
      },
      goal: { enum: ["cut", "maintain", "bulk"] },
    },
  },
} as const;

const targetInt = { type: "integer", minimum: 1, maximum: 10000 } as const;
const targetsSchema = {
  body: {
    type: "object",
    required: ["kcal", "proteinG", "carbG", "fatG"],
    additionalProperties: false,
    properties: {
      kcal: targetInt,
      proteinG: targetInt,
      carbG: targetInt,
      fatG: targetInt,
    },
  },
} as const;

declare module "fastify" {
  interface FastifyRequest {
    profileUserId?: string;
  }
}

export const profileRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, sessionSecret, now } = deps;

    app.setErrorHandler(apiErrorHandler);

    const authenticate = bearerAuth(
      (token) => verifySession(sessionSecret, token),
      (req, { userId }) => {
        req.profileUserId = userId;
      },
    );

    const toResponse = (
      stored: StoredProfile | null,
      today: string,
    ): ProfileResponse => {
      if (!stored) {
        return {
          profile: null,
          targets: null,
          floorKcal: null,
          belowFloor: false,
        };
      }
      const { targets, targetsOverridden, ...input } = stored;
      return {
        profile: { ...input, targetsOverridden },
        targets,
        floorKcal: floorKcal(input.sex, calcTargets(input, today).bmr),
        belowFloor: isBelowFloor(input, targets.kcal, today),
      };
    };

    app.get(
      "/profile",
      { onRequest: authenticate },
      async (req): Promise<ProfileResponse> =>
        toResponse(
          await getProfile(db, req.profileUserId as string),
          taipeiDate(now()),
        ),
    );

    app.put<{ Body: ProfileInput }>(
      "/profile",
      { onRequest: authenticate, schema: profileSchema },
      async (req, reply) => {
        const today = taipeiDate(now());
        if (validateProfile(req.body, today).length > 0) {
          return reply
            .code(400)
            .send({ error: "bad_request" } satisfies ApiError);
        }
        const userId = req.profileUserId as string;
        await saveProfile(db, userId, req.body, today);
        return toResponse(await getProfile(db, userId), today);
      },
    );

    app.put<{ Body: Targets }>(
      "/profile/targets",
      { onRequest: authenticate, schema: targetsSchema },
      async (req, reply) => {
        const userId = req.profileUserId as string;
        if (!(await getProfile(db, userId))) {
          return reply.code(409).send({ error: "conflict" } satisfies ApiError);
        }
        await overrideTargets(db, userId, req.body);
        return toResponse(await getProfile(db, userId), taipeiDate(now()));
      },
    );
  };
