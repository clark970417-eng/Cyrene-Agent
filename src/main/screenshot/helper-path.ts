import * as path from "node:path";

export interface ScreenshotHelperPathEnvironment {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
  envOverride: string | undefined;
}

export function resolveScreenshotHelperPath(environment: ScreenshotHelperPathEnvironment): string {
  if (environment.envOverride?.trim()) return environment.envOverride;
  const paths = /^[A-Za-z]:[\\/]/.test(environment.appPath) ? path.win32 : path;
  if (environment.isPackaged) {
    return paths.join(environment.resourcesPath, "bin", "cyrene-screenshot.exe");
  }
  return paths.join(environment.appPath, "native", "cyrene-screenshot", "target", "release", "cyrene-screenshot.exe");
}
