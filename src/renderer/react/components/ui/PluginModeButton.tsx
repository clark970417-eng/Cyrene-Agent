import { AppstoreOutlined } from "@ant-design/icons";

export function PluginModeButton({ active, onClick }: { active?: boolean; onClick?: () => void }) {
  return <button className={`cy-side-action ${active ? "is-active" : ""}`} onClick={onClick} type="button" title="擴充中心" aria-pressed={active}>
    <span className="cy-side-action-icon"><AppstoreOutlined /></span>
    <span className="cy-side-action-label">擴充</span>
  </button>;
}
