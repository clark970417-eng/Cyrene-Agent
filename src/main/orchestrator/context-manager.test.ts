import { describe, expect, it, vi } from "vitest";
import { callSummarizeModel } from "./context-manager";
import type {
  ChatRequest,
  ChatResponse,
  ChatVendorAdapter,
  HttpRequest,
  ProviderCapability,
  StreamChunk,
  StreamEvent,
  ToolExecutionResult,
} from "./vendors/types";

const capability: ProviderCapability = {
  id: "gemini_web",
  displayName: "Gemini Web",
  transport: "openai",
  baseUrl: "https://gemini.google.com",
  authStyle: "bearer",
  defaultModel: "gemini_web",
  supportsTools: false,
  supportsThinking: false,
  thinkingField: null,
  cacheStrategy: "none",
  testStrategy: "text",
  supportsVision: true,
};

function webAdapter(executeWebPrompt: (prompt: string) => Promise<string>): ChatVendorAdapter {
  return {
    id: "gemini_web",
    transport: "openai",
    capability,
    buildRequest: vi.fn((): HttpRequest => ({ url: "", method: "POST", headers: {}, body: "" })),
    buildStreamRequest: vi.fn((): HttpRequest => ({ url: "", method: "POST", headers: {}, body: "" })),
    buildPromptText: vi.fn(() => "網頁整理提示"),
    executeWebPrompt,
    parseResponse: vi.fn((): ChatResponse => ({
      assistantMessage: { role: "assistant", content: "" },
      text: "",
      toolCalls: [],
      finishReason: "stop",
      raw: {},
    })),
    appendToolResults: vi.fn((messages, _results: ToolExecutionResult[]) => messages),
    parseStreamEvent: vi.fn((_event: StreamEvent): StreamChunk | null => null),
    testConnection: vi.fn(async () => ({ ok: true, latency: 0 })),
  };
}

describe("callSummarizeModel", () => {
  it("uses the native web provider path instead of HTTP", async () => {
    const executeWebPrompt = vi.fn(async () => "  整理後的摘要  ");
    const adapter = webAdapter(executeWebPrompt);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await callSummarizeModel(
      [{ role: "user", content: "幫我記住這件事" }],
      adapter,
      {
        provider: "gemini_web",
        baseUrl: "https://gemini.google.com",
        model: "gemini_web",
        apiKey: "",
        contextWindowTokens: 256_000,
      },
    );

    expect(result).toBe("整理後的摘要");
    expect(executeWebPrompt).toHaveBeenCalledWith("網頁整理提示", undefined, { signal: undefined });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(adapter.buildRequest).not.toHaveBeenCalled();
  });
});
