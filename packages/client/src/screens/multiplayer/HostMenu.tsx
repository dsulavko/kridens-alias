import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Modal from "../../components/Modal";

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
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // The dropdown is portaled to <body> and positioned via the trigger's viewport
  // coordinates — rendering it in place would get clipped by `.screen`'s `overflow:
  // hidden` (needed elsewhere for the Safari rounded-corner fix) whenever the menu
  // doesn't fit within the card's own bounds, as happens on the short "start turn" screen.
  useLayoutEffect(() => {
    if (!open) {
      setDropdownStyle(null);
      return;
    }
    const GAP = 8;
    const ESTIMATED_MENU_HEIGHT = 180;

    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const openUpward = rect.bottom + GAP + ESTIMATED_MENU_HEIGHT > window.innerHeight;
      setDropdownStyle({
        position: "fixed",
        left: rect.right,
        transform: "translateX(-100%)",
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + GAP }
          : { top: rect.bottom + GAP }),
      });
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  return (
    <div className="host-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn host-menu-trigger"
        aria-label="Меню хоста"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⚙️
      </button>
      {open &&
        dropdownStyle &&
        createPortal(
          <ul className="host-menu-dropdown" role="menu" ref={dropdownRef} style={dropdownStyle}>
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
          </ul>,
          document.body,
        )}
      {confirmingEnd && (
        <Modal>
          <p>Вы уверены что хотите закончить игру? Комната будет закрыта для всех игроков.</p>
          <div className="actions">
            <button onClick={() => setConfirmingEnd(false)}>Отмена</button>
            <button className="danger" onClick={onEndGame}>
              Закончить игру
            </button>
          </div>
        </Modal>
      )}
      {confirmingChangeRules && (
        <Modal>
          <p>Вы уверены что хотите изменить правила? Все игроки вернутся в лобби, текущий счёт будет сброшен.</p>
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
        </Modal>
      )}
    </div>
  );
}
