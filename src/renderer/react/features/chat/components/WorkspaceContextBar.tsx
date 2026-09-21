import { FolderOpenOutlined, LoadingOutlined, MessageOutlined } from "@ant-design/icons";
import type { ConversationMode } from "../../../../../shared/chat-types";
import "./WorkspaceContextBar.css";

const MODE_LABELS: Record<ConversationMode, string> = {
  chat: "對話",
  work: "工作",
  code: "程式",
  learn: "學習",
  daily: "日常",
};

type WorkspaceContextBarProps = {
  mode: ConversationMode;
  workspaceName?: string;
  sessionTitle?: string;
  running: boolean;
  queuedCount: number;
  onChooseWorkspace(): void;
};

export function WorkspaceContextBar({
  mode,
  workspaceName,
  sessionTitle,
  running,
  queuedCount,
  onChooseWorkspace,
}: WorkspaceContextBarProps) {
  return (
    <div className="cy-workspace-context" aria-label="目前工作區狀態">
      <div className="cy-workspace-context__identity">
        <MessageOutlined aria-hidden="true" />
        <strong>{sessionTitle || "新對話"}</strong>
        <span>{MODE_LABELS[mode]}</span>
      </div>
      <div className="cy-workspace-context__actions">
        {queuedCount > 0 && <span className="cy-workspace-context__queue">待送出 {queuedCount}</span>}
        <span className={`cy-workspace-context__state ${running ? "is-running" : ""}`}>
          {running && <LoadingOutlined aria-hidden="true" />}
          {running ? "處理中" : "已就緒"}
        </span>
        {mode !== "chat" && (
          <button type="button" onClick={onChooseWorkspace} title="選擇工作區">
            <FolderOpenOutlined aria-hidden="true" />
            <span>{workspaceName || "選擇工作區"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
