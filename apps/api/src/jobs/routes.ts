import type { FastifyPluginAsync } from "fastify";
import { apiErrorHandler, bearerAuth } from "../http.js";
import type { AppDeps } from "../deps.js";
import { purgeExpiredMessages } from "../ask/repo";
import { purgeDeletedUsers } from "./purge";

/** Scheduled work, called by Cloud Scheduler only (its own service account). */
export const jobRoutes =
  (deps: AppDeps): FastifyPluginAsync =>
  async (app) => {
    const { db, verifyServiceToken, schedulerServiceAccount, photoStore, now } =
      deps;

    app.addHook(
      "onRequest",
      bearerAuth(async (token) => {
        const { email } = await verifyServiceToken(token);
        if (email !== schedulerServiceAccount) throw new Error("wrong service");
      }),
    );

    app.setErrorHandler(apiErrorHandler);

    // The jobs take no body; ignore whatever content type the caller sends.
    app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, _body, done) =>
      done(null, undefined),
    );

    app.post("/daily", async (req): Promise<{ deletedUsers: number }> => {
      const started = Date.now();
      const clock = now();
      const deletedUsers = await purgeDeletedUsers(
        db,
        photoStore,
        clock,
        req.log,
      );
      await purgeExpiredMessages(db, clock);
      // Counts only: no user ids.
      req.log.info(
        { event: "daily_job", deletedUsers, ms: Date.now() - started },
        "daily job done",
      );
      return { deletedUsers };
    });
  };
