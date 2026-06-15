"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AvatarImg } from "@/components/ui/AvatarImg";
import { ZoomViewer } from "@/components/ui/ZoomViewer";

const LONG_PRESS_MS = 450;

/**
 * Profile avatar with story-ring + gesture handling:
 *  - tap, active Show  → opens the Show (with accent ring shown)
 *  - tap, no Show       → expands the profile photo full-screen
 *  - press & hold       → always expands the profile photo
 */
export function ProfileAvatar({
  name,
  hue,
  avatarUrl,
  size = 84,
  hasActiveShow = false,
  showId,
}: {
  name: string;
  hue: number;
  avatarUrl: string | null | undefined;
  size?: number;
  hasActiveShow?: boolean;
  showId?: string | null;
}) {
  const router = useRouter();
  const [zoomOpen, setZoomOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const canZoom = !!avatarUrl;

  function expand() {
    if (canZoom) setZoomOpen(true);
  }

  function onPointerDown() {
    didLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      expand(); // hold → always expand the photo
    }, LONG_PRESS_MS);
  }

  function clearTimer() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onPointerUp() {
    clearTimer();
    if (didLongPress.current) return; // handled by long-press
    // Short tap
    if (hasActiveShow && showId) {
      router.push(`/shows/${showId}`);
    } else {
      expand();
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={hasActiveShow ? `Watch ${name}'s Show` : `View ${name}'s photo`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onContextMenu={(e) => e.preventDefault()}
        className="block touch-none select-none active:scale-[0.98]"
      >
        {hasActiveShow ? (
          // Accent story ring
          <div className="rounded-[30px] bg-accent p-[3px]">
            <div className="rounded-[27px] bg-background p-[3px]">
              <AvatarImg url={avatarUrl} name={name} hue={hue} size={size} className="rounded-[22px]" />
            </div>
          </div>
        ) : (
          <AvatarImg url={avatarUrl} name={name} hue={hue} size={size} className="rounded-[26px] ring-4 ring-background" />
        )}
      </button>

      {zoomOpen && avatarUrl && <ZoomViewer src={avatarUrl} onClose={() => setZoomOpen(false)} />}
    </>
  );
}
