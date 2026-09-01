"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import QRCode from "qrcode";

/**
 * QR for a profile, rendered in the browser rather than fetched — the code
 * is derived from the username, so a round trip would buy nothing.
 *
 * Drawn on white with a quiet zone. Scanners need the light module colour
 * to be genuinely light and the border to be present; a "dark mode" QR on
 * the card's own gradient is the classic reason one will not scan.
 */
export function ProfileCardQr({
  url,
  name,
  username,
  onBack,
}: {
  url: string;
  name: string;
  username: string | null;
  onBack: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 720,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then((d) => {
        if (alive) setDataUrl(d);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <div className="animate-rise flex flex-col items-center gap-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl">
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to card"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-white/10"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-bold">Scan to open</span>
      </div>

      <div className="rounded-2xl bg-white p-3">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={`QR code linking to ${url}`} className="h-52 w-52" />
        ) : (
          <div className="flex h-52 w-52 items-center justify-center text-xs text-black/40">
            {failed ? "Could not draw code" : "…"}
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="text-sm font-bold">{name}</p>
        {username && <p className="text-xs text-muted">@{username}</p>}
        <p className="mt-1 text-[11px] break-all text-faint">{url}</p>
      </div>

      {dataUrl && (
        <a
          href={dataUrl}
          download={`hypefy-${username ?? "profile"}-qr.png`}
          className="flex items-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-xs font-bold text-accent-ink transition active:scale-95"
        >
          <Download size={14} />
          Save code
        </a>
      )}
    </div>
  );
}
