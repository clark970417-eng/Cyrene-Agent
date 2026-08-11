// Function Calling —— 廠商無關的 function calling 循環
// 調度層只依賴 vendors adapter 的統一返回結構（buildRequest / parseResponse / appendToolResults），
// 絕不出現 if (provider === "xxx")。新廠商擴展只需在 capabilities.ts + 對應 transport adapter 里加一條。
import { toolRegistry, ToolDefinition } from "./tool-registry";
import { ToolCallResult } from "./types";
import { checkPermission, ToolRiskLevel } from "../permission";
import {
  getAdapter,
  type ChatMessage,
  type ChatRequest,
  type ToolExecutionResult,
  type ToolSpec,
} from "./vendors";
import { extractLastUserQuery, type ToolContext } from "./tool-context";
import { recordUsage } from "../token-usage-store";
import { resetReadRefs } from "../skills/skill-tools";
import { truncateToolResult, compressConversation } from "./context-manager";
import { recordAgentActivity } from "../agent-activity-store";

const LOG_PREFIX = "[FunctionCalling]";
const MAX_TOOL_ROUNDS = 20; // 多步任務（寫 Excel 多 sheet、生成圖片等）可能耗多輪；到頂強制無工具總結兜底
const PER_ROUND_TIMEOUT_MS = 75000; // 推理模型帶 thinking，30s 偏緊，放寬到 75s
const FORCE_SUMMARY_TIMEOUT_MS = 90000; // 強制總結兜底：對話歷史此時已很長，30s 不夠，放寬到 90s
// 連續超時即退出：超時後重試只會讓上下文更長更慢，形成"超時→加消息→更慢→再超時"死循環。
// 連續 MAX_CONSECUTIVE_TIMEOUTS 次超時直接跳出走強制總結，不再空轉浪費時間。
const MAX_CONSECUTIVE_TIMEOUTS = 2;

/** 調度層傳入的廠商配置（結構兼容 main/index.ts 的 ModelSettings，避免循環依賴）。 */
interface LoopSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** 把 ToolRegistry 裡的工具轉成統一 ToolSpec（與 wire 格式解耦）。 */
function buildToolSpecs(): ToolSpec[] {
  return toolRegistry.getEnabledTools().map(t => ({
    name: t.id,
    description: t.description,
    parameters: {
      type: "object",
      properties: t.inputSchema.properties,
      required: t.inputSchema.required,
    },
  }));
}

/**
 * 強制總結也失敗時的降級文案。用已收集的工具結果拼一個"任務中斷"回覆，
 * 避免整個 run 拋錯讓用戶徹底看不到任何回覆。
 * （與 cyrene-agent.ts 中的版本保持一致，但不引入其 AG-UI 依賴）
 */
function buildFallbackReply(toolResults: ToolCallResult[], reason: string): string {
  const lines: string[] = [
    "抱歉，任務執行到一半被中斷了。",
    "",
    "中斷原因：" + reason,
  ];
  if (toolResults.length > 0) {
    lines.push("", "以下是中斷前已經完成的步驟：");
    for (const r of toolResults) {
      const preview = r.output.length > 200 ? r.output.slice(0, 200) + "…" : r.output;
      lines.push("- 「" + r.toolId + "」：" + preview);
    }
  } else {
    lines.push("", "（暫無已完成的步驟信息）");
  }
  return lines.join("\n");
}

/**
 * 執行一輪 function calling 循環（廠商無關）。
 *
 * 流程：
 * 1. adapter.buildRequest(messages + tools) → 發到 LLM
 * 2. adapter.parseResponse → 若有 toolCalls → 執行工具 → adapter.appendToolResults → 回到 1
 * 3. 若無 toolCalls → 返回最終文本 + 所有工具執行結果
 *
 * @returns { reply, toolResults }
 */
