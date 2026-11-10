"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Mic } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { ChatActivityStore } from "@/lib/chat-activity";

type Person = { id?: string; name: string; hue: number; avatarUrl?: string | null };

/**
 * "Someone is typing", drawn by a component that re-renders alone.
 *
 * This used to live inside RealChatView, reading two pieces of its
 * state. That component renders every message in the thread, so each
 * typing broadcast — roughly one per keystroke, per person — re-ran
 * the whole conversation's render. Subscribing to the store here
 * means a keystroke repaints these three dots and nothing else.
 *
 * The scroll nudge comes along for the same reason: it reacted to the
 * same state, so leaving it behind would have kept the dependency
 * that caused the re-render.
 */
export function ChatActivity({
  store,
  members,
  other,
  isGroup,
  nearBottomRef,
  endRef,
}: {
  store: ChatActivityStore;
  members?: Record<string, Person>;
  other: Person;
  isGroup: boolean;
  /** Only nudge if they are already at the bottom; written by the view. */
  nearBottomRef: React.RefObject<boolean>;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { typing, recording } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  const active = recording.length > 0 || typing.length > 0;

  // When someone starts typing or recording and you are already near
  // the bottom, nudge the view down so the indicator is visible.
  useEffect(() => {
    if (active && nearBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [active, nearBottomRef, endRef]);

  if (!active) return null;

  const isRecording = recording.length > 0;
  const ids = isRecording ? recording : typing;
  const first = members?.[ids[0]] ?? other;

  const names = ids.map((id) => members?.[id]?.name ?? (id === other.id ? other.name : "Someone"));
  const label = (() => {
    const verb = isRecording ? "recording a voice message" : "typing";
    if (names.length === 1) return `${names[0]} is ${verb}…`;
    if (names.length === 2) {
      return isRecording
        ? `${names[0]} and ${names[1]} are recording voice messages…`
        : `${names[0]} and ${names[1]} are typing…`;
    }
    return isRecording
      ? `${names[0]} and ${names.length - 1} others are recording…`
      : `${names[0]} and ${names.length - 1} others are typing…`;
  })();

  return (
    <div
      className="flex flex-col items-start gap-0.5"
      data-activity={isRecording ? "recording" : "typing"}
      role="status"
    >
      {isGroup ? (
        <span className="pl-9 text-[11px] font-semibold text-muted">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
      <div className="flex items-end gap-2">
        <Avatar name={first.name} hue={first.hue} size={28} src={first.avatarUrl ?? undefined} />
        {isRecording ? (
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-surface px-3.5 py-3">
            <Mic size={14} className="text-accent" />
            <div className="flex h-4 items-end gap-[3px]">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span
                  key={i}
                  className="w-[3px] animate-mic-wave rounded-full bg-accent"
                  style={{ animationDelay: `${(i % 4) * 0.12 + (i > 3 ? 0.06 : 0)}s` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface px-3.5 py-3">
            {[0, 0.15, 0.3].map((d, i) => (
              <span
                key={i}
                className="h-2 w-2 animate-dot-bounce rounded-full bg-muted"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
