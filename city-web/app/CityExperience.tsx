"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CityAction, CitySnapshot } from "../lib/city";

const blossoms = [
  [50, 4, 17], [38, 10, 13], [62, 11, 14], [27, 19, 17], [48, 20, 21],
  [73, 21, 16], [17, 32, 13], [36, 33, 18], [59, 34, 15], [82, 35, 14],
  [26, 48, 15], [48, 47, 18], [69, 49, 19], [10, 49, 10], [90, 51, 10],
  [35, 62, 13], [57, 61, 16], [77, 64, 12], [20, 66, 11], [47, 74, 12],
];

const actions: Array<{ id: CityAction; label: string; note: string }> = [
  { id: "tend", label: "整理花徑", note: "讓街燈與溫度回升" },
  { id: "listen", label: "聆聽回音", note: "找回城市的共鳴" },
  { id: "wish", label: "留下願望", note: "把一點光交給明天" },
];

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export default function CityExperience() {
  const [city, setCity] = useState<CitySnapshot | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<CityAction | null>(null);
  const [error, setError] = useState("");

  const loadCity = useCallback(async () => {
    try {
      const response = await fetch("/api/city", { cache: "no-store" });
      if (!response.ok) throw new Error("城市暫時沒有回應");
      setCity(await response.json());
      setError("");
    } catch {
      setError("雲層正在阻擋連線，城市會在重新連上後繼續結算時間。");
    }
  }, []);

  useEffect(() => {
    void loadCity();
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    const sync = window.setInterval(() => void loadCity(), 60_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(sync);
    };
  }, [loadCity]);

  async function act(action: CityAction) {
    setBusy(action);
    try {
      const response = await fetch("/api/city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("action failed");
      setCity(await response.json());
      setError("");
    } catch {
      setError("這個心意還沒送達，再試一次就好。");
    } finally {
      setBusy(null);
    }
  }

  const cityTime = useMemo(() => new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now), [now]);

  return (
    <main className="city-shell">
      <div className="sky-grain" aria-hidden="true" />
      <div className="aurora aurora-a" aria-hidden="true" />
      <div className="aurora aurora-b" aria-hidden="true" />
      <header className="topbar">
        <a className="wordmark" href="#city" aria-label="回到永晝花庭">
          <span className="wordmark-mark">✦</span>
          <span>永晝花庭<small>ETERNAL DAY GARDEN</small></span>
        </a>
        <div className="live-status"><i />雲端常醒・{cityTime}</div>
      </header>

      <section className="city-stage" id="city" aria-labelledby="city-title">
        <div className="intro">
          <p className="eyebrow">A CITY THAT REMEMBERS TIME</p>
          <h1 id="city-title">你離開時，<br /><em>時間仍在這裡流動。</em></h1>
          <p className="lede">花會長大，燈會亮起，沒有被看見的日子也會好好留下來。</p>
          <div className="intro-meta">
            <span><i />第 {city?.day ?? "—"} 天</span>
            <span>{city?.weather ?? "讀取天穹中"}</span>
          </div>
          <a className="enter-garden" href="#care">走進花庭 <span>↓</span></a>
        </div>

        <div className="city-visual" aria-label="永晝花庭的即時景象">
          <div className="celestial-axis" aria-hidden="true" />
          <div className="orbit orbit-a" />
          <div className="orbit orbit-b" />
          <div className="orbit orbit-c" />
          <div className="star star-a">✦</div>
          <div className="star star-b">·</div>
          <div className="star star-c">✧</div>
          <div className="dome">
            <div className="memory-tree">
              <span className="tree-trunk" />
              <span className="tree-branch branch-left" />
              <span className="tree-branch branch-right" />
              <div className="blossom-cloud" aria-hidden="true">
                {blossoms.map(([x, y, size], index) => (
                  <i key={index} style={{ "--x": `${x}%`, "--y": `${y}%`, "--s": `${size}px`, "--delay": `${index * -0.17}s` } as React.CSSProperties} />
                ))}
              </div>
            </div>
            <div className="garden-path" />
          </div>
          <div className="city-ring">
            {Array.from({ length: 17 }, (_, index) => <i key={index} />)}
          </div>
          <div className="island" />
          <div className="floating-petals" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
          </div>
          <div className="city-caption">
            <span>THE GARDEN · DAY {city?.day ?? "—"}</span>
            <strong>{city?.phase ?? "正在穿過雲層"}</strong>
            <small>{city?.weather ?? "讀取天穹中"}</small>
          </div>
        </div>

        <aside className="pulse-panel" aria-live="polite">
          <div className="panel-heading"><p className="panel-label">城市脈搏</p><span>LIVE</span></div>
          <div className="pulse-orb"><i /><span>此刻<br />安好</span></div>
          <div className="metric"><span>溫度</span><b>{city?.warmth ?? "—"}</b><i style={{ "--level": `${city?.warmth ?? 0}%` } as React.CSSProperties} /></div>
          <div className="metric"><span>共鳴</span><b>{city?.resonance ?? "—"}</b><i style={{ "--level": `${city?.resonance ?? 0}%` } as React.CSSProperties} /></div>
          <div className="petal-count"><span>今日收集</span><strong>{city?.petals.toLocaleString("zh-TW") ?? "—"}</strong><small>片星花</small></div>
          <p className="settled">{city?.settledTicks ? `剛剛補上了 ${city.settledTicks} 段未被看見的時間` : "所有時間都已好好記住"}</p>
        </aside>
      </section>

      <section className="lower-deck" id="care" aria-label="照料城市與最近發生的事">
        <div className="care-block">
          <p className="section-kicker">現在，你想為這裡做什麼？</p>
          <div className="action-list">
            {actions.map((action) => (
              <button key={action.id} onClick={() => void act(action.id)} disabled={!city || busy !== null}>
                <span>{action.label}</span><small>{busy === action.id ? "心意正在穿過雲層…" : action.note}</small><b>↗</b>
              </button>
            ))}
          </div>
          {error && <p className="error-note">{error}</p>}
        </div>

        <div className="journal-block">
          <div className="journal-heading"><p className="section-kicker">最近發生的事</p><span>共來過 {city?.visits ?? "—"} 次</span></div>
          <ol className="journal-list">
            {city?.events.length ? city.events.map((event) => (
              <li key={event.id}><time>{formatTime(event.createdAt)}</time><p>{event.message}</p></li>
            )) : <li className="loading-entry"><time>現在</time><p>城市正在從雲端醒來…</p></li>}
          </ol>
        </div>
      </section>

      <footer><span>✦ 永晝花庭會在雲端繼續生活</span><span>Asia / Taipei</span></footer>
    </main>
  );
}