export async function runFunctionCallingLoop(
  settings: LoopSettings,
  messages: ChatMessage[],
  timeoutMs: number = 60000,
): Promise<{
  reply: string;
  toolResults: ToolCallResult[];
  totalUsage?: { input: number; output: number };
}> {
  const adapter = getAdapter(settings.provider);
  const tools = buildToolSpecs();
  const allToolResults: ToolCallResult[] = [];
  const startTime = Date.now();
  // 累加所有輪次的 token 用量（工具循環可能多輪，每輪都有 usage）
  let accInput = 0;
  let accOutput = 0;
  let consecutiveTimeouts = 0; // 連續超時計數：達到上限直接跳出走強制總結

  console.log(LOG_PREFIX, `provider=${settings.provider} transport=${adapter.transport} model=${settings.model}`);
  console.log(LOG_PREFIX, "可用工具:", tools.map(t => t.name).join(", ") || "(無)");
  console.log(LOG_PREFIX, "消息數:", messages.length, "最後一角色:", messages[messages.length - 1]?.role);

  let conversation: ChatMessage[] = messages.map(m => ({ ...m }));

  // 清空本輪 skill reference 已讀記錄，防止跨對話汙染
  resetReadRefs();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const roundStart = Date.now();

    if (Date.now() - startTime > timeoutMs) {
      console.warn(LOG_PREFIX, "Function Calling 超時，在第 " + (round + 1) + " 輪退出");
      break;
    }

    console.log(LOG_PREFIX, "第 " + (round + 1) + " 輪 LLM 調用...");

    let req: ChatRequest = {
      model: settings.model,
      messages: conversation,
      ...(tools.length > 0 ? { tools } : {}),
      // 不傳 temperature：不同型號約束不同（如 Kimi k2.6 只允許 1），讓廠商用默認值
      stream: false,
    };
    if (adapter.applyCacheHints) req = adapter.applyCacheHints(req, settings);

    const http = adapter.buildRequest(req, settings);
    console.log(LOG_PREFIX, "請求:", http.url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_ROUND_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(http.url, {
        method: "POST",
        signal: controller.signal,
        headers: http.headers,
        body: http.body,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        consecutiveTimeouts++;
        console.warn(LOG_PREFIX, "第 " + (round + 1) + " 輪 LLM 請求超時（" + PER_ROUND_TIMEOUT_MS + "ms），連續第 " + consecutiveTimeouts + " 次");
        clearTimeout(timer);
        // 連續超時即退出：再重試只會讓上下文更長更慢，註定超時。
        // 不再往 conversation 塞"超時提示"消息（雪上加霜），直接跳出走強制總結。
        if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
          console.warn(LOG_PREFIX, "連續 " + MAX_CONSECUTIVE_TIMEOUTS + " 次超時，跳出 FC 循環走強制總結");
          break;
        }
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(LOG_PREFIX, "LLM 请求失败 HTTP " + response.status + ":", errorText.slice(0, 300));
      throw new Error("模型请求失败：HTTP " + response.status + (errorText ? " — " + errorText.slice(0, 200) : ""));
    }

    const data = await response.json();
    const chat = adapter.parseResponse(data);

    // 累加 token 用量（每轮都记）
    if (chat.usage) {
      accInput += chat.usage.input;
      accOutput += chat.usage.output;
      recordUsage(chat.usage.input, chat.usage.output, 1);
    }

    console.log(
      LOG_PREFIX,
      "第 " + (round + 1) + " 轮完成 finish=" + chat.finishReason +
      " toolCalls=" + chat.toolCalls.length + " thinking=" + (chat.thinking ? "有" : "无") +
      " 耗时=" + (Date.now() - roundStart) + "ms",
    );

    // 请求成功，重置连续超时计数
    consecutiveTimeouts = 0;

    // 把 assistant 消息加入对话（adapter 已保留 thinking / rawAssistant 供下轮回传）
    conversation.push(chat.assistantMessage);

    // 情况1：模型要调工具（按 toolCalls 数量判断，与 transport 无关）
    if (chat.toolCalls.length > 0) {
      console.log(
        LOG_PREFIX,
        "模型请求调用 " + chat.toolCalls.length + " 个工具:",
        chat.toolCalls.map(tc => tc.name).join(", "),
      );

      const execResults: ToolExecutionResult[] = [];
      for (const tc of chat.toolCalls) {
        const tool = toolRegistry.getById(tc.name);

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.arguments || "{}");
        } catch {
          console.warn(LOG_PREFIX, "工具参数 JSON 解析失败:", tc.arguments?.slice(0, 100));
        }

        console.log(LOG_PREFIX, "执行工具:", tc.name, JSON.stringify(args).slice(0, 200));

        let output: string;
        let status: ToolCallResult["status"] = "failed";
        let errorCode: string | undefined;
        if (!tool || !tool.enabled) {
          output = "[错误] 工具不可用: " + tc.name;
          errorCode = "E_TOOL_UNAVAILABLE";
          console.warn(LOG_PREFIX, output);
        } else {
          // 权限网关：内置工具默认 safe，MCP 工具按其 risk 字段判定
          const risk: ToolRiskLevel = (tool as ToolDefinition & { risk?: ToolRiskLevel }).risk || "safe";
          const perm = await checkPermission({
            toolId: tc.name,
            toolName: tool.name,
            toolDescription: tool.description,
            args,
            risk,
          });
          if (!perm.allowed) {
            output = "[已拒绝] " + (perm.reason || "权限不足");
            errorCode = "E_PERMISSION_DENIED";
            console.warn(LOG_PREFIX, "权限拒绝 [" + tc.name + "]:", perm.reason);
          } else {
            // ToolContext 注入：声明 needsContext 的工具拿到用户当前问题。
            // 能力判断交给工具内部（read_image 自己查视觉配置），调度层不再提前门控。
            const ctx: ToolContext | undefined = tool.needsContext
              ? { userQuery: extractLastUserQuery(conversation), conversationId: "default" }
              : undefined;
            try {
              output = await tool.execute(args, ctx);
              status = "succeeded";
              console.log(LOG_PREFIX, "工具返回 [" + tc.name + "]:", output.slice(0, 200));
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              output = "[工具执行失败] " + errMsg;
              errorCode = "E_TOOL_EXECUTION_FAILED";
              console.error(LOG_PREFIX, "工具执行失败 [" + tc.name + "]:", errMsg);
            }
          }
        }

        allToolResults.push({ toolId: tc.name, args, output, status, ...(errorCode ? { errorCode } : {}) });
        // execResults 进 conversation，截断防单条大结果爆窗
        execResults.push({ toolCall: tc, output: truncateToolResult(output) });
      }

      // adapter 负责把 tool result 按各自协议回灌
      // （OpenAI: 多条 role:tool；Anthropic: 合并进 user 的 tool_result block）
      conversation = adapter.appendToolResults(conversation, execResults);

      // 防线②：窗口级压缩——conversation 累积超阈值时摘要化旧轮次
      conversation = compressConversation(conversation);

      continue;
    }

    // 情况2：模型正常返回文本
    const content = chat.text || "";
    console.log(LOG_PREFIX, "Function Calling 完成，最终回复长度=" + content.length);
    const totalUsage = (accInput > 0 || accOutput > 0) ? { input: accInput, output: accOutput } : undefined;
    return { reply: content, toolResults: allToolResults, totalUsage };
  }

  // 超过最大轮数，强制要求模型总结（不带 tools）
  console.warn(LOG_PREFIX, "达到最大轮数 " + MAX_TOOL_ROUNDS + "，强制要求模型回复");
  conversation.push({
    role: "user",
    content: "请基于以上所有工具返回的信息，给出最终回复。不要继续调用工具。",
  });

  let finalReq: ChatRequest = {
    model: settings.model,
    messages: conversation,
    // 不传 temperature：不同型号约束不同，让厂商用默认值
    stream: false,
  };
  if (adapter.applyCacheHints) finalReq = adapter.applyCacheHints(finalReq, settings);
  const http = adapter.buildRequest(finalReq, settings);
  console.log(LOG_PREFIX, "请求:", http.url);

  const controller = new AbortController();
  // 强制总结是最后兜底：对话历史此时往往已很长，30s 不够模型生成完会被 abort，
  // 导致整个 run 抛错用户彻底没回复。放宽到 90s，且失败时降级返回已有工具结果。
  const timer = setTimeout(() => controller.abort(), FORCE_SUMMARY_TIMEOUT_MS);
  try {
    const response = await fetch(http.url, {
      method: "POST",
      signal: controller.signal,
      headers: http.headers,
      body: http.body,
    });

    if (!response.ok) {
      throw new Error("最終回覆請求失敗：HTTP " + response.status);
    }

    const data = await response.json();
    const chat = adapter.parseResponse(data);
    console.log(LOG_PREFIX, "強制回覆完成，長度=" + chat.text.length);
    // 最終回覆也記 usage
    if (chat.usage) {
      accInput += chat.usage.input;
      accOutput += chat.usage.output;
      recordUsage(chat.usage.input, chat.usage.output, 1, settings.model);
    }
    const totalUsage = (accInput > 0 || accOutput > 0) ? { input: accInput, output: accOutput } : undefined;
    return { reply: chat.text, toolResults: allToolResults, totalUsage };
  } catch (err) {
    // 兜底再失敗也別讓整個 run 崩掉（拋錯會讓用戶徹底沒回復）。
    // 用已收集的工具結果拼一個"任務中斷"文案降級返回。
    const reason = err instanceof Error && err.name === "AbortError"
      ? "總結請求超時"
      : (err instanceof Error ? err.message : String(err));
    console.error(LOG_PREFIX, "強制總結也失敗，降級返回已有結果:", reason);
    const fallback = buildFallbackReply(allToolResults, reason);
    const totalUsage = (accInput > 0 || accOutput > 0) ? { input: accInput, output: accOutput } : undefined;
    return { reply: fallback, toolResults: allToolResults, totalUsage };
  } finally {
    clearTimeout(timer);
  }
}
