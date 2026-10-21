// Writes apps/liff/gallery.html: every pose at 64px and 40px, light and dark.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { cssVariables, type ColorMode } from "@gac/shared";
import { ExerciseIllustration } from "../src/illustrations/ExerciseIllustration";
import { POSES } from "../src/illustrations/poses";
import { themeCss } from "../src/theme";
import { parseSeed } from "./seed";

const names = new Map(parseSeed().map((e) => [e.slug, e.nameZh]));

function vars(mode: ColorMode): string {
  return Object.entries(cssVariables(mode))
    .map(([k, v]) => `${k}:${v};`)
    .join("");
}

function Column({ mode }: { mode: ColorMode }) {
  return (
    <section className={`col ${mode}`}>
      <h2>{mode === "light" ? "淺色" : "深色"}</h2>
      {Object.keys(POSES).map((slug) => {
        const exercise = { slug, kind: "strength" as const, muscleGroup: null };
        return (
          <div className="cell" key={slug}>
            <ExerciseIllustration exercise={exercise} size={64} />
            <ExerciseIllustration exercise={exercise} size={40} />
            <div>
              <div>{names.get(slug) ?? "（自訂）"}</div>
              <code>{slug}</code>
            </div>
          </div>
        );
      })}
    </section>
  );
}

const body = renderToStaticMarkup(
  <div className="cols">
    <Column mode="light" />
    <Column mode="dark" />
  </div>,
);

const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>插圖圖庫</title>
<style>
${themeCss()}
.light{${vars("light")}}
.dark{${vars("dark")}}
.cols{display:flex;min-height:100vh}
.col{flex:1;padding:24px;background:var(--color-bg);color:var(--color-text)}
.cell{display:flex;align-items:center;gap:16px;margin-bottom:16px}
</style></head><body>${body}</body></html>`;

const out = fileURLToPath(new URL("../gallery.html", import.meta.url));
writeFileSync(out, html);
console.log(`wrote ${out}`);
