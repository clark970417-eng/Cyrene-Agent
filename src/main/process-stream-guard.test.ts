import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  handleProcessStreamError,
  installProcessStreamErrorGuards,
} from "./process-stream-guard";

describe("process stream guards", () => {
  it("ignores a broken stdout or stderr pipe", () => {
    expect(() => handleProcessStreamError(Object.assign(new Error("broken pipe"), { code: "EPIPE" })))
      .not.toThrow();
  });

  it("does not hide unrelated stream failures", () => {
    const error = Object.assign(new Error("stream failed"), { code: "EIO" });
    expect(() => handleProcessStreamError(error)).toThrow(error);
  });

  it("attaches the guard to every available stream", () => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    installProcessStreamErrorGuards([stdout, undefined, stderr]);

    expect(() => stdout.emit("error", Object.assign(new Error("closed"), { code: "EPIPE" }))).not.toThrow();
    expect(() => stderr.emit("error", Object.assign(new Error("closed"), { code: "EPIPE" }))).not.toThrow();
  });
});
