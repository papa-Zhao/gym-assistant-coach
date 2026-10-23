import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/loadtest-server.ts"],
  format: "esm",
  target: "node24",
  clean: true,
  // Bundle every dependency (incl. @gac/shared, which ships TS source) so the
  // runtime image needs no node_modules.
  noExternal: [/^(?!sharp$)/],
  // sharp is a native module: it cannot be bundled and is installed in the
  // runtime image at the version pinned in package.json (see Dockerfile).
  external: ["sharp"],
  // Bundled CommonJS deps (fastify's) call require() on Node built-ins, which
  // plain ESM output lacks.
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
