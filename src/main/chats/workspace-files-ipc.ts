import * as fs from "fs";
import * as path from "path";
import { ipcMain } from "electron";
import { IPC } from "../../shared/ipc-channels";
import type { WorkspaceFileEntry, WorkspaceListResult, WorkspaceReadResult } from "../../shared/workspace-files-types";
import * as chatsStore from "./chats-store";

const LIST_LIMIT = 1000;
const READ_LIMIT = 1024 * 1024;

function isWithinRoot(root: string, target: string): boolean {
  const normalizedRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const normalizedTarget = process.platform === "win32" ? target.toLowerCase() : target;
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

async function resolveWorkspacePath(root: string, relPath: string): Promise<{ root: string; target: string }> {
  const realRoot = await fs.promises.realpath(root);
  const normalized = String(relPath ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  const absolute = path.resolve(realRoot, normalized);
  let target: string;
  try {
    target = await fs.promises.realpath(absolute);
  } catch {
    throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
  }
  if (!isWithinRoot(realRoot, target)) {
    throw Object.assign(new Error("outside workspace"), { code: "OUT_OF_ROOT" });
  }
  return { root: realRoot, target };
}

export async function listWorkspaceDirectory(root: string, relPath: string): Promise<WorkspaceListResult> {
  let resolved: { root: string; target: string };
  try {
    resolved = await resolveWorkspacePath(root, relPath);
  } catch (error) {
    return { ok: false, code: (error as { code?: string }).code === "OUT_OF_ROOT" ? "OUT_OF_ROOT" : "NOT_FOUND" };
  }
  try {
    const dirents = await fs.promises.readdir(resolved.target, { withFileTypes: true });
    const entries: WorkspaceFileEntry[] = dirents
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => ({
        name: entry.name,
        relPath: path.relative(resolved.root, path.join(resolved.target, entry.name)).replaceAll("\\", "/"),
        isDir: entry.isDirectory(),
      }))
      .sort((left, right) => left.isDir === right.isDir
        ? left.name.localeCompare(right.name)
        : left.isDir ? -1 : 1);
    return { ok: true, entries: entries.slice(0, LIST_LIMIT), truncated: entries.length > LIST_LIMIT };
  } catch (error) {
    return { ok: false, code: "LIST_FAILED", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readWorkspaceFile(root: string, relPath: string): Promise<WorkspaceReadResult> {
  let resolved: { root: string; target: string };
  try {
    resolved = await resolveWorkspacePath(root, relPath);
  } catch (error) {
    return { ok: false, code: (error as { code?: string }).code === "OUT_OF_ROOT" ? "OUT_OF_ROOT" : "NOT_FOUND" };
  }
  try {
    const stat = await fs.promises.stat(resolved.target);
    if (stat.isDirectory()) return { ok: false, code: "IS_DIRECTORY" };
    if (stat.size > READ_LIMIT) return { ok: false, code: "TOO_LARGE" };
    const buffer = await fs.promises.readFile(resolved.target);
    const head = buffer.subarray(0, Math.min(buffer.length, 4096));
    const nullBytes = head.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
    if (head.length > 0 && nullBytes / head.length > 0.05) return { ok: false, code: "BINARY" };
    return { ok: true, content: buffer.toString("utf8"), size: stat.size };
  } catch (error) {
    return { ok: false, code: "READ_FAILED", error: error instanceof Error ? error.message : String(error) };
  }
}

export function registerWorkspaceFilesIpc(): void {
  ipcMain.handle(IPC.WORKSPACE_FILES_LIST, (_event, payload: { sessionId?: string; relPath?: string }) => {
    const binding = payload?.sessionId ? chatsStore.getWorkspaceBinding(payload.sessionId) : null;
    return binding
      ? listWorkspaceDirectory(binding.workspaceRoot, payload.relPath ?? "")
      : { ok: false as const, code: "NO_WORKSPACE" as const };
  });
  ipcMain.handle(IPC.WORKSPACE_FILES_READ, (_event, payload: { sessionId?: string; relPath?: string }) => {
    const binding = payload?.sessionId ? chatsStore.getWorkspaceBinding(payload.sessionId) : null;
    return binding && payload.relPath
      ? readWorkspaceFile(binding.workspaceRoot, payload.relPath)
      : { ok: false as const, code: "NO_WORKSPACE" as const };
  });
}
