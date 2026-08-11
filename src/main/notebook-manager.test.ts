import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { migrateLegacySharedNotebook } from "./notebook-manager";

describe("shared notebook migration", () => {
  it("copies a legacy notebook into the shared user data location", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cyrene-notebook-"));
    const legacy = path.join(dir, "legacy.md");
    const target = path.join(dir, "userData", "Shared Notebook.md");
    writeFileSync(legacy, "# 舊日記\n重要回憶", "utf8");

    expect(migrateLegacySharedNotebook(target, [legacy])).toBe(legacy);
    expect(readFileSync(target, "utf8")).toBe("# 舊日記\n重要回憶");
  });

  it("never overwrites an existing shared notebook", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cyrene-notebook-"));
    const legacy = path.join(dir, "legacy.md");
    const target = path.join(dir, "Shared Notebook.md");
    writeFileSync(legacy, "舊內容", "utf8");
    writeFileSync(target, "新版內容", "utf8");

    expect(migrateLegacySharedNotebook(target, [legacy])).toBeNull();
    expect(readFileSync(target, "utf8")).toBe("新版內容");
  });
});
