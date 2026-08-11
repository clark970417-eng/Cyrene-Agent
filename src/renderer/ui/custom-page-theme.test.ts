import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(fileURLToPath(new URL("./custom-page-theme.css", import.meta.url)), "utf8");

describe("custom page theme bridge", () => {
  it("defines both supported colour schemes", () => {
    expect(css).toContain('[data-ui-theme="cyrene-night"]');
    expect(css).toContain('[data-ui-theme="pearl-white"]');
    expect(css).toContain("color-scheme: dark");
  });

  it.each([
    ".workspace",
    ".notebook-container",
    ".exam-container",
    ".game-room",
    ".waves-shell",
    ".paint-shell",
    ".activity-shell",
  ])("covers the %s surface", (selector) => {
    expect(css).toContain(selector);
  });

  it("respects reduced-motion preferences", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("maps the light-baseline React chat into night surfaces", () => {
    expect(css).toContain("--cy-bg-workspace: #171020");
    expect(css).toContain(".cy-composer.ant-sender");
    expect(css).toContain(".cy-segment.is-active");
  });

  it("keeps the pearl workspace shell on readable light surfaces", () => {
    expect(css).toContain(".workspace .titlebar");
    expect(css).toContain(".sidebar__brand-name");
    expect(css).toContain(".overview-item-card");
    expect(css).toContain("background: #fbf8fc");
  });
});
