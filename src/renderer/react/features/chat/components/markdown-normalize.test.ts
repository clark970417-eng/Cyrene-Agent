import { describe, expect, it } from "vitest";
import { normalizeModelMarkdown } from "./markdown-normalize";

describe("normalizeModelMarkdown", () => {
  it("repairs headings and a language fence glued to prose", () => {
    expect(normalizeModelMarkdown("##標題\n內容```ts\nconst ok = true;\n```"))
      .toBe("## 標題\n內容\n\n```ts\nconst ok = true;\n```");
  });

  it("does not rewrite content inside code fences", () => {
    const source = "```md\n##不要改\n```";
    expect(normalizeModelMarkdown(source)).toBe(source);
  });

  it("is idempotent", () => {
    const source = "###標題。這是正文";
    const once = normalizeModelMarkdown(source);
    expect(normalizeModelMarkdown(once)).toBe(once);
  });
});
