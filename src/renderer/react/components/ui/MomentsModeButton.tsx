import { PictureOutlined } from "@ant-design/icons";

export function MomentsModeButton({ active, onClick }: { active?: boolean; onClick?: () => void }) {
  return <button className={`cy-side-action ${active ? "is-active" : ""}`} onClick={onClick} type="button" title="昔漣動態" aria-pressed={active}>
    <span className="cy-side-action-icon"><PictureOutlined /></span>
    <span className="cy-side-action-label">動態</span>
  </button>;
}
