import { ViewTransition } from "react";

/**
 * A chat slides in over the inbox from the right, and slides back out to the
 * right when you leave it, like Instagram. The layout wraps both the loading
 * state and the chat, so the slide plays once on the way in and the swap from
 * loading to messages inside it is not animated again (`default="none"`).
 * Moving within the chat (its info and media pages) keeps this layout, so
 * nothing slides there. The keyframes are in globals.css.
 */
export default function ThreadLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="dm-in" exit="dm-out" default="none">
      {children}
    </ViewTransition>
  );
}
