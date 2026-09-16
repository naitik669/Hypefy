import { ViewTransition } from "react";

/**
 * A chat slides in over the inbox from the right, and back out to the right
 * when you leave it; the inbox eases a little to the left and dims under it.
 *
 * There is deliberately no loading.tsx beside this. With one, the chat slid in
 * as an empty frame and its messages and theme popped in half a second later.
 * Without one, the inbox stays on screen (its row shaded) until the chat is
 * ready, and the chat arrives whole.
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
