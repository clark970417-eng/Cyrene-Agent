export interface WorkspaceFileEntry {
  name: string;
  relPath: string;
  isDir: boolean;
}

export type WorkspaceFileErrorCode =
  | "NO_WORKSPACE"
  | "OUT_OF_ROOT"
  | "NOT_FOUND"
  | "IS_DIRECTORY"
  | "TOO_LARGE"
  | "BINARY"
  | "LIST_FAILED"
  | "READ_FAILED";

export type WorkspaceListResult =
  | { ok: true; entries: WorkspaceFileEntry[]; truncated?: boolean }
  | { ok: false; code: WorkspaceFileErrorCode; error?: string };

export type WorkspaceReadResult =
  | { ok: true; content: string; size: number }
  | { ok: false; code: WorkspaceFileErrorCode; error?: string };

export interface WorkspaceFilesApi {
  list: (sessionId: string, relPath?: string) => Promise<WorkspaceListResult>;
  read: (sessionId: string, relPath: string) => Promise<WorkspaceReadResult>;
}
