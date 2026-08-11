import * as path from "node:path";
import { pathToFileURL } from "node:url";

export function isWindowsStylePath(value: string): boolean {
  return /^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value);
}

export function pathApiFor(value: string): typeof path.win32 | typeof path.posix {
  return isWindowsStylePath(value) ? path.win32 : path.posix;
}

export function screenshotFileUrl(filePath: string): string {
  if (!isWindowsStylePath(filePath)) return pathToFileURL(filePath).toString();
  const normalized = filePath.replace(/\\/g, "/");
  const encoded = normalized.split("/").map((segment, index) => index === 0 ? segment : encodeURIComponent(segment)).join("/");
  return `file:///${encoded}`;
}
