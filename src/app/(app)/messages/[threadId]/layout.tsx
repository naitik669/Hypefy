import { ViewTransition } from "react";

/**
 * A chat slides in over the inbox from the right, and slides back out to the
 * right when you leave it, like Instagram.
 *
 * There is no loading.tsx beside this on purpose: the inbox stays on screen
 * until the chat is ready and the chat itself slides in, with no loading
 * screen in between. Moving within the chat (its info and media pages) keeps
 * this layout, so nothing slides there. The keyframes are in globals.css.
 */
export default function ThreadLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="dm-in" exit="dm-out" default="none">
      {children}
    </ViewTransition>
  );
}
