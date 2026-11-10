import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GoneScreen } from "@/components/empty/GoneScreen";
import { Avatar } from "@/components/ui/Avatar";
import { readLayers } from "@/lib/show-layers";
import type { QuestionPayload } from "@/lib/show-layers";
import { timeAgo } from "@/lib/time";

/**
 * What people answered, which until now nobody could read.
 *
 * The question sticker tells a viewer "Sent — only they see it." The answer
 * was stored, an RLS policy on `show_answers` admitted the author, a
 * notification fired — and no screen in the app read any of it. The author was
 * delivered to the Show itself, where there was nothing to see. So the promise
 * was true and useless, which is worse than not making it.
 *
 * Its own screen rather than a sheet on the Show, because an answer is private
 * text somebody wrote to you, not a tally: it wants room, a name beside it and
 * a time. The votes stay on their stickers.
 *
 * Author only, and not by filtering after the fact — the RLS policy returns
 * the asker's own rows or the Show author's, so a stranger's request comes
 * back empty. The redirect below is for the person who followed an old link,
 * not a fence.
 */
export default async function ShowAnswersPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: show } = await supabase
    .from("shows")
    .select("id, user_id, layers, created_at")
    .eq("id", showId)
    .maybeSingle();

  // A Show that has gone, and one that is not yours, are the same answer.
  if (!show || show.user_id !== user.id) return <GoneScreen kind="show" />;

  const questions = readLayers(show.layers).filter((l) => l.type === "question");

  const { data: rows } = await supabase
    .from("show_answers")
    .select(
      "id, layer_id, asker_id, body, created_at, profiles:asker_id(display_name, username, avatar_url, avatar_hue)",
    )
    .eq("show_id", showId)
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = {
    id: string;
    layer_id: string;
    body: string;
    created_at: string;
    profiles: {
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      avatar_hue: number | null;
    } | null;
  };

  const all = (rows ?? []) as unknown as Row[];
  const byLayer = new Map<string, Row[]>();
  for (const r of all) {
    const list = byLayer.get(r.layer_id);
    if (list) list.push(r);
    else byLayer.set(r.layer_id, [r]);
  }

  // Answers to a question that has since been taken off the Show still exist,
  // and are still somebody's words. They are shown under their own heading
  // rather than dropped.
  const orphans = all.filter((r) => !questions.some((q) => q.id === r.layer_id));

  return (
    <div className="min-h-dvh pb-24">
      <PageHeader title="Answers" showBack />

      {questions.length === 0 && orphans.length === 0 ? (
        <p className="px-5 pt-10 text-center text-sm text-muted">
          This Show had no question sticker on it.
        </p>
      ) : (
        <div className="flex flex-col gap-7 px-4 pt-4">
          {questions.map((q) => {
            const answers = byLayer.get(q.id) ?? [];
            return (
              <section key={q.id}>
                <h2 className="px-1 text-[15px] font-bold leading-snug">
                  {(q.payload as QuestionPayload).prompt}
                </h2>
                <p className="mb-3 px-1 pt-1 text-xs text-faint">
                  {answers.length === 0
                    ? "Nobody yet"
                    : `${answers.length} ${answers.length === 1 ? "answer" : "answers"}`}
                </p>
                <AnswerList answers={answers} />
              </section>
            );
          })}

          {orphans.length > 0 && (
            <section>
              <h2 className="px-1 text-[15px] font-bold">To a question you removed</h2>
              <p className="mb-3 px-1 pt-1 text-xs text-faint">
                The sticker is gone from the Show; what people wrote is not.
              </p>
              <AnswerList answers={orphans} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function AnswerList({
  answers,
}: {
  answers: {
    id: string;
    body: string;
    created_at: string;
    profiles: {
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      avatar_hue: number | null;
    } | null;
  }[];
}) {
  if (answers.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2.5">
      {answers.map((a) => {
        const name = a.profiles?.display_name || a.profiles?.username || "Someone";
        return (
          <li key={a.id} className="flex gap-3 rounded-2xl bg-surface p-3">
            <Avatar
              name={name}
              hue={a.profiles?.avatar_hue ?? 200}
              size={34}
              src={a.profiles?.avatar_url ?? undefined}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 text-[13px] font-semibold">
                <span className="truncate">{name}</span>
                <span className="shrink-0 text-[11px] font-normal text-faint">
                  {timeAgo(a.created_at)}
                </span>
              </p>
              <p className="whitespace-pre-wrap break-words pt-0.5 text-sm leading-snug text-muted">
                {a.body}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
