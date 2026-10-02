import { useEffect, useRef, useState } from "react";

interface HostMenuProps {
  onEndGame: () => void;
  onChangeRules: () => void;
  /** The pause/resume item is only enabled while a turn is actually running. */
  canTogglePause: boolean;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
}

/** Host-only gear menu shown in the corner of the play area for the whole duration of the game. */
export default function HostMenu({
  onEndGame,
  onChangeRules,
  canTogglePause,
  paused,
  onPause,
  onResume,
}: HostMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [confirmingChangeRules, setConfirmingChangeRules] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="host-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn host-menu-trigger"
        aria-label="Меню хоста"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⚙️
      </button>
      {open && (
        <ul className="host-menu-dropdown" role="menu">
          <li>
            <button
              type="button"
              role="menuitem"
              disabled={!canTogglePause}
              onClick={() => {
                setOpen(false);
                if (paused) onResume();
                else onPause();
              }}
            >
              {paused ? "▶️ Продолжить" : "⏸️ Пауза"}
            </button>
          </li>
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setConfirmingChangeRules(true);
              }}
            >
              📝 Изменить правила
            </button>
          </li>
          <li>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setOpen(false);
                setConfirmingEnd(true);
              }}
            >
              ⏹️ Закончить игру
            </button>
          </li>
        </ul>
      )}
      {confirmingEnd && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Вы уверены что хотите закончить игру? Комната будет закрыта для всех игроков.</p>
            <div className="actions">
              <button onClick={() => setConfirmingEnd(false)}>Отмена</button>
              <button className="danger" onClick={onEndGame}>
                Закончить игру
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmingChangeRules && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              Вы уверены что хотите изменить правила? Все игроки вернутся в лобби, текущий счёт будет сброшен.
            </p>
            <div className="actions">
              <button onClick={() => setConfirmingChangeRules(false)}>Отмена</button>
              <button
                className="primary"
                onClick={() => {
                  setConfirmingChangeRules(false);
                  onChangeRules();
                }}
              >
                Изменить правила
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
