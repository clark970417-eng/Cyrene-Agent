import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = resolve(__dirname, "..");

function source(path: string): string {
  return readFileSync(resolve(rendererRoot, path), "utf8");
}

describe("embedded workspace titlebars", () => {
  it("publishes whether a renderer is hosted inside the workspace", () => {
    expect(source("ui/theme.ts")).toContain(
      'document.documentElement.dataset.embedded = window.self !== window.top ? "true" : "false"'
    );
  });

  it.each([
    ["settings/settings.css", ".settings-titlebar"],
    ["tasks/tasks.css", ".tasks__titlebar"],
    ["call/call.css", ".call__titlebar"],
    ["sticker-manager/style.css", ".sticker-titlebar"]
  ])("hides duplicate chrome in %s", (path, selector) => {
    const css = source(path);
    expect(css).toContain(`html[data-embedded="true"] ${selector}`);
    expect(css.indexOf("display: none", css.indexOf(`html[data-embedded="true"] ${selector}`))).toBeGreaterThan(-1);
  });

  it("leaves functional page toolbars outside the duplicate-chrome rules", () => {
    const embeddedRules = [
      source("settings/settings.css"),
      source("tasks/tasks.css"),
      source("call/call.css"),
      source("sticker-manager/style.css")
    ].join("\n");
    expect(embeddedRules).not.toMatch(/notebook|exam|paint|game-room/);
  });
});
