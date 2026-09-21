import type { EventEmitter } from "node:events";

type ErrorStream = Pick<EventEmitter, "on">;

export function handleProcessStreamError(error: NodeJS.ErrnoException): void {
  if (error.code === "EPIPE") return;
  throw error;
}

/** Finder/Dock launches may leave stdout or stderr without a live reader. */
export function installProcessStreamErrorGuards(
  streams: ReadonlyArray<ErrorStream | null | undefined> = [process.stdout, process.stderr],
): void {
  for (const stream of streams) {
    stream?.on("error", handleProcessStreamError);
  }
}
