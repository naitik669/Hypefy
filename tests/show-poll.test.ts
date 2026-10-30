import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A poll on a Show takes an answer; a question box takes a reply.
 *
 * These two are what the whole layers-as-data decision was for: a poll
 * flattened into the picture is a picture of a poll.
 *
 * Dry-run against the live database inside rolled-back transactions.
 * Voting returned {tally:[1,0], voters:1}; the same option again took
 * the vote back; option 5 of 2 and a layer that is not there were both
 * refused; **voting on an expired Show was refused** while its own
 * author could still vote on it; rewriting an answered poll's options
 * was refused while moving, restyling and rewording it stayed allowed;
 * and removing the layer took its votes with it.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0183_show_poll_and_question.sql");
const poll = read("src/components/shows/ShowPoll.tsx");
const view = read("src/components/shows/LayerView.tsx");

describe("who is allowed to answer", () => {
  it("visibility is one function, not a copy in each place", () => {
    // The functions run as SECURITY DEFINER because they write to a
    // table the client cannot. RLS does not apply inside them, so a
    // bare `exists (select 1 from shows ...)` is true for every Show in
    // the database — expired, private, taken down. Written that way
    // first, it would have let anyone vote on anybody's Show.
    expect(sql).toContain("create or replace function public.can_see_show(p_show uuid)");
    expect(sql).toContain('alter policy "shows_select_public" on public.shows\n  using (public.can_see_show(id));');
  });

  it("and every function asks it", () => {
    for (const fn of ["cast_show_vote", "show_poll_tallies", "answer_show_question"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}`));
      expect(body.slice(0, 2000), fn).toContain("public.can_see_show(p_show_id)");
    }
  });

  it("nobody checks visibility by reading shows directly any more", () => {
    expect(sql).not.toContain("select 1 from public.shows s where s.id = p_show_id");
  });

  it("the rule itself covers expiry, privacy and takedown", () => {
    const fn = sql.slice(sql.indexOf("function public.can_see_show"), sql.indexOf("revoke all on function public.can_see_show"));
    expect(fn).toContain("s.expires_at > now()");
    expect(fn).toContain("coalesce(p.is_private, false)");
    expect(fn).toContain("s.removed_at is null");
    expect(fn).toContain("showcase_items");
  });
});

describe("a vote", () => {
  it("must name an option the poll actually has", () => {
    expect(sql).toContain('if p_choice is null or p_choice < 0 or p_choice >= v_count then');
    expect(sql).toContain("raise exception 'No such option'");
  });

  it("and a layer that is really a poll", () => {
    // Scoped to cast_show_vote: show_poll_tallies matches the same
    // string, so a file-wide check passed with this one deleted.
    const fn = sql.slice(sql.indexOf("function public.cast_show_vote"), sql.indexOf("function public.show_poll_tallies"));
    expect(fn).toContain("l ->> 'type' = 'poll'");
    expect(fn).toContain("raise exception 'No such poll'");
  });

  it("one each, so the key is the person and the layer", () => {
    expect(sql).toContain("primary key (show_id, layer_id, voter_id)");
    expect(sql).toContain('on conflict (show_id, layer_id, voter_id)');
    expect(sql).toContain('do update set choice = excluded.choice');
  });

  it("and tapping the same option again takes it back", () => {
    expect(sql).toContain("if v_had then");
    expect(sql).toContain("delete from public.show_poll_votes");
  });
});

describe("the tally is not somewhere its author can type", () => {
  it("it is counted from the votes, never stored on the layer", () => {
    // Chat keeps its tally in the message's metadata, which is safe
    // because no client can write that column. shows.layers is
    // owner-writable by design, so a tally there would be a number the
    // author could edit.
    expect(sql).not.toContain("set layers = layers ||");
    expect(sql).toContain("select jsonb_agg(c.n order by c.i) into v_tally");
  });

  it("and one call answers for the whole Show", () => {
    // A Show may carry several polls and the viewer opens them at once.
    expect(sql).toContain("function public.show_poll_tallies(p_show_id uuid)");
    expect(view).toContain("polls?: Record<string, PollState>;");
  });

  it("which the viewer only makes when there is a poll to count", () => {
    const viewer = read("src/components/shows/ShowViewer.tsx");
    expect(viewer).toContain('const hasPoll = useMemo(() => layers.some((l) => l.type === "poll" || l.type === "quiz"), [layers]);');
    expect(viewer).toContain("if (!hasPoll) return;");
  });
});

describe("an answered poll stops being rewritable", () => {
  it("because a vote points at an index, not at the words", () => {
    expect(sql).toContain("raise exception 'A poll that has been answered cannot be rewritten'");
    expect(sql).toContain("(v_old -> 'payload' -> 'options') is distinct from (v_new -> 'payload' -> 'options')");
  });

  it("but taking it down is still the author's call", () => {
    expect(sql).toContain("if v_new is null then");
    expect(sql).toContain("delete from public.show_poll_votes where show_id = new.id and layer_id = v_layer;");
  });

  it("and an update that leaves the layers alone costs nothing", () => {
    expect(sql).toContain("if new.layers is not distinct from old.layers then return new; end if;");
  });
});

describe("an answer reaches the author and nobody else", () => {
  it("that is the policy, not a convention", () => {
    const policy = sql.slice(sql.indexOf('create policy "show answers: the author and the asker"'));
    expect(policy.slice(0, 400)).toContain("asker_id = (select auth.uid())");
    expect(policy.slice(0, 400)).toContain("select s.user_id from public.shows s");
  });

  it("there is no insert policy, so it goes through the function", () => {
    expect(sql).toContain("grant select on public.show_answers to authenticated;");
    expect(sql).not.toContain("on public.show_answers\n  for insert");
  });

  it("it is tidied and bounded like everything else people type", () => {
    expect(sql).toContain("regexp_replace(coalesce(p_body, ''), '[\\s\\u0000-\\u001f\\u007f]+', ' ', 'g')");
    expect(sql).toContain("if char_length(v_body) > 300 then raise exception 'Too long'");
  });

  it("and the author is told", () => {
    expect(sql).toContain("'show_answer', 'show', p_show_id, 'answered your Show'");
    expect(sql).toContain("if v_owner <> v_me then");
  });
});

describe("the widgets as the reader meets them", () => {
  it("counts stay hidden until you answer", () => {
    // Showing them first turns a question into a bandwagon, which is
    // the rule PollBubble already follows.
    expect(poll).toContain("const answered = mine !== null;");
    expect(poll).toContain("{answered && (");
  });

  it("and the bars measure against the leader, from chat's own helper", () => {
    expect(poll).toContain('import { barWidth, voteLabel } from "@/lib/chat-poll";');
    expect(poll).toContain("width: `${barWidth(tally, i)}%`");
  });

  it("the tick is optimistic, the counts are not", () => {
    // Your own tap is a fact; the numbers are the server's.
    expect(poll).toContain("setMine(was === index ? null : index);");
    expect(poll).toContain("if (Array.isArray(next?.tally)) setTally(next.tally);");
  });

  it("a refused vote puts the tick back", () => {
    expect(poll).toContain("if (error) {\n      setMine(was);");
  });

  it("and pressing one does not also move the Show on", () => {
    // The frame underneath takes a tap as "next". Scoped to the option
    // button: the question box stops propagation too, so a file-wide
    // check passed with this one removed.
    const option = poll.slice(poll.indexOf("onClick={(e) => {"), poll.indexOf("void choose(i);"));
    expect(option).toContain("e.stopPropagation();");
  });

  it("neither is live while the layer is being arranged", () => {
    // A poll that took its author's vote while they placed it would be
    // answering itself. Both branches are checked by name: they are
    // the same line twice, so one check passed with either deleted.
    const pollBranch = view.slice(view.indexOf('case "poll": {'), view.indexOf('case "question": {'));
    const questionBranch = view.slice(view.indexOf('case "question": {'), view.indexOf('case "post":'));
    expect(pollBranch).toContain("if (editing || !showId) {");
    expect(questionBranch).toContain("if (editing || !showId) {");
    expect(pollBranch).toContain("<ShowPoll");
    expect(questionBranch).toContain("<ShowQuestion");
  });
});
