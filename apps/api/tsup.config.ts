import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: "esm",
  target: "node24",
  clean: true,
  // Bundle every dependency (incl. @gac/shared, which ships TS source) so the
  // runtime image needs no node_modules.
  noExternal: [/.*/],
  // Bundled CommonJS deps (fastify's) call require() on Node built-ins, which
  // plain ESM output lacks.
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
