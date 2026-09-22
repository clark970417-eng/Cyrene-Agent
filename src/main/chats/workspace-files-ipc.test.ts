import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { listWorkspaceDirectory, readWorkspaceFile } from "./workspace-files-ipc";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cyrene-workspace-files-"));
  roots.push(root);
  return root;
}

describe("workspace files IPC helpers", () => {
  it("lists directories first and hides dot files", async () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "README.md"), "hello");
    fs.writeFileSync(path.join(root, ".secret"), "hidden");

    const result = await listWorkspaceDirectory(root, "");
    expect(result).toEqual({
      ok: true,
      entries: [
        { name: "src", relPath: "src", isDir: true },
        { name: "README.md", relPath: "README.md", isDir: false },
      ],
      truncated: false,
    });
  });

  it("reads text but rejects parent traversal and binary files", async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "note.txt"), "Cyrene");
    fs.writeFileSync(path.join(root, "binary.bin"), Buffer.alloc(100, 0));

    await expect(readWorkspaceFile(root, "note.txt")).resolves.toEqual({ ok: true, content: "Cyrene", size: 6 });
    await expect(readWorkspaceFile(root, "../outside.txt")).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    await expect(readWorkspaceFile(root, "binary.bin")).resolves.toMatchObject({ ok: false, code: "BINARY" });
  });

  it("rejects files larger than the preview limit", async () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "large.txt"), Buffer.alloc(1024 * 1024 + 1, 65));
    await expect(readWorkspaceFile(root, "large.txt")).resolves.toMatchObject({ ok: false, code: "TOO_LARGE" });
  });
});
