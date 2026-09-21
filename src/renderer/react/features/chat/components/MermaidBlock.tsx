import DOMPurify from "dompurify";
import { renderMermaidSVG } from "beautiful-mermaid";
import { Modal } from "antd";
import { useMemo, useState } from "react";

const MAX_DIAGRAM_SOURCE = 30_000;

export function renderMermaidSafely(code: string): string | null {
  if (!code.trim() || code.length > MAX_DIAGRAM_SOURCE) return null;
  try {
    const raw = renderMermaidSVG(code, {
      bg: "#fffafd",
      fg: "#453b48",
      line: "#caa8b9",
      accent: "#e06ead",
      muted: "#8e7d88",
      surface: "#faedf5",
      border: "#e9cddd",
      transparent: true,
    }).replace(/@import\s+url\([^)]*\);?/gi, "");
    return DOMPurify.sanitize(raw, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["script", "foreignObject"],
      FORBID_ATTR: ["onload", "onclick", "onerror"],
    }) || null;
  } catch {
    return null;
  }
}

export function MermaidBlock({ code, streaming = false }: { code: string; streaming?: boolean }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const svg = useMemo(() => streaming ? null : renderMermaidSafely(code), [code, streaming]);

  if (streaming) return <div className="cy-mermaid is-pending">圖表完成後會自動顯示…</div>;
  if (!svg) {
    return (
      <div className="cy-mermaid is-fallback">
        <span>這個圖表暫時無法預覽，已保留原始內容。</span>
        <pre>{code}</pre>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="cy-mermaid is-rendered"
        aria-label="放大查看圖表"
        title="放大查看圖表"
        onClick={() => setPreviewOpen(true)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <Modal
        open={previewOpen}
        footer={null}
        width="min(1100px, 94vw)"
        title="圖表預覽"
        onCancel={() => setPreviewOpen(false)}
        rootClassName="cy-mermaid-preview"
      >
        <div className="cy-mermaid-preview__canvas" dangerouslySetInnerHTML={{ __html: svg }} />
      </Modal>
    </>
  );
}
