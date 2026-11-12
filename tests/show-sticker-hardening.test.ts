import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 0194: the server-side half of making the stickers work.
 *
 * SQL cannot be run from here, so this pins the shape and the decisions. What
 * it cannot prove was proved by a dry run against production inside a
 * rolled-back transaction: a scalar `options` reads as 0 rather than raising,
 * a nonsense `at` reads as null, the author gate on the results returns `{}`,
 * the unique index builds, and the dedupe leaves no duplicate behind.
 */

const sql = readFileSync("supabase/migrations/0194_show_sticker_hardening.sql", "utf8").replace(
  /\r\n/g,
  "\n",
);

/** One `create or replace function` body from the migration. */
function fn(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is missing`).toBeGreaterThan(-1);
  const end = sql.indexOf("$fn$;", start);
  expect(end, `${name} is unterminated`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("a crafted layer cannot take the Show's stickers down with it", () => {
  it("counting options never raises", () => {
    // jsonb_array_length throws on anything that is not an array, and one bad
    // layer used to fail the whole call — so a Show with a poll, a quiz and a
    // countdown lost all three.
    const helper = fn("show_options_len");
    expect(helper).toContain("jsonb_typeof(p_layer -> 'payload' -> 'options') = 'array'");
    expect(helper).toContain("else 0");
  });

  it("and the two callers use it instead of the raw length", () => {
    expect(fn("cast_show_vote")).toContain("v_count := public.show_options_len(v_layer);");
    expect(fn("show_poll_tallies")).toContain("public.show_options_len(l)");
    // Neither may reach for jsonb_array_length on a payload again.
    expect(fn("cast_show_vote")).not.toContain("jsonb_array_length(coalesce(v_layer");
    expect(fn("show_poll_tallies")).not.toContain("jsonb_array_length(coalesce(l");
  });

  it("a countdown's date is read without casting", () => {
    expect(fn("safe_timestamptz")).toContain("exception when others then");
    const toggle = fn("toggle_countdown_reminder");
    expect(toggle).toContain("public.safe_timestamptz(v_layer -> 'payload' ->> 'at')");
    expect(toggle).not.toContain("::timestamptz into v_at");
  });

  it("and a layer is found through one helper rather than five copies", () => {
    expect(fn("show_layer")).toContain("jsonb_typeof(l -> 'payload') = 'object'");
    for (const caller of ["cast_show_vote", "answer_show_question", "toggle_countdown_reminder"]) {
      expect(fn(caller), caller).toContain("public.show_layer(");
    }
  });
});

describe("one answer each", () => {
  it("the duplicates go, and the index stops them coming back", () => {
    expect(sql).toContain("delete from public.show_answers a");
    expect(sql).toContain("create unique index if not exists show_answers_one_each");
    expect(sql).toContain("on public.show_answers (show_id, layer_id, asker_id)");
  });

  it("the deletion is called irreversible where somebody will read it", () => {
    // It is not recoverable, so the header has to say so.
    expect(sql).toContain("THIS DELETES DATA");
  });

  it("a second answer edits the first", () => {
    const answer = fn("answer_show_question");
    expect(answer).toContain("on conflict (show_id, layer_id, asker_id)");
    expect(answer).toContain("do update set body = excluded.body");
  });

  it("and only a first answer tells the author", () => {
    // Before the index it notified on every one of them.
    const answer = fn("answer_show_question");
    expect(answer).toContain("returning (xmax = 0) into v_fresh");
    expect(answer).toContain("if coalesce(v_fresh, false) then");
  });

  it("the layer id is bounded, as the other sticker tables bound theirs", () => {
    expect(sql).toContain("check (char_length(layer_id) between 1 and 64)");
  });
});

describe("your own stickers are for everyone else", () => {
  it("the poll and quiz refuse the author, the way the slider always did", () => {
    expect(fn("cast_show_vote")).toContain("Your own poll is for everyone else");
    expect(fn("set_show_slider")).toContain("Your own slider is for everyone else");
    expect(fn("answer_show_question")).toContain("Your own question is for everyone else");
  });
});

describe("rate limits", () => {
  it("every sticker write has one", () => {
    const limits: Record<string, string> = {
      answer_show_question: "'show_answer', 20",
      cast_show_vote: "'show_vote', 120",
      set_show_slider: "'show_slider', 120",
      toggle_countdown_reminder: "'show_reminder', 60",
    };
    for (const [name, call] of Object.entries(limits)) {
      expect(fn(name), name).toContain(`public.rate_limit(${call}`);
    }
  });

  it("raised as a check violation, which is what the client words differently", () => {
    // lib/show-stickers stickerError maps 23514 to "slow down"; rate_limit
    // raises with errcode check_violation, so the two agree by construction.
    expect(sql).toContain("public.rate_limit(");
  });
});

describe("who did it, and who may ask", () => {
  const results = fn("show_sticker_results");

  it("the author and nobody else", () => {
    expect(results).toContain("where id = p_show_id and user_id = v_me");
    expect(results).toContain("return '{}'::jsonb;");
    expect(sql).toContain("revoke all on function public.show_sticker_results(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.show_sticker_results(uuid) to authenticated;");
  });

  it("covers all five interactive kinds plus the question", () => {
    for (const kind of ["poll", "quiz", "slider", "countdown", "question", "addyours"]) {
      expect(results, kind).toContain(`'${kind}'`);
    }
  });

  it("an Add yours only reads a collab that is genuinely the author's", () => {
    // The same rule join_add_yours enforces: otherwise a crafted collabId on
    // your own Show would read somebody else's members.
    expect(results).toContain("c.owner_id = v_me");
  });

  it("and it is bounded", () => {
    expect(results).toContain("limit 200");
  });
});

describe("what viewers are never told", () => {
  it("no name reaches the two calls a viewer makes", () => {
    /*
     * The whole arrangement: the owner sees who, viewers see totals. If
     * profiles is ever joined into either of these, that is the leak.
     */
    for (const name of ["show_poll_tallies", "show_sticker_state"]) {
      expect(fn(name), name).not.toContain("profiles");
      expect(fn(name), name).not.toContain("username");
    }
  });

  it("though a viewer does get their own answer back", () => {
    const state = fn("show_sticker_state");
    expect(state).toContain("jsonb_object_agg(a.layer_id, a.body)");
    expect(state).toContain("a.asker_id = v_me");
    expect(state).toContain("'answers', v_answers");
  });
});

describe("safe to apply whenever", () => {
  it("nothing in it drops or renames anything a running client uses", () => {
    expect(sql).not.toMatch(/drop function/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/drop column/i);
    // The one drop is of its own constraint, so the file can be re-applied.
    expect(sql).toContain("drop constraint if exists show_answers_layer_id_len");
  });

  it("and every function keeps its hardening", () => {
    for (const name of [
      "answer_show_question",
      "cast_show_vote",
      "show_poll_tallies",
      "set_show_slider",
      "toggle_countdown_reminder",
      "show_sticker_state",
      "show_sticker_results",
    ]) {
      expect(fn(name), name).toContain("security definer");
      expect(fn(name), name).toContain("set search_path = public");
    }
  });

  it("the helpers are not reachable by a signed-in user", () => {
    // show_layer reads any Show's layers, so it must not be callable directly.
    for (const h of ["safe_timestamptz(text)", "show_options_len(jsonb)", "show_layer(uuid, text, text[])"]) {
      expect(sql, h).toContain(`revoke all on function public.${h} from public, anon;`);
    }
  });
});
