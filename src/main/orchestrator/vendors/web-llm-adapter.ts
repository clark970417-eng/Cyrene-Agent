import type {
  ChatVendorAdapter,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  StreamEvent,
  StreamChunk,
  TestConnectionResult,
  HttpRequest,
  ProviderCapability,
  VendorConfig,
  ToolExecutionResult,
  Transport,
} from "./types";
import { runChatGPTWebPrompt } from "../../web-llm/chatgpt-web-driver";
import { runGeminiWebPrompt } from "../../web-llm/gemini-web-driver";

export class WebLlmAdapter implements ChatVendorAdapter {
  readonly id: string;
  readonly transport: Transport = "openai";
  readonly capability: ProviderCapability;
  private readonly providerType: "chatgpt_web" | "gemini_web";

  constructor(id: string, capability: ProviderCapability, providerType?: "chatgpt_web" | "gemini_web") {
    this.id = id;
    this.capability = capability;
    this.providerType = providerType ?? (id as "chatgpt_web" | "gemini_web");
  }

  buildRequest(_req: ChatRequest, _cfg: VendorConfig): HttpRequest {
    return {
      url: this.capability.baseUrl,
      method: "POST",
      headers: {},
      body: "",
    };
  }

  buildStreamRequest(req: ChatRequest, cfg: VendorConfig): HttpRequest {
    return this.buildRequest(req, cfg);
  }

  parseResponse(_raw: unknown): ChatResponse {
    return {
      assistantMessage: { role: "assistant", content: "" },
      text: "",
      toolCalls: [],
      finishReason: "stop",
      raw: {},
    };
  }

  parseStreamEvent(_event: StreamEvent): StreamChunk | null {
    return null;
  }

  appendToolResults(messages: ChatMessage[], _results: ToolExecutionResult[]): ChatMessage[] {
    return messages;
  }

  async testConnection(): Promise<TestConnectionResult> {
    return { ok: true, latency: 10 };
  }

  async executeWebPrompt(
    promptText: string,
    onChunk?: (text: string) => void
  ): Promise<string> {
    if (this.providerType === "chatgpt_web") {
      return await runChatGPTWebPrompt(promptText, onChunk);
    } else {
      return await runGeminiWebPrompt(promptText, onChunk);
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const systemMsg = req.messages.find((m) => m.role === "system")?.content || "";
    const conversation = req.messages
      .filter((m) => m.role !== "system" && m.content)
      .map((m) => `${m.role === "user" ? "夥伴" : "昔漣"}: ${m.content}`)
      .slice(-6)
      .join("\n");

    const fullPrompt = `${systemMsg ? `[系統背景指示]\n${systemMsg}\n\n` : ""}${conversation}`;

    const text = await this.executeWebPrompt(fullPrompt);

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: text,
    };

    return {
      assistantMessage,
      text,
      toolCalls: [],
      finishReason: "stop",
      raw: { text },
    };
  }
}
