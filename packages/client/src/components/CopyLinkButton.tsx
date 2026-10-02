import { useState } from "react";

interface CopyLinkButtonProps {
  url: string;
  label: string;
}

export default function CopyLinkButton({ url, label }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="ghost-btn" onClick={handleCopy}>
      {copied ? "Скопировано!" : label}
    </button>
  );
}
