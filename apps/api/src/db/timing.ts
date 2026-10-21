import { AsyncLocalStorage } from "node:async_hooks";
import type { Sql } from "postgres";

/** Database work done while serving one request. */
export interface DbStats {
  queries: number;
  ms: number;
}

const store = new AsyncLocalStorage<DbStats>();

export const newDbStats = (): DbStats => ({ queries: 0, ms: 0 });

/** Runs `fn` so every instrumented query inside it is counted in `stats`. */
export const withDbStats = <T>(stats: DbStats, fn: () => T): T =>
  store.run(stats, fn);

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof (v as { then?: unknown } | null)?.then === "function";

/** Counts a query when it is awaited (postgres.js sends it lazily). Outside a request nothing is counted. */
function timed<T extends object>(pending: T): T {
  return new Proxy(pending, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== "function") return value;
      if (prop === "then") {
        return (
          onFulfilled?: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => {
          const stats = store.getStore();
          const start = performance.now();
          const done = () => {
            if (!stats) return;
            stats.queries += 1;
            stats.ms += performance.now() - start;
          };
          return (value as PromiseLike<unknown>["then"]).call(
            target,
            (v) => (done(), onFulfilled ? onFulfilled(v) : v),
            (e) => {
              done();
              if (onRejected) return onRejected(e);
              throw e;
            },
          );
        };
      }
      // `.values()`, `.execute()` and friends return another pending query.
      return (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown).apply(
          target,
          args,
        );
        // postgres.js returns the same pending query from `.values()`.
        if (result === target) return receiver;
        return isThenable(result) ? timed(result) : result;
      };
    },
  });
}

/**
 * Wraps a postgres.js client so each query run during a request adds to that
 * request's {@link DbStats}. Only counts and durations are recorded, never SQL
 * text or parameters.
 */
export function instrument<S extends Sql>(sql: S): S {
  const wrap = <T extends object>(client: T): T =>
    new Proxy(client, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown;
        if (prop === "unsafe" && typeof value === "function") {
          return (...args: unknown[]) =>
            timed((value as (...a: unknown[]) => object).apply(target, args));
        }
        if (prop === "begin" && typeof value === "function") {
          // Queries inside a transaction go through its own client.
          return (...args: unknown[]) => {
            const i = args.findIndex((a) => typeof a === "function");
            const fn = args[i] as (tx: object) => unknown;
            args[i] = (tx: object) => fn(wrap(tx));
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return value;
      },
    });
  return wrap(sql);
}
