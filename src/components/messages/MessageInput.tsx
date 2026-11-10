"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useMentionHashtag, applySuggestion, SuggestionDropdown } from "@/components/ui/MentionHashtagPicker";
import { readDraft, writeDraft } from "@/lib/chat-drafts";

/**
 * The box you type a message in, and everything that changes as you type.
 *
 * It exists as its own component for one reason: what you are typing used to
 * be state in RealChatView, which renders every message in the conversation.
 * So each keystroke re-rendered the whole thread — and on a long thread that
 * is what made a chat stop responding while you typed. The other person's
 * typing had the identical problem and was moved out first (lib/chat-activity
 * and ChatActivity); this is the same fix for your own.
 *
 * Three things change per keystroke and all three live here: the value, where
 * the caret is, and the mention and hashtag suggestions derived from both. The
 * draft comes with them, because it is written from the value on every change.
 *
 * What the thread still needs to know is reduced to one bit — whether the box
 * is empty — because that is what decides whether the bar shows a microphone
 * or a send button. A boolean that flips twice per message instead of a string
 * that changes on every character. React drops a setState to the value it
 * already holds, so the parent re-renders on the transition and not before.
 *
 * Everything else the thread does with the text (sending, saving an edit,
 * captioning a folder of photos) wants it once, at the moment of the tap, so
 * it reads it through the handle rather than holding a copy.
 */

export type MessageInputHandle = {
  /** What is in the box right now. */
  getValue: () => string;
  /** Put something in the box — a draft, a prefill, an edit, or nothing. */
  setValue: (next: string) => void;
  /** Focus with the caret at the end, for stepping into an edit. */
  focusEnd: () => void;
};

export function MessageInput({
  ref,
  currentUserId,
  conversationId,
  editing,
  placeholder,
  maxLength,
  onEnter,
  onTyping,
  onHasTextChange,
  onValueChange,
}: {
  ref?: Ref<MessageInputHandle>;
  currentUserId: string;
  conversationId: string;
  /** While an existing message is being edited the box holds that message, so
   *  it must not be saved over the draft of something unsent. */
  editing: boolean;
  placeholder: string;
  maxLength?: number;
  onEnter: () => void;
  onTyping: () => void;
  onHasTextChange: (hasText: boolean) => void;
  /**
   * Given only when the thread needs the value itself as it is typed, which
   * is one case: a folder of photos shows its caption on the message while
   * you write it. That preview cannot work from a boolean, so in that mode
   * the thread does re-render per keystroke — deliberately, and only there.
   * Left undefined the rest of the time, which is the point.
   */
  onValueChange?: (value: string) => void;
}) {
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const el = useRef<HTMLInputElement>(null);
  const { suggestions, reset } = useMentionHashtag(text, cursor);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => text,
      setValue: (next) => setText(next),
      focusEnd: () => {
        const node = el.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(node.value.length, node.value.length);
      },
    }),
    [text],
  );

  // One bit upward, on the transition only.
  useEffect(() => {
    onHasTextChange(text.trim().length > 0);
  }, [text, onHasTextChange]);

  // And the value itself, only where something upward draws it.
  useEffect(() => {
    onValueChange?.(text);
  }, [text, onValueChange]);

  /**
   * What was typed here and not sent is kept, and is back in the box when the
   * chat is opened again (lib/chat-drafts). Read after the first paint: the
   * server has no drafts, and a box that started out filled would not match
   * what it drew.
   */
  const draftReady = useRef(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (!live) return;
      const kept = readDraft(currentUserId, conversationId);
      draftReady.current = true;
      // `now ||` so a prefill the thread put here first survives.
      if (kept) setText((now) => now || kept);
    });
    return () => {
      live = false;
    };
  }, [currentUserId, conversationId]);

  // Saved as it changes, and gone the moment the box is empty: sending clears
  // the box, which clears the draft.
  useEffect(() => {
    if (!draftReady.current || editing) return;
    writeDraft(currentUserId, conversationId, text);
  }, [text, editing, currentUserId, conversationId]);

  return (
    <div className="relative flex-1">
      <input
        ref={el}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCursor(e.target.selectionStart ?? 0);
          if (e.target.value) onTyping();
        }}
        onSelect={(e) => setCursor((e.target as HTMLInputElement).selectionStart ?? 0)}
        onBlur={() => setTimeout(reset, 150)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onEnter()}
        placeholder={placeholder}
        maxLength={maxLength}
        className="h-11 w-full rounded-2xl bg-surface px-4 text-sm outline-none placeholder:text-faint focus:border-white/25"
      />
      <SuggestionDropdown
        suggestions={suggestions}
        onSelect={(s) => {
          const { newValue, newCursor } = applySuggestion(text, cursor, s);
          setText(newValue);
          setCursor(newCursor);
          reset();
        }}
      />
    </div>
  );
}
