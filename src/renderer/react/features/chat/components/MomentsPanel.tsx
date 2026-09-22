import { useEffect, useState } from "react";
import { BellOutlined, HeartFilled, PictureOutlined, ReloadOutlined } from "@ant-design/icons";
import type { MemoryPhoto } from "../../../../../shared/album-types";
import type { ProactiveNotification } from "../../../../../shared/proactive-types";
import "./MomentsPanel.css";

export function MomentsPanel({ onOpenAlbum }: { onOpenAlbum: () => void }) {
  const [photos, setPhotos] = useState<MemoryPhoto[]>([]);
  const [notifications, setNotifications] = useState<ProactiveNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    const [nextPhotos, nextNotifications] = await Promise.all([
      window.album?.getPhotos().catch(() => [] as MemoryPhoto[]) ?? [],
      window.proactive?.getNotifications().catch(() => [] as ProactiveNotification[]) ?? [],
    ]);
    setPhotos(nextPhotos.slice().sort((a, b) => b.timestamp - a.timestamp));
    setNotifications(nextNotifications.slice(0, 8));
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  return <section className="cy-moments-panel">
    <header className="cy-moments-panel__header">
      <div><h1>昔漣動態</h1><p>把回憶、近況與生活提醒放在同一條時間線。</p></div>
      <button type="button" onClick={() => void reload()} title="重新整理" aria-label="重新整理"><ReloadOutlined className={loading ? "is-spinning" : ""} /></button>
    </header>
    <div className="cy-moments-panel__feed">
      {notifications.map((item) => <article className="cy-moment-card is-note" key={item.id}>
        <div className="cy-moment-card__meta"><BellOutlined /><strong>昔漣的近況</strong><time>{new Date(item.createdAt).toLocaleString("zh-TW")}</time></div>
        <p>{item.message}</p>
      </article>)}
      {photos.map((photo) => <article className="cy-moment-card" key={photo.id}>
        <div className="cy-moment-card__meta"><PictureOutlined /><strong>回憶相簿</strong><time>{new Date(photo.timestamp).toLocaleString("zh-TW")}</time></div>
        <img src={photo.imageUrl} alt={photo.title || "昔漣的回憶"} />
        <p><strong>{photo.title}</strong>{photo.description ? ` · ${photo.description}` : ""}</p>
        {photo.isFavorite && <span className="cy-moment-card__favorite"><HeartFilled />珍藏</span>}
      </article>)}
      {!loading && photos.length === 0 && notifications.length === 0 && <div className="cy-moments-panel__empty">
        <PictureOutlined /><strong>還沒有動態</strong><p>相簿照片與昔漣的生活提醒會出現在這裡。</p>
        <button type="button" onClick={onOpenAlbum}>開啟回憶相簿</button>
      </div>}
    </div>
  </section>;
}
