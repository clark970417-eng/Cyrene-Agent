import { FolderOpenOutlined } from "@ant-design/icons";

export function InspectorToggle({ active, disabled, onClick }: { active: boolean; disabled?: boolean; onClick: () => void }) {
  return <button
    type="button"
    className={`cy-side-action ${active ? "is-active" : ""}`}
    onClick={onClick}
    disabled={disabled}
    title={disabled ? "先選擇工作資料夾" : "專案檔案"}
    aria-pressed={active}
  >
    <span className="cy-side-action-icon"><FolderOpenOutlined /></span>
    <span className="cy-side-action-label">檔案</span>
  </button>;
}
