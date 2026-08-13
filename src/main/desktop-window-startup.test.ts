import { describe, expect, it, vi } from "vitest";
import { startDesktopWindows } from "./desktop-window-startup";

describe("startDesktopWindows", () => {
  it("creates the workspace before the pet", () => {
    const calls: string[] = [];
    startDesktopWindows({
      createWorkspaceWindow: () => { calls.push("workspace"); },
      createPetWindow: () => { calls.push("pet"); },
      onError: vi.fn(),
    });
    expect(calls).toEqual(["workspace", "pet"]);
  });

  it("still creates the workspace when pet startup throws", () => {
    const calls: string[] = [];
    const onError = vi.fn();
    startDesktopWindows({
      createWorkspaceWindow: () => { calls.push("workspace"); },
      createPetWindow: () => { throw new Error("pet failed"); },
      onError,
    });
    expect(calls).toEqual(["workspace"]);
    expect(onError).toHaveBeenCalledWith("pet", expect.any(Error));
  });

  it("still creates the pet when workspace startup throws", () => {
    const calls: string[] = [];
    const onError = vi.fn();
    startDesktopWindows({
      createWorkspaceWindow: () => { throw new Error("workspace failed"); },
      createPetWindow: () => { calls.push("pet"); },
      onError,
    });
    expect(calls).toEqual(["pet"]);
    expect(onError).toHaveBeenCalledWith("workspace", expect.any(Error));
  });
});
