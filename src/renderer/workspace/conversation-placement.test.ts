import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync(fileURLToPath(new URL("./index.html", import.meta.url)), "utf8");
const workspaceCss = fs.readFileSync(fileURLToPath(new URL("./workspace.css", import.meta.url)), "utf8");
const reactCss = fs.readFileSync(fileURLToPath(new URL("../react/styles/react-root.css", import.meta.url)), "utf8");
const chatPage = fs.readFileSync(fileURLToPath(new URL("../react/features/chat/pages/ChatPage.tsx", import.meta.url)), "utf8");
const main = fs.readFileSync(fileURLToPath(new URL("./main.ts", import.meta.url)), "utf8");

describe("unified conversation navigation", () => {
  it("places the primary new-conversation action above workspace history", () => {
    const sessions = html.match(/<div class="sidebar__sessions">[\s\S]*?<\/ul>\s*<\/div>/)?.[0];
    expect(sessions).toBeTruthy();
    expect(sessions).toContain('id="sidebar-new-session-btn"');
    expect(sessions).toContain("新建對話");
    expect(sessions).toContain('id="sidebar-sessions-list"');
    expect(sessions?.indexOf("sidebar-new-session-btn")).toBeLessThan(sessions?.indexOf("sidebar-sessions-list") ?? 0);
  });

  it("preserves a guided empty state instead of rendering a blank rail", () => {
    expect(main).toContain('empty.textContent = "還沒有對話"');
    expect(workspaceCss).toContain(".sidebar__sessions-empty");
  });

  it("keeps the new-conversation action subordinate to the conversation list", () => {
    expect(workspaceCss).toMatch(/\.sidebar__sessions-create-icon\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px/s);
    expect(workspaceCss).toMatch(/\.sidebar__sessions-create-label\s*\{[^}]*font-size:\s*12px/s);
  });

  it("merges the embedded React controls into a single top row", () => {
    expect(workspaceCss).toMatch(/body\[data-content="react"\] \.titlebar\s*\{[^}]*position:\s*absolute/s);
    expect(workspaceCss).toMatch(/body\[data-content="react"\] \.titlebar__left,[\s\S]*?display:\s*none/);
    expect(workspaceCss).toMatch(/body\[data-content="react"\] \.titlebar__actions\s*\{[^}]*pointer-events:\s*auto/s);
  });

  it("removes the duplicate React rail only when embedded in the workspace", () => {
    expect(reactCss).toMatch(/\.cy-page\.is-embedded\s*\{[^}]*padding-left:\s*10px/s);
    expect(reactCss).toMatch(/\.cy-page\.is-embedded \.cy-page-newtask[\s\S]*?display:\s*none/);
    expect(reactCss).toMatch(/\.cy-page\.is-embedded \.cy-page-conversations[\s\S]*?display:\s*none/);
    expect(reactCss).toContain(".cy-page-newtask {");
    expect(reactCss).toContain(".cy-page-conversations {");
  });

  it("bridges the workspace conversation controls into the embedded React chat", () => {
    expect(main).toContain('type: "create-session"');
    expect(main).toContain('type: "switch-session"');
    expect(chatPage).toContain('event.data.type === "create-session"');
    expect(chatPage).toContain('event.data.type === "switch-session"');
    expect(chatPage).toContain('type: "active-session-changed"');
    expect(main).toMatch(/type === "active-session-changed"[\s\S]*?renderSidebarSessionsList\(\)/);
  });
});
