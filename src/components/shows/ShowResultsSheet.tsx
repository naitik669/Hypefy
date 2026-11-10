"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { timeAgoShort } from "@/lib/time";
import { isResultKind, type ResultKind } from "@/lib/show-results";
import {
  NO_RESULTS,
  emptyResult,
  isMissingFunction,
  readStickerResults,
  resultValue,
  type StickerResults,
} from "@/lib/show-results";
import { isHypeMeter, type ShowLayer } from "@/lib/show-layers";
import type { PollPayload, QuizPayload } from "@/lib/show-layers";

/**
 * Who did what, on your own Show.
 *
 * One sheet for all five interactive stickers rather than five different
 * answers to the same question. It opens when you tap one of your own —
 * nothing on a Show of yours asks you to vote any more, so a tap is free to
 * mean "show me" — and it scrolls to the one you tapped.
 *
 * The question sticker is the exception and keeps its own screen: an answer is
 * private text somebody wrote to you, and a sheet of them reads like a feed of
 * other people's confidences. Its section here is a count and a way through.
 *
 * Until 0194 is applied the RPC does not exist, and this says so rather than
 * failing: the counts are already on the stickers themselves, so the honest
 * message is that the names are not available yet.
 */

/** What a layer's own prompt is, for the section heading. */
function heading(layer: ShowLayer): string {
  const p = layer.payload as Record<string, unknown>;
  const words = p.question ?? p.prompt ?? p.title;
  return typeof words === "string" && words.trim() !== "" ? words : "Untitled";
}

/** A poll's or quiz's options, so a choice reads as a word rather than a number. */
function optionsOf(layer: ShowLayer): string[] {
  if (layer.type === "poll") return (layer.payload as PollPayload).options ?? [];
  if (layer.type === "quiz") return (layer.payload as QuizPayload).options ?? [];
  return [];
}

export function ShowResultsSheet({
  showId,
  layers,
  open,
  focus,
  onClose,
}: {
  showId: string;
  layers: ShowLayer[];
  open: boolean;
  /** The layer whose section to scroll to, when one sticker was tapped. */
  focus?: string | null;
  onClose: () => void;
}) {
  const [supabase] = useState(createClient);
  const [results, setResults] = useState<StickerResults>(NO_RESULTS);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    if (!open) return;
    let dropped = false;
    /*
     * Called by name through a cast, because the generated types are built
     * from the live database and 0194 has not been applied — so the function
     * this asks for is not in them yet. The `unavailable` branch below is the
     * same fact handled at runtime; this is it handled at compile time. Both
     * go away when the migration lands and the types are regenerated.
     */
    const call = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
    void call("show_sticker_results", { p_show_id: showId }).then(({ data, error }) => {
      if (dropped) return;
      if (error) {
        // Before 0194 the function is simply not there. Anything else is also
        // nothing to show, and neither is worth a stack trace at somebody
        // looking at their own Show.
        setState(isMissingFunction(error) ? "unavailable" : "ready");
        setResults(NO_RESULTS);
        return;
      }
      setResults(readStickerResults(data));
      setState("ready");
    });
    return () => {
      dropped = true;
    };
  }, [open, showId, supabase]);

  // In layer order, which is the order they sit on the picture back to front.
  const sections = layers.filter((l) => isResultKind(l.type));

  useEffect(() => {
    if (!open || !focus || state !== "ready") return;
    // After the rows are in, or there is nothing to scroll to yet.
    const el = document.getElementById(`result-${focus}`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open, focus, state]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Results" size="tall">
      {sections.length === 0 ? (
        <EmptyState title="Nothing to count" text="This Show carries no sticker anybody can answer." />
      ) : (
        <div className="flex flex-col gap-6 pb-4">
          {state === "unavailable" && (
            <p className="rounded-xl bg-surface px-3 py-2.5 text-xs text-muted">
              The counts are on the stickers themselves. Names appear here after the next database
              update.
            </p>
          )}

          {sections.map((layer) => {
            const found = results[layer.id];
            const kind = (found?.kind ?? layer.type) as ResultKind;
            const people = found?.people ?? [];
            const options = optionsOf(layer);

            return (
              <section key={layer.id} id={`result-${layer.id}`}>
                <h3 className="text-[15px] font-bold leading-snug">{heading(layer)}</h3>
                <p className="pb-2.5 pt-0.5 text-xs text-faint">
                  {/* A meter is a slider to the server and a different sticker to
                      the person who placed it, so the section says which. */}
                  {isHypeMeter(layer) ? "Hype meter" : KIND_WORD[kind]}
                  {people.length > 0 ? ` · ${people.length}` : ""}
                </p>

                {kind === "question" ? (
                  // Private text, so it is a way through rather than a list.
                  <a
                    href={`/shows/${showId}/answers`}
                    className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm font-semibold"
                  >
                    Read the answers
                    <span aria-hidden>→</span>
                  </a>
                ) : state === "loading" ? (
                  <p className="flex items-center gap-2 px-1 py-2 text-xs text-muted">
                    <Loader2 size={13} className="animate-spin" aria-hidden /> Counting…
                  </p>
                ) : people.length === 0 ? (
                  <p className="px-1 text-xs text-muted">{emptyResult(kind)}</p>
                ) : (
                  <ul className="flex flex-col">
                    {people.map((p) => {
                      const name = p.displayName || p.username || "Someone";
                      const value = resultValue(kind, p, options);
                      return (
                        <li key={p.id} className="flex items-center gap-3 py-2">
                          <Avatar name={name} hue={p.hue} size={38} src={p.avatarUrl ?? undefined} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            {p.at && <p className="truncate text-xs text-muted">{timeAgoShort(p.at)}</p>}
                          </div>
                          {value && (
                            <span className="shrink-0 text-sm font-bold tabular-nums">{value}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

const KIND_WORD: Record<ResultKind, string> = {
  poll: "Poll",
  quiz: "Quiz",
  slider: "Hype slider",
  countdown: "Countdown",
  question: "Question",
  addyours: "Add yours",
};
