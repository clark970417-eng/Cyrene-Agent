import { FolderOpenOutlined } from "@ant-design/icons";
import type { ConversationMode } from "../../../../../shared/chat-types";
import "./WorkspaceEmptyState.css";

const COPY: Partial<Record<ConversationMode, { eyebrow: string; title: string; action: string }>> = {
  work: { eyebrow: "WORK", title: "先選擇這項任務要使用的資料夾", action: "選擇工作資料夾" },
  code: { eyebrow: "CODE", title: "選擇程式專案後開始工作", action: "選擇程式專案" },
  daily: { eyebrow: "DAILY", title: "選擇要整理的日常資料夾", action: "選擇資料夾" },
  learn: { eyebrow: "LEARN", title: "選擇 Obsidian Vault 或學習資料夾", action: "選擇學習工作區" },
};

export function WorkspaceEmptyState({ mode, onChooseWorkspace }: {
  mode: ConversationMode;
  onChooseWorkspace(): void;
}) {
  const copy = COPY[mode];
  if (!copy) return null;
  return (
    <section className="cy-workspace-empty" aria-label={copy.title}>
      <span className="cy-workspace-empty__eyebrow">{copy.eyebrow}</span>
      <span className="cy-workspace-empty__icon" aria-hidden="true"><FolderOpenOutlined /></span>
      <h1>{copy.title}</h1>
      <button type="button" onClick={onChooseWorkspace}>
        <FolderOpenOutlined />
        {copy.action}
      </button>
    </section>
  );
}
