export interface DesktopWindowStartupDeps {
  createWorkspaceWindow(): void;
  createPetWindow(): void;
  onError(kind: "workspace" | "pet", error: unknown): void;
}

/** Start both desktop surfaces independently, with the primary UI first. */
export function startDesktopWindows(deps: DesktopWindowStartupDeps): void {
  try {
    deps.createWorkspaceWindow();
  } catch (error) {
    deps.onError("workspace", error);
  }

  try {
    deps.createPetWindow();
  } catch (error) {
    deps.onError("pet", error);
  }
}
