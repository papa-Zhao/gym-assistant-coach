import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTfdaCsv, seedSql } from "./tfda-seed";

const csv = readFileSync(
  fileURLToPath(new URL("./fixtures/tfda-sample.csv", import.meta.url)),
  "utf8",
);

describe("parseTfdaCsv", () => {
  const foods = parseTfdaCsv(csv);

  it("returns one food per 整合編號, in file order", () => {
    expect(foods.map((f) => f.ref)).toEqual(["J0403106", "N0300101", "A0550601"]);
  });

  it("reads quoted fields that contain commas, with numbers trimmed", () => {
    expect(foods[0]).toEqual({
      ref: "J0403106",
      name: "鯔(12月,雄魚)",
      aliases: "青頭仔(幼魚),奇目仔(成魚),信魚,正烏,烏魚,正頭烏,回頭烏,大烏(澎湖)",
      category: "魚貝類",
      kcal: 137,
      proteinG: 21.1,
      carbG: 0.9,
      fatG: 5.2,
    });
  });

  it("uses null for a missing 粗蛋白 and for empty 俗名", () => {
    expect(foods[1]).toMatchObject({ name: "果糖", kcal: 297, proteinG: null, fatG: null, carbG: 76.9 });
    expect(foods[2]).toMatchObject({ name: "白飯", aliases: null, kcal: 183 });
  });

  it("strips the BOM from the first column name", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(foods[0]?.ref).toBe("J0403106");
  });

  it("reads quoted fields with escaped quotes and embedded newlines", () => {
    const header = "整合編號,樣品名稱,俗名,食品分類,分析項,每100克含量";
    const text = `${header}\r\nX1,"a ""b"", c","l1\nl2",類,熱量,10\r\n`;
    expect(parseTfdaCsv(text)[0]).toMatchObject({ name: 'a "b", c', aliases: "l1\nl2" });
  });
});

describe("seedSql", () => {
  const foods = parseTfdaCsv(csv);
  const sql = seedSql(foods);

  it("upserts on (source, source_ref)", () => {
    expect(sql).toContain('on conflict ("source", "source_ref") do update');
  });

  it("writes null as SQL null and escapes single quotes", () => {
    expect(sql).toContain("'N0300101', '果糖', '高果糖糖漿', '糖類', 297, null, 76.9, null");
    const quoted = seedSql([{ ...foods[0]!, name: "it's" }]);
    expect(quoted).toContain("'it''s'");
  });

  it("sorts by ref so reruns are identical", () => {
    expect(seedSql([...foods].reverse())).toBe(sql);
    expect(sql.indexOf("'A0550601'")).toBeLessThan(sql.indexOf("'J0403106'"));
  });
});
