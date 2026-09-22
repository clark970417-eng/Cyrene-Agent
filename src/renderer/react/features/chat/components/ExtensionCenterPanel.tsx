import { AppstoreOutlined, BulbOutlined, RobotOutlined, SettingOutlined, ThunderboltOutlined, ToolOutlined } from "@ant-design/icons";
import "./ExtensionCenterPanel.css";

const SECTIONS = [
  { id: "tool", title: "工具能力", description: "控制 Work、Code 與 Learn 可以使用的工具。", icon: ToolOutlined },
  { id: "skill", title: "技能中心", description: "管理昔漣可載入的專門技能與工作流程。", icon: ThunderboltOutlined },
  { id: "model", title: "模型中心", description: "選擇模型、推理方式與帳號來源。", icon: BulbOutlined },
  { id: "external", title: "外部應用", description: "設定 Discord、Gemini、Spotify 與通知服務。", icon: RobotOutlined },
] as const;

export function ExtensionCenterPanel({ onOpenPanel, onOpenSettings }: {
  onOpenPanel: (panel: "tool" | "skill" | "model") => void;
  onOpenSettings: () => void;
}) {
  return <section className="cy-extension-center">
    <header><AppstoreOutlined /><div><h1>擴充中心</h1><p>集中管理昔漣的模型、技能、工具與外部服務。</p></div></header>
    <div className="cy-extension-center__grid">
      {SECTIONS.map(({ id, title, description, icon: Icon }) => <button key={id} type="button" onClick={() => id === "external" ? onOpenSettings() : onOpenPanel(id)}>
        <Icon /><span><strong>{title}</strong><small>{description}</small></span><SettingOutlined />
      </button>)}
    </div>
    <p className="cy-extension-center__note">新的能力會加入這個中心，不會取代你原有的主視窗或設定頁。</p>
  </section>;
}
