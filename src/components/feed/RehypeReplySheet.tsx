"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SendIcon } from "@/components/ui/ShareIcon";
import { useToast } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { sendRehypeReply, type DeckPerson, type RehypeKind } from "@/lib/rehype";

/**
 * Replying to a rehype: what a face in the deck opens.
 *
 * Tapping a face used to open that person's profile, which is a detour — you
 * tapped it because they passed this to you and you wanted to say something
 * about it. So this says it: the post goes to their chat, with your words
 * under it, and you never leave the feed.
 *
 * Their profile is still a tap away, quietly, for when that is what you meant.
 */

/** React: a reply you can send in one tap, without typing. */
const REACTIONS = ["🔥", "😂", "😍", "😮", "👏", "💯"];
export function RehypeReplySheet({
  person,
  kind,
  targetId,
  onClose,
}: {
  /** Whose rehype you are replying to. Null closes the sheet. */
  person: DeckPerson | null;
  kind: RehypeKind;
  targetId: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const showToast = useToast();

  async function send(body = note) {
    if (!person || sending) return;
    setSending(true);
    const ok = await sendRehypeReply(createClient() as never, kind, targetId, person.userId, body);
    setSending(false);
    if (!ok) {
      showToast("Couldn't send that. Try again.", "error");
      return;
    }
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setNote("");
      onClose();
    }, 900);
  }

  // Your own seat has nobody to reply to, so it only offers the way out of
  // the feed that a tap used to take by itself.
  const self = !!person?.isMe;

  return (
    <BottomSheet
      open={!!person}
      onClose={onClose}
      title={self ? "Your rehype" : `Reply to ${person?.name}'s rehype`}
    >
      {person && (
        <div className="flex items-center gap-3 pb-1">
          <Avatar name={person.name} hue={person.hue} src={person.avatarUrl ?? undefined} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{person.name}</p>
            <p className="truncate text-[13px] text-muted">
              {person.isMe ? "You rehyped this" : "Rehyped this to their followers"}
            </p>
          </div>
          {person.username && (
            <Link
              href={person.isMe ? "/profile" : `/u/${person.username}`}
              className="shrink-0 rounded-2xl bg-surface px-3.5 py-2 text-[13px] font-semibold text-muted"
            >
              Profile
            </Link>
          )}
        </div>
      )}

      {!self && (
        <>
          {/* React: the same reply, said in one tap. */}
          <div className="flex items-center justify-between gap-1 pt-3.5">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => void send(emoji)}
                disabled={sending}
                aria-label={`React ${emoji}`}
                className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-surface text-[22px] transition-transform active:scale-90 disabled:opacity-60"
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pb-1 pt-2.5">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void send()}
              placeholder="Say something about it…"
              maxLength={500}
              autoFocus
              className="h-11 min-w-0 flex-1 rounded-2xl bg-surface px-3.5 text-sm outline-none placeholder:text-faint"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              aria-label="Send"
              className="flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : sent ? <Check size={16} /> : <SendIcon size={15} weight="fill" />}
              {sent ? "Sent" : "Send"}
            </button>
          </div>
          <p className="pb-1 text-[12px] text-faint">
            Either way it goes to {person?.name} as a message: the post, then
            what you said about it.
          </p>
        </>
      )}
    </BottomSheet>
  );
}
