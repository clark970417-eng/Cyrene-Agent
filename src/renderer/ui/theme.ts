import "./window-corner-radius";
import "./traditional-chinese";
import "./custom-page-theme.css";
import { normalizeUiTheme, type UiTheme } from "../../shared/ui-theme";
import { DEFAULT_UI_FONT, normalizeUiFont, type UiFont } from "../../shared/ui-font";
import type { ChatAppearanceSettings } from "../../shared/chat-appearance";

declare global {
  interface Window {
    cyreneTheme?: {
      get: () => Promise<UiTheme>;
      onChanged: (callback: (theme: UiTheme) => void) => () => void;
      getRadius: () => Promise<boolean>;
      onRadiusChanged: (callback: (theme: boolean) => void) => () => void;
    };
    cyreneFont?: {
      get: () => Promise<UiFont>;
      onChanged: (callback: (font: UiFont) => void) => () => void;
    };
    cyreneAppearance?: {
      get: () => Promise<ChatAppearanceSettings>;
      onChanged: (callback: (settings: ChatAppearanceSettings) => void) => () => void;
    };
  }
}

function applyTheme(theme: unknown): void {
  const normalized = normalizeUiTheme(theme);
  document.documentElement.dataset.uiTheme = normalized;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = normalized === "pearl-white" ? "#f5f2f7" : "#0c0814";
}

function applyRadius(radius: boolean): void {
  document.documentElement.dataset.uiRadius = radius ? undefined : "false";
}

const CUSTOM_FONT_STYLE_ID = "cyrene-custom-font";
const DEFAULT_FONT_STACK = '"Noto Sans TC", -apple-system, BlinkMacSystemFont, "PingFang TC", "Helvetica Neue", "Segoe UI", sans-serif';

function applyFont(value: unknown): void {
  const font = normalizeUiFont(value);
  const style = document.getElementById(CUSTOM_FONT_STYLE_ID);
  if (font.kind !== "custom") {
    style?.remove();
    document.documentElement.style.setProperty("--rb-font-sans", DEFAULT_FONT_STACK);
    document.documentElement.dataset.uiFont = "source-han";
    return;
  }
  const customStyle = style ?? document.head.appendChild(Object.assign(document.createElement("style"), { id: CUSTOM_FONT_STYLE_ID }));
  const format = font.fileName.toLowerCase().endsWith(".otf") ? "opentype" : "truetype";
  customStyle.textContent = `@font-face { font-family: "Cyrene Custom Font"; src: url("local-font://${encodeURIComponent(font.fileName)}") format("${format}"); font-display: swap; }`;
  document.documentElement.style.setProperty("--rb-font-sans", `"Cyrene Custom Font", ${DEFAULT_FONT_STACK}`);
  document.documentElement.dataset.uiFont = "custom";
}

applyTheme("cyrene-night");

void window.cyreneTheme?.get()
  .then(applyTheme)
  .catch(() => applyTheme("cyrene-night"));

window.cyreneTheme?.onChanged((theme) => {
  applyTheme(theme);
});

void window.cyreneTheme?.getRadius()
  .then(applyRadius)
  .catch(() => applyRadius(true));

window.cyreneTheme?.onRadiusChanged((theme) => {
  applyRadius(theme);
});

applyFont(DEFAULT_UI_FONT);
void window.cyreneFont?.get().then(applyFont).catch(() => applyFont(DEFAULT_UI_FONT));
window.cyreneFont?.onChanged((font) => applyFont(font));
