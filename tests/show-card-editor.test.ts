import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cardIsBlank, cardProblem, tidyCard, type CardLayer } from "@/components/shows/CardEditor";
import { MAX_POLL_OPTIONS } from "@/lib/chat-poll";
import { readLayers } from "@/lib/show-layers";

const poll = (question: string, options: string[]): CardLayer =>
  ({ id: "p", type: "poll", x: 0.5, y: 0.5, scale: 1, rotation: 0, look: 0, payload: { question, options } }) as CardLayer;
const ask = (prompt: string): CardLayer =>
  ({ id: "q", type: "question", x: 0.5, y: 0.5, scale: 1, rotation: 0, look: 0, payload: { prompt } }) as CardLayer;

describe("writing a poll on the sticker", () => {
  it("says what is missing rather than refusing Done silently", () => {
    expect(cardProblem(poll("", ["a", "b"]))).toBe("Write the question.");
    expect(cardProblem(poll("Which?", ["a", " A "]))).toBe("Give it at least two different options.");
    expect(cardProblem(poll("Which?", ["Pizza", "Burger"]))).toBeNull();
    expect(cardProblem(ask("  "))).toBe("Write what you're asking.");
  });

  it("left blank, it is taken away again", () => {
    expect(cardIsBlank(poll("", ["", " "]))).toBe(true);
    expect(cardIsBlank(poll("", ["x", ""]))).toBe(false);
    expect(cardIsBlank(ask(""))).toBe(true);
  });

  it("Done keeps it tidy, and the tidy poll is one the Show will keep", () => {
    const done = tidyCard(poll("  Which one? ", ["Pizza", "", "pizza", "Burger "]));
    expect(done.payload).toEqual({ question: "Which one?", options: ["Pizza", "Burger"] });
    expect(readLayers([done])).toHaveLength(1);
  });

  it("goes up to the six options a Show poll can be voted on", () => {
    expect(MAX_POLL_OPTIONS).toBe(6);
    const src = readFileSync("src/components/shows/CardEditor.tsx", "utf8");
    expect(src).toContain("{poll.options.length < MAX_POLL_OPTIONS && (");
    expect(src).toContain("{poll.options.length > MIN_POLL_OPTIONS && (");
  });
});

describe("the editor", () => {
  const editor = readFileSync("src/components/shows/ShowEditor.tsx", "utf8");
  it("places a poll or question blank and opens it to be written on", () => {
    expect(editor).toContain("} else if (isCardType(key)) {");
    expect(editor).toContain("const id = add(key, blankCard(key));\n      if (id) setEditingCard(id);");
    expect(editor).not.toContain("PollComposer");
    expect(editor).not.toContain("QuestionSheet");
  });
  it("tapping one already placed opens it again", () => {
    expect(editor).toContain("if (isCard(chosenLayer)) {\n          setEditingCard(g.id);");
  });
});
