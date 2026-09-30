import { useState } from "react";

interface ShareRoomLinkProps {
  roomCode: string;
}

export default function ShareRoomLink({ roomCode }: ShareRoomLinkProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="ghost-btn" onClick={handleShare}>
      {copied ? "Скопировано!" : "🔗 Поделиться"}
    </button>
  );
}
