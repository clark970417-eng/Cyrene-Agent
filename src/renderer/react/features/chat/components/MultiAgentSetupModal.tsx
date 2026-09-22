import { CloseOutlined, ReloadOutlined, TeamOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { listConversationCharacters } from "../character-assets";
import "./MultiAgentSetupModal.css";

const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 4;

interface MultiAgentSetupModalProps {
  open: boolean;
  busy?: boolean;
  onClose(): void;
  onCreate(participantIdentityIds: string[]): void;
}

function randomParticipantIds(ids: string[], count = 3): string[] {
  return [...ids]
    .map((id) => ({ id, rank: Math.random() }))
    .sort((left, right) => left.rank - right.rank)
    .slice(0, count)
    .map(({ id }) => id);
}

export function MultiAgentSetupModal({ open, busy = false, onClose, onCreate }: MultiAgentSetupModalProps) {
  const characters = useMemo(() => listConversationCharacters(), []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds((current) => current.length >= MIN_PARTICIPANTS
      ? current
      : randomParticipantIds(characters.map((character) => character.id)));
  }, [characters, open]);

  if (!open) return null;

  const toggleCharacter = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_PARTICIPANTS) return current;
      return [...current, id];
    });
  };

  return (
    <div className="cy-multi-setup-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !busy) onClose();
    }}>
      <section className="cy-multi-setup" role="dialog" aria-modal="true" aria-labelledby="cy-multi-setup-title">
        <header className="cy-multi-setup__header">
          <span className="cy-multi-setup__mark" aria-hidden="true"><TeamOutlined /></span>
          <span>
            <span className="cy-multi-setup__eyebrow">多人聊天室</span>
            <h2 id="cy-multi-setup-title">選擇固定成員</h2>
          </span>
          <button type="button" className="cy-multi-setup__icon-button" onClick={onClose} disabled={busy} aria-label="關閉">
            <CloseOutlined />
          </button>
        </header>

        <div className="cy-multi-setup__selection" aria-live="polite">
          <div className="cy-multi-setup__stack" aria-hidden="true">
            {selectedIds.map((id) => {
              const character = characters.find((item) => item.id === id);
              return character ? <img src={character.avatarUrl} alt="" key={id} /> : null;
            })}
          </div>
          <span>{selectedIds.length}/{MAX_PARTICIPANTS} 位成員</span>
          <button
            type="button"
            className="cy-multi-setup__shuffle"
            onClick={() => setSelectedIds(randomParticipantIds(characters.map((character) => character.id)))}
            disabled={busy}
          >
            <ReloadOutlined /> 隨機三人
          </button>
        </div>

        <div className="cy-multi-setup__grid">
          {characters.map((character) => {
            const selectedIndex = selectedIds.indexOf(character.id);
            const selected = selectedIndex >= 0;
            const limitReached = !selected && selectedIds.length >= MAX_PARTICIPANTS;
            return (
              <button
                type="button"
                className={`cy-multi-setup__character ${selected ? "is-selected" : ""}`}
                onClick={() => toggleCharacter(character.id)}
                disabled={busy || limitReached}
                aria-pressed={selected}
                key={character.id}
              >
                <span className="cy-multi-setup__portrait">
                  <img src={character.avatarUrl} alt="" />
                  {selected && <span className="cy-multi-setup__order">{selectedIndex + 1}</span>}
                </span>
                <strong>{character.name}</strong>
                <small>{character.appearanceTags.slice(0, 2).join(" · ")}</small>
              </button>
            );
          })}
        </div>

        <footer className="cy-multi-setup__footer">
          <span>成員建立後固定在這個聊天室，保留各自語氣與上下文。</span>
          <button
            type="button"
            className="cy-multi-setup__create"
            disabled={busy || selectedIds.length < MIN_PARTICIPANTS}
            onClick={() => onCreate(selectedIds)}
          >
            <TeamOutlined /> {busy ? "正在建立…" : "建立聊天室"}
          </button>
        </footer>
      </section>
    </div>
  );
}
