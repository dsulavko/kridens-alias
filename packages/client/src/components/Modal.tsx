import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  children: ReactNode;
}

/**
 * Portals the overlay to <body>. Rendered in place inside `.screen`, a `position: fixed`
 * overlay is confined to `.screen`'s box (its `backdrop-filter` makes it the containing
 * block) and clipped by `.screen`'s `overflow: hidden` whenever the modal is taller than
 * whatever sub-screen happens to be showing — e.g. the short "start turn" screen. Portaling
 * centers it on the real viewport instead, so it always has room.
 */
export default function Modal({ children }: ModalProps) {
  return createPortal(
    <div className="modal-overlay" style={{ borderRadius: 0 }}>
      <div className="modal">{children}</div>
    </div>,
    document.body,
  );
}
