"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { EmbedName } from "@/components/ui/EmbedLabel";

/** Who wrote the comment that was forwarded. */
export type ForwardedCommentAuthor = {
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

export type ForwardedComment = {
  id: string;
  body: string;
  /** Who wrote it, so a reader sees "your comment" rather than their own handle. */
  authorId: string;
  author: ForwardedCommentAuthor | null;
};

/** How far left of the card the bubble reaches, and how far it stops short on the right. */
const OVERHANG = 10;
const INSET_RIGHT = 22;

/**
 * A forwarded comment, laid over the post or Shot it was left on.
 *
 * The card underneath is the ordinary shared-post card, unchanged — this
 * wraps it and hangs the comment off its bottom edge as a chat bubble,
 * sitting *over* the picture rather than inside the frame, so it reads as
 * someone's words about that thing rather than as part of it.
 *
 * Two details earn their constants. The bubble is pulled slightly left of
 * the card so it does not look like a caption bar, and its tail is a child
 * of the bubble painted in the bubble's own colour with no border anywhere —
 * which is the whole reason there is no visible seam where the point meets
 * the body. A bordered bubble with a bordered tail always shows that join.
 *
 * It takes no pointer events: a press anywhere lands on the card beneath, so
 * the "more…" is a sign that there is more to read, not a second control.
 */
export function ForwardedCommentOverlay({
  comment,
  children,
}: {
  /** The comment, or null when it has since been deleted or is not visible. */
  comment: ForwardedComment | null;
  /** The shared post or Shot card this hangs off. */
  children: React.ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const body = comment?.body.trim() ?? "";

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // Clamped to two lines, so the full text is taller than the box it is in.
    setOverflows(el.scrollHeight - el.clientHeight > 2);
  }, [body]);

  const name = comment?.author?.display_name || comment?.author?.username || "Someone";

  return (
    <div className="relative" style={{ paddingLeft: OVERHANG, paddingBottom: 18 }}>
      {children}

      <div className="pointer-events-none absolute bottom-0 left-0" style={{ right: INSET_RIGHT }}>
        <div className="relative flex gap-1.5 rounded-[14px] bg-elevated px-2.5 py-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.65)]">
          {/* The point. Same colour, no border, drawn over the bubble's own
              background — so the two read as one shape. */}
          <span
            aria-hidden
            className="absolute left-[22px] top-[-5px] h-3 w-3 rotate-45 rounded-[2px] bg-elevated"
          />

          {comment ? (
            <>
              <Avatar
                name={name}
                hue={comment.author?.avatar_hue ?? 200}
                src={comment.author?.avatar_url ?? undefined}
                size={16}
                className="relative mt-px shrink-0"
              />
              <div className="relative min-w-0">
                <span className="block truncate text-[10px] font-bold text-foreground/85">{name}</span>
                <div className="relative">
                  <div ref={bodyRef} className="line-clamp-2 text-[11px] leading-[1.3] text-foreground/75">
                    {body}
                  </div>
                  {/* At the end of the second line rather than on a third of
                      its own: the bubble is two lines tall by design, and a
                      third line for one word makes it a paragraph. The
                      bubble's own colour behind it hides the clipped word. */}
                  {overflows && (
                    <span className="absolute bottom-0 right-0 bg-gradient-to-r from-transparent via-elevated via-25% to-elevated pl-7 text-[11px] font-semibold leading-[1.3] text-accent">
                      more…
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <span className="relative text-[11px] italic text-faint">This comment was deleted</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** A person inside the label: their handle, brighter than the sentence. */
function At({ username }: { username: string | null | undefined }) {
  if (!username) return <>someone</>;
  return <EmbedName>@{username}</EmbedName>;
}

/**
 * What the label above a forwarded comment says.
 *
 * Written from the reader's side, which is why it takes two "is this you"
 * flags rather than ids: the reader is never referred to by their own
 * handle, so they see "your post" and "your comment" where a third party
 * sees "@aman's post". Everyone else is named by handle, as the app does
 * everywhere a person is mentioned.
 */
export function ForwardedLabel({
  mine,
  senderUsername,
  commentAuthorUsername,
  commentIsYours,
  contentAuthorUsername,
  contentIsYours,
  kind,
}: {
  /** The reader sent it. */
  mine: boolean;
  senderUsername: string | null | undefined;
  commentAuthorUsername: string | null | undefined;
  commentIsYours: boolean;
  contentAuthorUsername: string | null | undefined;
  contentIsYours: boolean;
  kind: "post" | "shot";
}) {
  const thing = kind === "shot" ? "Shot" : "post";
  // Someone's comment on their own thing reads badly as a name twice over.
  const sameHand =
    !contentIsYours &&
    !commentIsYours &&
    !!contentAuthorUsername &&
    contentAuthorUsername === commentAuthorUsername;

  return (
    <>
      {mine ? "I" : <At username={senderUsername} />} forwarded{" "}
      {commentIsYours ? "your" : <><At username={commentAuthorUsername} />&rsquo;s</>} comment on{" "}
      {contentIsYours ? (
        <>your {thing}</>
      ) : sameHand ? (
        <>their own {thing}</>
      ) : (
        <><At username={contentAuthorUsername} />&rsquo;s {thing}</>
      )}
    </>
  );
}
