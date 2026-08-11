import { randomUUID } from "node:crypto";
import * as path from "node:path";

import type {
  CaptureState,
  HelperProcessState,
  PendingRequest,
  ScreenshotHelperClient,
  ScreenshotMode,
  ScreenshotResult,
} from "./helper-client";

export interface MacScreenshotClientDependencies {
  screenshotDirectory: string;
  capture: (args: string[]) => Promise<void>;
  ensureDirectory: (directory: string) => Promise<void>;
  probeImage: (filePath: string) => { empty: boolean; width: number; height: number };
  createRequestId?: () => string;
}

/** macOS adapter around the built-in /usr/sbin/screencapture utility. */
export class MacScreenshotClient implements ScreenshotHelperClient {
  private state: HelperProcessState = "stopped";
  private interactionState: CaptureState = "idle";
  private readonly requests = new Map<string, PendingRequest>();

  constructor(private readonly deps: MacScreenshotClientDependencies) {}

  get processState(): HelperProcessState { return this.state; }
  get captureState(): CaptureState { return this.interactionState; }
  get pendingRequests(): ReadonlyMap<string, PendingRequest> { return this.requests; }

  async ensureStarted(): Promise<void> {
    await this.deps.ensureDirectory(this.deps.screenshotDirectory);
    this.state = "ready";
  }

  async start(mode: ScreenshotMode, source: PendingRequest["source"]): Promise<ScreenshotResult> {
    await this.ensureStarted();
    const requestId = (this.deps.createRequestId ?? randomUUID)();
    const request: PendingRequest = { requestId, mode, source, startedAt: Date.now(), captureReleased: false };
    this.requests.set(requestId, request);
    this.interactionState = "selecting";

    try {
      if (mode === "clipboard-only") {
        await this.deps.capture(["-i", "-c"]);
        return { requestId, filePath: null, width: 0, height: 0, mime: "image/png", clipboardWritten: true, hasAnnotations: false };
      }

      const filePath = path.join(this.deps.screenshotDirectory, `${requestId}.png`);
      await this.deps.capture(["-i", "-o", filePath]);
      const image = this.deps.probeImage(filePath);
      if (image.empty || image.width <= 0 || image.height <= 0) throw new Error("INVALID_SCREENSHOT_IMAGE");
      return {
        requestId,
        filePath,
        width: image.width,
        height: image.height,
        mime: "image/png",
        clipboardWritten: false,
        hasAnnotations: false,
      };
    } finally {
      request.captureReleased = true;
      this.requests.delete(requestId);
      this.interactionState = "idle";
    }
  }

  cancel(): void {
    // Esc is handled by the native macOS selection UI.
  }

  async shutdown(): Promise<void> {
    this.requests.clear();
    this.interactionState = "idle";
    this.state = "stopped";
  }
}
