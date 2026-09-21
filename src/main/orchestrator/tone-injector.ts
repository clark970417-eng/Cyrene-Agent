// 语气注入器 —— 硬约束：embedding 匹配场景，强制注入语气规则到 system prompt。
// 不依赖 LLM 主动调用 invoke_skill，不需要模型判断是否需要查风格。
// 注入的语气规则以「必须遵守」的指令形式出现在 system prompt 末尾。
// 场景样本仅作参考，模型按昔涟的语气表达相同意思。

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { matchScene, type SceneId, type SceneIndex } from "../scene-embedder";
import { type EmbeddingProvider } from "../rag/embedding";

/** 场景匹配阈值——贴着 farewell 最低分 0.722 收紧，所有正确命中都能过。 */
const SCENE_MATCH_THRESHOLD = 0.72;

/** 每个场景的展示名（注入 prompt 时用）。 */
const SCENE_NAMES: Record<string, string> = {
  greeting: "打招呼/相遇",
  comfort: "安慰/陪伴",
  praised: "被夸奖/被喜欢",
  playful: "轻松俏皮",
  farewell: "告别/道别",
  concern: "表达关心",
  daily: "日常闲聊",
};

// 通用语气规则（无论哪个场景都注入）—— 从 prompts/tone-rules.md 读取
export const DEFAULT_TONE_RULES = `## 句式避免

- 避免「不是……而是……」「不只是……更是……」等固定對比句型，直接說重點。
- 避免「首先……其次……」「總的來說……」「本質上……」「歸根結底……」「換句話說……」。
- 不需要固定在結尾重複總結，也不要為了顯得完整而硬湊分點。
- 說明原因要服務於理解或決策，不做多餘的自我解釋。

## 語氣參考

- 預設使用臺灣繁體中文與臺灣常用詞彙；程式碼、專有名詞與使用者指定語言除外。
- 表達感情、撒嬌或被打動時可用「人家」；陳述動作、知識與判斷時自然使用「我」。
- 「呀、啦、呢、嗎」「……」「♪」都要承接真實語氣，不按句數機械添加。
- 只有在話題自然需要延續時才反問，不要每次都用問題把話丟回使用者。
- 偶爾使用符合當下情緒的顏文字或 emoji；同一個符號不要連續重複，嚴肅與技術場景降低頻率。
- 貼圖、文字、emoji 與顏文字可以自然共存；傳出貼圖後仍把真正想說的話說完，不把貼圖當成對話終點。
- 近期用過的貼圖不要立刻重複，讓情緒表達有變化，但也不要為了展示資源而每輪都傳。
- 稱呼使用者暱稱要有理由，例如關心、提醒、分享喜悅或強調重點，不固定放在句首。

## 回覆邊界

- 使用者需要結論或執行協助時先處理事情，不讓人設遮住答案。
- 情緒性對話先準確接住當下；技術與高風險情境則先說清楚事實、風險與下一步。
- 一句話足夠時就停下來；需要完整說明時也不要為了簡短而漏掉重要資訊。`;

/** 从 prompts/tone-rules.md 加载语气规则，文件不存在时用内置默认值。 */
function loadToneRules(): string {
  try {
    const rulesPath = path.join(app.getAppPath(), "prompts", "tone-rules.md");
    if (fs.existsSync(rulesPath)) {
      const content = fs.readFileSync(rulesPath, "utf8").trim();
      // 去掉 frontmatter（如果有）
      const body = content.startsWith("---")
        ? content.replace(/^---[\s\S]*?---\n?/, "").trim()
        : content;
      if (body.length > 0) {
        return "## 语气规则\n\n" + body;
      }
    }
  } catch {
    // fall through to default
  }
  return "## 語氣規則\n\n" + DEFAULT_TONE_RULES;
}

/** 加载场景样本文件中的台词。 */
function loadSceneSamples(scene: SceneId): string {
  if (!scene) return "";
  try {
    const skillDir = path.join(app.getAppPath(), "skills", "cyrene-original-voice", "references");
    const filePath = path.join(skillDir, `${scene}.md`);
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

/** 把样本台词加工成参考指令（非强制引用，而是参照语气）。 */
function buildSampleInstruction(samples: string, scene: SceneId): string {
  if (!samples) return "";
  const lines = samples
    .split("\n")
    .filter((l) => l.startsWith("> 「"))
    .map((l) => l.replace(/^> 「/, "").replace(/」$/, ""))
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `\n### 当前场景：${SCENE_NAMES[scene] || scene}\n参考昔涟在这个场景下的表达方式（不要原封不动复述，按她的语气表达同样的意思）：\n` + lines.map((l) => `- ${l}`).join("\n");
}

/**
 * 主入口：构建语气注入段。
 *
 * @param userInput 用户本轮输入
 * @param recentMessages 最近几轮消息（{ role, content }[]），用于拼上下文（方案 A）
 * @param provider embedding provider
 * @param sceneIndex 启动时建好的场景索引
 * @returns 注入 system prompt 末尾的不可选指令段（空串表示无匹配场景）
 */
export async function buildToneInjection(
  userInput: string,
  recentMessages: Array<{ role: string; content: string }>,
  provider: EmbeddingProvider,
  sceneIndex: SceneIndex,
): Promise<string> {
  // embedding 匹配场景（拼最近 3 轮上下文）
  const match = await matchScene(
    userInput,
    provider,
    sceneIndex,
    SCENE_MATCH_THRESHOLD,
    recentMessages,
  );
  const scene: SceneId = match?.scene ?? "";
  if (!scene) {
    // 没命中任何场景，只注入通用语气规则
    return loadToneRules();
  }

  console.log("[ToneInjector] 场景命中: " + scene + " (score=" + (match?.score.toFixed(3) ?? "?") + ")");

  const samples = loadSceneSamples(scene);
  const sampleInstruction = buildSampleInstruction(samples, scene);
  const toneRules = loadToneRules();

  return toneRules + sampleInstruction;
}
