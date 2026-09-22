import { useCallback, useEffect, useState } from "react";
import { FileTextOutlined, FolderOpenOutlined, FolderOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import type { WorkspaceFileEntry, WorkspaceFileErrorCode } from "../../../../../shared/workspace-files-types";
import "./WorkspaceFilesPanel.css";

const ERROR_TEXT: Record<WorkspaceFileErrorCode, string> = {
  NO_WORKSPACE: "請先為目前對話選擇工作資料夾。",
  OUT_OF_ROOT: "這個路徑不在目前工作資料夾內。",
  NOT_FOUND: "檔案或資料夾已不存在。",
  IS_DIRECTORY: "請從左側選擇一個檔案。",
  TOO_LARGE: "檔案超過 1 MB，無法在這裡預覽。",
  BINARY: "這是二進位檔案，無法以文字預覽。",
  LIST_FAILED: "無法讀取資料夾內容。",
  READ_FAILED: "無法讀取檔案內容。",
};

interface TreeNode extends WorkspaceFileEntry {
  expanded?: boolean;
  loading?: boolean;
  children?: TreeNode[];
}

function updateNode(nodes: TreeNode[], relPath: string, update: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((node) => node.relPath === relPath
    ? update(node)
    : node.children ? { ...node, children: updateNode(node.children, relPath, update) } : node);
}

function FileTreeRow({ node, depth, selected, onToggle, onSelect }: {
  node: TreeNode;
  depth: number;
  selected?: string;
  onToggle: (node: TreeNode) => void;
  onSelect: (node: TreeNode) => void;
}) {
  return <>
    <button
      type="button"
      className={`cy-workspace-file-row ${selected === node.relPath ? "is-selected" : ""}`}
      style={{ paddingLeft: 10 + depth * 16 }}
      onClick={() => node.isDir ? onToggle(node) : onSelect(node)}
    >
      <RightOutlined className={node.expanded ? "is-expanded" : ""} aria-hidden="true" />
      {node.isDir
        ? node.expanded ? <FolderOpenOutlined aria-hidden="true" /> : <FolderOutlined aria-hidden="true" />
        : <FileTextOutlined aria-hidden="true" />}
      <span>{node.name}</span>
      {node.loading && <span className="cy-workspace-file-row__loading">讀取中</span>}
    </button>
    {node.expanded && node.children?.map((child) => <FileTreeRow
      key={child.relPath}
      node={child}
      depth={depth + 1}
      selected={selected}
      onToggle={onToggle}
      onSelect={onSelect}
    />)}
  </>;
}

export function WorkspaceFilesPanel({ sessionId, workspaceRoot }: { sessionId: string; workspaceRoot?: string }) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<string>();
  const [content, setContent] = useState("");
  const [size, setSize] = useState(0);
  const [error, setError] = useState<WorkspaceFileErrorCode>();
  const [loading, setLoading] = useState(false);

  const loadRoot = useCallback(async () => {
    if (!workspaceRoot || !window.workspaceFiles) return;
    setLoading(true);
    setError(undefined);
    const result = await window.workspaceFiles.list(sessionId);
    if (result.ok) setNodes(result.entries);
    else setError(result.code);
    setLoading(false);
  }, [sessionId, workspaceRoot]);

  useEffect(() => {
    setSelected(undefined);
    setContent("");
    setNodes([]);
    void loadRoot();
  }, [loadRoot]);

  const toggleFolder = async (node: TreeNode) => {
    if (node.expanded) {
      setNodes((current) => updateNode(current, node.relPath, (item) => ({ ...item, expanded: false })));
      return;
    }
    if (node.children) {
      setNodes((current) => updateNode(current, node.relPath, (item) => ({ ...item, expanded: true })));
      return;
    }
    setNodes((current) => updateNode(current, node.relPath, (item) => ({ ...item, loading: true })));
    const result = await window.workspaceFiles?.list(sessionId, node.relPath);
    setNodes((current) => updateNode(current, node.relPath, (item) => ({
      ...item,
      loading: false,
      expanded: Boolean(result?.ok),
      children: result?.ok ? result.entries : undefined,
    })));
    if (result && !result.ok) setError(result.code);
  };

  const selectFile = async (node: TreeNode) => {
    setSelected(node.relPath);
    setLoading(true);
    setError(undefined);
    const result = await window.workspaceFiles?.read(sessionId, node.relPath);
    if (result?.ok) {
      setContent(result.content);
      setSize(result.size);
    } else if (result) {
      setContent("");
      setError(result.code);
    }
    setLoading(false);
  };

  if (!workspaceRoot) return <div className="cy-workspace-files-state">請先為目前對話選擇工作資料夾。</div>;

  return <div className="cy-workspace-files">
    <div className="cy-workspace-files__toolbar">
      <div><strong>專案檔案</strong><span>{workspaceRoot.split(/[\\/]/).pop()}</span></div>
      <button type="button" onClick={() => void loadRoot()} title="重新整理" aria-label="重新整理"><ReloadOutlined /></button>
    </div>
    <div className="cy-workspace-files__body">
      <nav className="cy-workspace-files__tree" aria-label="工作區檔案">
        {nodes.map((node) => <FileTreeRow key={node.relPath} node={node} depth={0} selected={selected} onToggle={(item) => void toggleFolder(item)} onSelect={(item) => void selectFile(item)} />)}
        {loading && nodes.length === 0 && <div className="cy-workspace-files-state">讀取中…</div>}
      </nav>
      <section className="cy-workspace-files__preview">
        {selected ? <>
          <header><span title={selected}>{selected}</span><small>{(size / 1024).toFixed(1)} KB</small></header>
          {error ? <div className="cy-workspace-files-state">{ERROR_TEXT[error]}</div> : <pre>{content}</pre>}
        </> : <div className="cy-workspace-files-state">選擇檔案即可在這裡預覽</div>}
      </section>
    </div>
  </div>;
}
