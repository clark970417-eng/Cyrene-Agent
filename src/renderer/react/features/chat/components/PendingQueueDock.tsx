import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PaperClipOutlined,
  UnorderedListOutlined,
  UpOutlined,
} from "@ant-design/icons";
import React, { useEffect, useState } from "react";

export interface PendingQueueItem {
  id: string;
  content: string;
  attachmentCount?: number;
}

export function PendingQueueDock({
  items,
  onEdit,
  onRemove,
}: {
  items: PendingQueueItem[];
  onEdit?: (id: string, content: string) => Promise<boolean> | boolean;
  onRemove?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (items.length <= 1) setExpanded(false);
    if (editing && !items.some((item) => item.id === editing.id)) setEditing(null);
  }, [editing, items]);

  if (items.length === 0) return null;
  const visible = items.length === 1 || expanded || editing !== null;

  async function saveEdit() {
    if (!editing?.content.trim() || !onEdit) return;
    setBusy(true);
    try {
      if (await onEdit(editing.id, editing.content.trim())) setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cy-queue-dock" aria-label="待發送訊息">
      {items.length > 1 ? (
        <button
          type="button"
          className="cy-queue-dock__header"
          aria-expanded={visible}
          onClick={() => setExpanded((current) => !current)}
        >
          <UnorderedListOutlined aria-hidden="true" />
          <span>待發送 {items.length} 則</span>
          {visible ? <UpOutlined aria-hidden="true" /> : <DownOutlined aria-hidden="true" />}
        </button>
      ) : null}
      {visible ? (
        <div className="cy-queue-dock__list">
          {items.map((item) => {
            const isEditing = editing?.id === item.id;
            return (
              <div className="cy-queue-dock__row" key={item.id}>
                {items.length === 1 ? <UnorderedListOutlined className="cy-queue-dock__lead" aria-hidden="true" /> : null}
                {isEditing ? (
                  <input
                    className="cy-queue-dock__editor"
                    value={editing.content}
                    autoFocus
                    disabled={busy}
                    aria-label="編輯待發送訊息"
                    onChange={(event) => setEditing({ id: item.id, content: event.currentTarget.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void saveEdit();
                      } else if (event.key === "Escape") {
                        setEditing(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="cy-queue-dock__content"
                    title={item.content}
                    disabled={busy}
                    onClick={() => setEditing({ id: item.id, content: item.content })}
                  >
                    <span>{item.content || "僅附件訊息"}</span>
                    {item.attachmentCount ? <small><PaperClipOutlined /> {item.attachmentCount}</small> : null}
                  </button>
                )}
                <div className="cy-queue-dock__actions">
                  {isEditing ? (
                    <>
                      <button type="button" aria-label="儲存修改" title="儲存修改" disabled={busy || !editing.content.trim()} onClick={() => void saveEdit()}><CheckOutlined /></button>
                      <button type="button" aria-label="取消修改" title="取消修改" disabled={busy} onClick={() => setEditing(null)}><CloseOutlined /></button>
                    </>
                  ) : (
                    <>
                      <button type="button" aria-label="編輯訊息" title="編輯訊息" disabled={busy} onClick={() => setEditing({ id: item.id, content: item.content })}><EditOutlined /></button>
                      <button type="button" aria-label="移除訊息" title="移除訊息" disabled={busy} onClick={() => onRemove?.(item.id)}><DeleteOutlined /></button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
