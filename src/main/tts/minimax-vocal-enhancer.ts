// MiniMax TTS 語音自然化。
//
// MiniMax speech-2.8 支援 (laughs)、(breath)、(sighs) 等語氣標記。
// 本模組只在明確的語境中少量加入標記，讓昔漣的語音更自然，同時避免
// 標記堆疊或把一般句尾語助詞（例如「好啊」）誤判成驚訝。

export const MINIMAX_VOCAL_ENHANCER_VERSION = 2;

export interface MiniMaxVocalEnhanceOptions {
  /** 明確設為 false 可停用；未指定時預設啟用。 */
  enabled?: boolean;
}

interface TriggerRule {
  pattern: RegExp;
  tag: string;
  position: "before" | "after";
}

const MAX_TAGS_PER_TEXT = 2;
const KNOWN_VOCAL_TAGS = [
  "laughs",
  "chuckle",
  "coughs",
  "clear-throat",
  "groans",
  "breath",
  "pant",
  "inhale",
  "exhale",
  "gasps",
  "sniffs",
  "sighs",
  "snorts",
  "burps",
  "lip-smacking",
  "humming",
  "hissing",
  "emm",
  "sneezes",
] as const;
const VOCAL_TAG_SOURCE = `\\((?:${KNOWN_VOCAL_TAGS.join("|")})\\)`;
const VOCAL_TAG_PATTERN = new RegExp(VOCAL_TAG_SOURCE, "g");
const VOCAL_TAG_BEFORE_PATTERN = new RegExp(`${VOCAL_TAG_SOURCE}$`);
const VOCAL_TAG_AFTER_PATTERN = new RegExp(`^${VOCAL_TAG_SOURCE}`);
const SUPPORTED_MODELS = new Set(["speech-2.8-hd", "speech-2.8-turbo"]);

const RULES: TriggerRule[] = [
  { pattern: /哈{2,}/g, tag: "(laughs)", position: "after" },
  { pattern: /(?:嘿{2,}|呵{2,})/g, tag: "(chuckle)", position: "after" },
  { pattern: /(?:^|(?<=[，。！？!?、：:\s]))(?:嗯|唔)[~～…\.]{0,3}/gu, tag: "(emm)", position: "before" },
  { pattern: /(?:^|(?<=[，。！？!?、：:\s]))emm+m*[\.…]*/giu, tag: "(emm)", position: "before" },
  // 只匹配獨立感嘆詞，不把「好啊」「可以啊」的句尾語助詞當成驚訝。
  { pattern: /(?:^|(?<=[，。！？!?、：:\s]))啊(?=[，！!?？…\s]|$)/gu, tag: "(gasps)", position: "before" },
  { pattern: /(?:^|(?<=[，。！？!?、：:\s]))(?:唉|哎)(?=[，！!?？…\s]|$)/gu, tag: "(sighs)", position: "before" },
  { pattern: /(?:讓我想想|讓昔漣想想|我想想)[，,：:]?\s*$/g, tag: "(breath)", position: "after" },
  { pattern: /(?:請看下面的程式碼|程式碼如下|請看下面的代碼|代碼如下|如下所示|如下表所示)[：:]?\s*$/g, tag: "(breath)", position: "after" },
  { pattern: /[\.…]{2,}\s*$/g, tag: "(sighs)", position: "after" },
];

function countTags(text: string): number {
  return (text.match(VOCAL_TAG_PATTERN) ?? []).length;
}

function hasAdjacentTag(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 16), index);
  const after = text.slice(index, Math.min(text.length, index + 16));
  return VOCAL_TAG_BEFORE_PATTERN.test(before) || VOCAL_TAG_AFTER_PATTERN.test(after);
}

/**
 * 在送往 MiniMax 前加入有限量語氣標記。
 * 函式具冪等性：已經增強過的文字再次傳入時不會重複插入同一批標記。
 */
export function enhanceMiniMaxText(
  text: string,
  options?: MiniMaxVocalEnhanceOptions | null,
): string {
  if (!text || options?.enabled === false) return text;

  let result = text;
  let tagCount = countTags(result);

  for (const rule of RULES) {
    if (tagCount >= MAX_TAGS_PER_TEXT) break;
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(result);
    rule.pattern.lastIndex = 0;
    if (!match) continue;

    const insertAt = rule.position === "before"
      ? match.index
      : match.index + match[0].length;
    if (hasAdjacentTag(result, insertAt)) continue;

    result = result.slice(0, insertAt) + rule.tag + result.slice(insertAt);
    tagCount += 1;
  }

  return result;
}

/** 僅對已確認支援語氣標記的 MiniMax 模型套用增強。 */
export function prepareMiniMaxSpeechText(
  text: string,
  model: string,
  options?: MiniMaxVocalEnhanceOptions | null,
): string {
  return SUPPORTED_MODELS.has(model) ? enhanceMiniMaxText(text, options) : text;
}
