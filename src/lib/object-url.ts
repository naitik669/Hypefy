"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * A blob URL for a picked file, released when nothing needs it any more.
 *
 * The obvious spelling of this —
 *
 *     const url = useMemo(() => URL.createObjectURL(file), [file]);
 *     useEffect(() => () => URL.revokeObjectURL(url), [url]);
 *
 * — is wrong in a way that is almost invisible. React runs effects
 * mount → cleanup → mount in development, so the cleanup revokes a URL the
 * remounted component is still holding. The element that already loaded it
 * keeps playing, because revoking does not disturb a decoded resource; but
 * every *new* consumer of that URL fails. That is exactly the shape of the
 * bug: a clip plays happily in the editor while the filmstrip beside it
 * decodes nothing, because extracting frames opens a second video element.
 *
 * Deferring the revoke by a tick fixes it. A remount happens in the same
 * commit and cancels the pending release; a real unmount has nothing to
 * cancel it, so the URL is still freed and a long session through the
 * creator does not mint blob URLs forever.
 */
export function useObjectUrl(file: File): string {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Whatever is being released, this run needs it — cancel that.
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    return () => {
      pending.current = setTimeout(() => URL.revokeObjectURL(url), 0);
    };
  }, [url]);

  return url;
}
