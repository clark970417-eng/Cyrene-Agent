import { pathApiFor } from "./path-utils";

export interface ScreenshotHelperPathEnvironment {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
  envOverride: string | undefined;
}

export function resolveScreenshotHelperPath(environment: ScreenshotHelperPathEnvironment): string {
  if (environment.envOverride?.trim()) return environment.envOverride;
  const pathApi = pathApiFor(environment.isPackaged ? environment.resourcesPath : environment.appPath);
  if (environment.isPackaged) {
    return pathApi.join(environment.resourcesPath, "bin", "cyrene-screenshot.exe");
  }
  return pathApi.join(environment.appPath, "native", "cyrene-screenshot", "target", "release", "cyrene-screenshot.exe");
}
