"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { X, Share, PlusSquare, Download } from "lucide-react";
import { CenterModal } from "@/components/ui/CenterModal";
import { HypefyLogo } from "@/components/HypefyLogo";

const SNOOZE_KEY = "hypefy_install_snooze";
const VISITS_KEY = "hypefy_visits";
const SNOOZE_DAYS = 14;
const MIN_VISITS = 2;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag. Declared here rather than cast to
    // any: the only unknown is this one optional boolean, and `as any`
    // turns off checking for the whole expression.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Invites returning visitors to install the PWA. Chromium browsers get the
 * native install prompt (via the captured beforeinstallprompt event); iOS
 * Safari gets a short Add-to-Home-Screen walkthrough. Shows from the 2nd
 * visit onward, snoozes for two weeks on dismiss, never shows when the app
 * is already installed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  /**
   * Whether this is iOS — read from the user agent, which never changes.
   *
   * Was state set from inside the effect below, which react-hooks flags:
   * it schedules a second render as soon as the first commits. It is not
   * state at all, it is a fact about the browser, so it is read like one.
   * The server snapshot is false because `navigator` does not exist there.
   */
  const ios = useSyncExternalStore(
    () => () => {},
    () => isIos(),
    () => false,
  );

  useEffect(() => {
    if (isStandalone()) return;

    // Visit counting — only pitch installation to people who came back.
    let visits = 0;
    try {
      visits = Number(localStorage.getItem(VISITS_KEY) ?? "0") + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
      const snoozedAt = Number(localStorage.getItem(SNOOZE_KEY) ?? "0");
      if (Date.now() - snoozedAt < SNOOZE_DAYS * 86_400_000) return;
    } catch {
      return; // storage unavailable (private mode), skip quietly
    }
    if (visits < MIN_VISITS) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS never fires beforeinstallprompt — show the banner directly.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      iosTimer = setTimeout(() => setVisible(true), 4000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  function snooze() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setVisible(false);
      else snooze();
      setDeferred(null);
    } else if (ios) {
      setIosHelpOpen(true);
    }
  }

  if (!visible) return null;

  return (
    <>
      <div className="animate-toast-drop fixed inset-x-0 bottom-[var(--nav-space)] z-[140] flex justify-center px-4">
        <div className="flex w-full max-w-[440px] items-center gap-3 rounded-2xl border border-border bg-elevated/95 px-3.5 py-3 shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface">
            <HypefyLogo className="h-6 w-6 text-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">
              Get the app<span className="text-accent">.</span>
            </p>
            <p className="truncate text-xs text-muted">Hypefy on your home screen, faster, full screen.</p>
          </div>
          <button
            type="button"
            onClick={install}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-pill bg-accent px-3.5 text-xs font-bold text-accent-ink transition-transform active:scale-95"
          >
            <Download size={13} /> Install
          </button>
          <button
            type="button"
            onClick={snooze}
            aria-label="Not now"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* iOS walkthrough — Safari has no install API */}
      <CenterModal
        open={iosHelpOpen}
        onClose={() => { setIosHelpOpen(false); snooze(); }}
        title="Add to Home Screen"
        subtitle="two taps in Safari and you're in"
      >
        <ol className="flex flex-col gap-3 pb-2">
          <li className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-accent">
              <Share size={17} />
            </span>
            <p className="text-sm">
              Tap the <span className="font-semibold">Share</span> button in Safari&apos;s toolbar
            </p>
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-accent">
              <PlusSquare size={17} />
            </span>
            <p className="text-sm">
              Choose <span className="font-semibold">Add to Home Screen</span>, then <span className="font-semibold">Add</span>
            </p>
          </li>
        </ol>
      </CenterModal>
    </>
  );
}
