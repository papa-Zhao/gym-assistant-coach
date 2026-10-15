import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: "esm",
  target: "node24",
  clean: true,
  // @gac/shared ships TypeScript source, so bundle it into the output.
  noExternal: ["@gac/shared"],
});
