import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync(fileURLToPath(new URL("./index.html", import.meta.url)), "utf8");
const css = fs.readFileSync(fileURLToPath(new URL("./settings.css", import.meta.url)), "utf8");

describe("settings feature layouts", () => {
  it("presents API sources as a responsive card grid", () => {
    expect(html).toContain('class="api-source-grid"');
    expect(html).toContain('class="api-source-card"');
    expect(css).toMatch(/\.api-source-grid\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(3,/s);
    expect(css).toMatch(/\.api-source-card\s*\{[^}]*display:\s*grid[^}]*border-radius:/s);
  });

  it("styles runtime checkboxes as switches and preserves reduced motion", () => {
    expect(css).toMatch(/\.switch-input\s*\{[^}]*appearance:\s*none/s);
    expect(css).toMatch(/\.switch-input:checked::after\s*\{[^}]*translateX\(18px\)/s);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.switch-input::after/s);
  });

  it("styles secondary dynamic sections instead of exposing raw controls", () => {
    for (const className of ["opener-console", "activity-center", "memory-graph-layout", "asr-test-bench"]) {
      expect(html).toContain(`class="${className}`);
      expect(css).toContain(`.${className}`);
    }
    expect(css).toMatch(/\.opener-mode-grid\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.activity-layout\s*\{[^}]*grid-template-columns:/s);
    expect(css).toMatch(/\.memory-graph-stage\s*\{[^}]*position:\s*relative/s);
    expect(css).toMatch(/\.asr-meter\s*\{[^}]*height:\s*8px/s);
  });

  it("prevents the Discord identity editor from overflowing narrow windows", () => {
    expect(css).toMatch(/\.discord-identity__editor \.form-input\s*\{[^}]*width:\s*100%/s);
    expect(css).toMatch(/@media \(max-width:\s*880px\)[\s\S]*?\.discord-identity__editor\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  it("includes the Gemini brain editor and Discord announcement studio", () => {
    for (const id of [
      "gemini-brain-enabled",
      "gemini-brain-identity",
      "gemini-brain-memory-policy",
      "gemini-brain-save",
      "channels-discord-announcement-channel",
      "channels-discord-announcement-content",
      "channels-discord-announcement-add-media",
      "channels-discord-announcement-preview",
      "channels-discord-announcement-publish",
    ]) expect(html).toContain(`id="${id}"`);
    expect(css).toMatch(/\.discord-announcement__workspace\s*\{[^}]*grid-template-columns:/s);
    expect(css).toMatch(/\.gemini-brain__grid\s*\{[^}]*grid-template-columns:/s);
  });
});
