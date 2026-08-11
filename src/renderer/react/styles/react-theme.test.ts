import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(fileURLToPath(new URL("./react-theme.css", import.meta.url)), "utf8");

type Rgb = readonly [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("React semantic colour hierarchy", () => {
  it("defines equivalent surface, border and text roles for both themes", () => {
    expect(css).toContain('html[data-ui-theme="pearl-white"]');
    expect(css).toContain('html[data-ui-theme="cyrene-night"]');

    for (const token of [
      "--cy-surface-soft",
      "--cy-surface-control",
      "--cy-surface-raised",
      "--cy-border-strong",
      "--cy-text-placeholder",
      "--cy-pill-bg",
      "--cy-pill-border",
      "--cy-pill-status",
    ]) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(css.match(new RegExp(`${escaped}:`, "g"))).toHaveLength(2);
    }
  });

  it("keeps primary, muted and placeholder copy readable in light mode", () => {
    const background: Rgb = [255, 253, 253];
    expect(contrast([43, 33, 48], background)).toBeGreaterThanOrEqual(7);
    expect(contrast([104, 91, 112], background)).toBeGreaterThanOrEqual(5);
    expect(contrast([117, 104, 121], background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps primary, muted and placeholder copy readable in dark mode", () => {
    const background: Rgb = [36, 25, 46];
    expect(contrast([246, 239, 249], background)).toBeGreaterThanOrEqual(10);
    expect(contrast([197, 184, 205], background)).toBeGreaterThanOrEqual(7);
    expect(contrast([173, 158, 183], background)).toBeGreaterThanOrEqual(5);
  });

  it("styles the reported composer and outer-boundary problem areas", () => {
    expect(css).toContain(".cy-composer .ant-sender-input::placeholder");
    expect(css).toContain(".cy-composer__footer-separator");
    expect(css).toContain(".cy-page");
    expect(css).toContain(".cy-workspace");
    expect(css).toContain("@media (prefers-contrast: more)");
  });

  it("keeps the Cyrene line icon visible without changing the light theme asset", () => {
    expect(css).toMatch(/html\[data-ui-theme="cyrene-night"\] \.cy-status-avatar\s*\{[^}]*filter:\s*brightness\(0\) invert\(1\)/s);
    expect(css).toMatch(/html\[data-ui-theme="pearl-white"\] \.cy-status-avatar\s*\{[^}]*filter:\s*none/s);
  });
});
