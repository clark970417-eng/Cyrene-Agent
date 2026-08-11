// 上下文管理器 —— 防止 FC 循環裡 conversation 無限增長導致超時/爆窗。
//
// 兩道防線（分層兜底）：
//   ① 工具結果入隊前截斷（truncateToolResult）—— 防單條大結果爆窗
//   ② 窗口級壓縮（compressConversation）—— 防多輪累積爆窗
//
// 閾值設計（基於 128K context window 的雲端大模型預算）：
//   系統提示（人格+工具schema+策略段）  ≈ 6K tokens
//   模型輸出預留（thinking+回覆）        ≈ 4K tokens
//   安全餘量                             ≈ 4K tokens
//   ────────────────────────────
//   FC 循環 tool results 可用空間        ≈ 114K tokens
//
//   單條截斷 12000 字符（≈4K tokens）—— 不超過總窗口 3%，兜極端大結果
//   窗口壓縮 80000 字符（≈27K tokens）—— 約跑 6-8 輪重工具後觸發，不頻繁

const TOOL_RESULT_MAX_CHARS = 12000;
const WINDOW_COMPRESS_THRESHOLD_TOKENS = 27000;
const WINDOW_COMPRESS_THRESHOLD_CHARS = 80000;
const KEEP_RECENT_ROUNDS = 6; // 壓縮時保留最近 6 輪完整（system + 最近對話 + 工具結果）

/**
 * 截斷單條工具返回內容。超長內容截斷後標註原始長度。
 * 作用在 execResults（進 conversation 的那條），allToolResults 保留完整原文。
 */
export function truncateToolResult(content: string, maxChars: number = TOOL_RESULT_MAX_CHARS): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) +
    `\n[truncated: 原始 ${content.length} 字符，已截斷至 ${maxChars} 字符]`;
}

/**
 * 粗估 token 數。不引入 tiktoken，按字符數估算：
 *   中文 1 字符 ≈ 1 token，英文 4 字符 ≈ 1 token，混合取 chars/3 粗估。
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * 估算整个 conversation 数组的 token 总量。
 */
function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
          return String((block as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content ?? "");
}

export function estimateConversationTokens(messages: Array<{ content: unknown }>): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(contentToText(m.content));
  }
  return total;
}

/**
 * 窗口级压缩：conversation 超阈值时，把旧的轮次摘要化。
 *
 * 策略：
 *   - system 消息（role=system）：永远保留
 *   - 最近 KEEP_RECENT_ROUNDS 轮：完整保留
 *   - 更早的轮次：
 *     - tool/assistant 消息内容超 500 字符 → 截断到 200 字符 + "[compressed]"
 *     - 短消息原样保留
 *   - 压缩后仍超阈值 → 从最早的非 system 消息开始丢弃
 *
 * 返回压缩后的新数组（不修改原数组）。
 */
export function compressConversation<T extends { role?: string; content?: unknown }>(
  messages: T[],
  thresholdChars: number = WINDOW_COMPRESS_THRESHOLD_CHARS,
  keepRecent: number = KEEP_RECENT_ROUNDS,
): T[] {
  const totalChars = messages.reduce((sum, m) => sum + contentToText(m.content).length, 0);
  if (totalChars <= thresholdChars) return messages;

  console.log(`[ContextManager] 触发压缩: ${totalChars} 字符 > 阈值 ${thresholdChars}`);

  const result: T[] = [...messages];
  const nonSystemIndices: number[] = [];

  for (let i = 0; i < result.length; i++) {
    if (result[i].role !== "system") {
      nonSystemIndices.push(i);
    }
  }

  // 需要壓縮的：非 system 消息中，超出最近 keepRecent 條的部分
  const compressFromIndex = nonSystemIndices.length > keepRecent
    ? nonSystemIndices[nonSystemIndices.length - keepRecent]
    : -1;

  if (compressFromIndex > 0) {
    for (let i = 0; i < compressFromIndex; i++) {
      if (result[i].role === "system") continue;
      const msg = result[i];
      const content = contentToText(msg.content);
      if (content.length > 500) {
        result[i] = {
          ...msg,
          content: content.slice(0, 200) + "\n[compressed: 原始 " + content.length + " 字符]",
        } as T;
      }
    }
  }

  // 压缩后仍超阈值 → 从最早的非 system 消息开始丢弃
  let compressedChars = result.reduce((sum, m) => sum + contentToText(m.content).length, 0);
  while (compressedChars > thresholdChars) {
    const firstNonSystem = result.findIndex(m => m.role !== "system");
    if (firstNonSystem === -1 || firstNonSystem >= result.length - keepRecent) break;
    compressedChars -= contentToText(result[firstNonSystem].content).length;
    result.splice(firstNonSystem, 1);
    console.log("[ContextManager] 丢弃最早一条消息，剩余 " + compressedChars + " 字符");
  }

  const finalChars = result.reduce((sum, m) => sum + contentToText(m.content).length, 0);
  console.log(`[ContextManager] 压缩完成: ${totalChars} → ${finalChars} 字符`);

  return result;
}

export { WINDOW_COMPRESS_THRESHOLD_TOKENS, WINDOW_COMPRESS_THRESHOLD_CHARS };
