// Skill 清單生成 —— 把 enabled skill 拼成注入 system prompt 的清單段。
// 純函數，不碰 electron/registry。

import type { SkillEntry } from "./types";

/**
 * 歧義識別策略。
 * 不"製造"歧義，而是"識別"用戶需求中天然存在的多解讀空間。
 * 用戶說了模糊風格詞（美觀/好看/專業）但沒給具體要求 → 彈卡片讓用戶選。
 * 用戶說了"你自己決定" → 不彈，直接用默認樣式。
 * 用戶給了明確細節 → 不彈，直接做。
 */
const AMBIGUITY_POLICY = [
  "",
  "## 歧義識別與處理策略",
  "",
  "### 何時彈卡片（ask_user_choice）",
  "當用戶**主動**提到風格/樣式相關詞（「美觀」「好看」「專業」「漂亮」「彩色」「規整」等）",
  "且**沒有給出具體要求**時，說明需求存在多解讀空間。此時應調用 ask_user_choice 讓用戶選擇具體方向，再按選擇執行。",
  "",
  "示例：",
  "- 「做個美觀的 Excel」→ 彈卡片（美觀可以是簡潔商務/彩色展示/財務報表等多種解讀）",
  "- 「弄得專業一點」→ 彈卡片（專業可以有多種風格）",
  "- 「做個漂亮點的報告」→ 彈卡片（漂亮可以有多種解讀）",
  "",
  "### 何時不彈卡片",
  "- 用戶說「你自己決定」「看著辦」→ 用戶已授權，直接用默認樣式，不要詢問",
  "- 用戶沒提任何樣式詞（「做個表」「導出 Excel」）→ 用默認樣式直接做",
  "- 用戶給了明確細節（「深藍表頭白色字」「凍結首行」「加邊框」）→ 直接按要求做",
  "- 用戶要求的是功能而非樣式（「加公式」「編輯已有文件」）→ 按功能需求執行",
  "",
  "### 工具選擇",
  "- 簡單表格 / 數據整理 → 直接用 write_excel（已內置美觀樣式），不要走 invoke_skill(xlsx)",
  "- 簡單文檔 / 報告 / 總結 → 直接用 write_word（已內置美觀樣式），不要走 invoke_skill(docx)",
  "- 用戶通過 ask_user_choice 選擇了風格 → 用對應 write_* 工具的 style 參數直接生成，不要走 skill 手寫 XML",
  "- write_excel 支持 5 種主題：default / dark / colorful / simple-business / financial",
  "- write_word 支持 5 種主題：default / academic / clean / elegant / formal",
  "- 用戶給了自定義顏色要求（如「粉色表頭」「深灰背景」）→ 用 write_excel 的 colors 參數傳 ARGB hex 值，你負責把顏色名翻譯成 hex",
  "- 只有用戶明確要求「公式」「財務格式標準」「條件格式」「編輯已有 xlsx」「頁眉頁腳/目錄/圖片」等具體高級需求時，才考慮 invoke_skill",
].join("\n");

/**
 * 生成注入 system prompt 的 skill 清單段（拼在人格層之後）。
 * 只含 enabled skill。返回空串表示無可用 skill（調用方據此跳過拼接）。
 */
export function buildSkillCatalog(skills: SkillEntry[]): string {
  const enabled = skills.filter(s => s.enabled);
  if (enabled.length === 0) return "";
  const lines = enabled.map(s => {
    const toolsTag = s.tools && s.tools.length > 0 ? ` [tools: ${s.tools.join(", ")}]` : "";
    const activationTag = s.manifest?.autoInject === true
      ? " [自动注入：无需再次调用 invoke_skill]"
      : "";
    return `- ${s.id}: ${s.description}${toolsTag}${activationTag}`;
  });
  return [
    "## 可用 Skill",
    "当未自动注入的 skill 适用于当前任务时，先调用 invoke_skill(skill_id) 取详细指令；标记为自动注入的 skill 已在后文提供完整规则，无需再次调用 invoke_skill。",
    "",
    ...lines,
  ].join("\n") + AMBIGUITY_POLICY;
}

/**
 * 为显式声明 autoInject 的复合 Skill 注入完整规则。
 * 能力可用性已由 SkillRegistry.getEnabled() 过滤；读取失败时安全跳过。
 */
export function buildAutoInjectedSkillContext(
  skills: SkillEntry[],
  getBody: (id: string) => string | null,
): string {
  const blocks = skills
    .filter((skill) => skill.enabled && skill.manifest?.autoInject === true)
    .map((skill) => {
      const body = getBody(skill.id)?.trim();
      return body ? `### ${skill.id}\n${body}` : "";
    })
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return [
    "## 自动激活 Skill 指令",
    "以下 Skill 已通过能力门控，当前对话必须直接遵循其完整规则，无需再次调用 invoke_skill。",
    "",
    ...blocks,
  ].join("\n");
}

/**
 * Soul 阶段没有工具能力，只注入 Skill 明确声明的回复策略小节。
 * 其余工具流程仍只属于 TOOL_PHASE，避免模型把工具协议输出成聊天文本。
 */
export function buildAutoInjectedSoulContext(
  skills: SkillEntry[],
  getBody: (id: string) => string | null,
): string {
  const blocks = skills
    .filter((skill) => skill.enabled && skill.manifest?.autoInject === true)
    .map((skill) => {
      const body = getBody(skill.id) ?? "";
      const match = body.match(/^## Soul 回复策略\s*\r?\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
      const section = match?.[1]?.trim();
      return section ? `### ${skill.id}\n${section}` : "";
    })
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return [
    "## 自动激活 Skill 回复策略",
    "以下内容只约束自然语言回复；当前阶段没有工具能力，不得输出工具名、调用标记或工具协议。",
    "",
    ...blocks,
  ].join("\n");
}
