"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, QrCode } from "lucide-react";

export function RemoteQrCard() {
  const [remoteUrl, setRemoteUrl] = useState("");

  useEffect(() => {
    setRemoteUrl(`${window.location.origin}/remote`);
  }, []);

  const qrUrl = useMemo(() => {
    if (!remoteUrl.trim()) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(remoteUrl.trim())}`;
  }, [remoteUrl]);

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-4 text-sm">
      <div className="font-semibold text-text mb-3 flex items-center gap-2">
        <QrCode size={14} />
        Remote page
      </div>

      <div className="rounded-md border border-border bg-white p-2 mb-3">
        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrUrl} alt="QR code for remote page" className="w-full aspect-square object-contain" />
        ) : (
          <div className="aspect-square grid place-items-center text-xs text-text-subtle">Loading...</div>
        )}
      </div>

      <input
        value={remoteUrl}
        onChange={(e) => setRemoteUrl(e.target.value)}
        className="w-full bg-bg-panel border border-border rounded-md px-2.5 py-1.5 text-xs font-mono text-text focus:outline-none focus:border-accent"
      />

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={() => navigator.clipboard.writeText(remoteUrl)}
          className="rounded-md border border-border bg-bg-panel px-2.5 py-1.5 text-xs text-text-muted hover:text-text flex items-center justify-center gap-1.5"
        >
          <Copy size={12} />
          Copy
        </button>
        <a
          href={remoteUrl || "/remote"}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border bg-bg-panel px-2.5 py-1.5 text-xs text-text-muted hover:text-text flex items-center justify-center gap-1.5"
        >
          <ExternalLink size={12} />
          Open
        </a>
      </div>

      <div className="text-[11px] text-text-subtle mt-2 leading-relaxed">
        For a phone, use the computer LAN address instead of localhost.
      </div>
    </div>
  );
}
