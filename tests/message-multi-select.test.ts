import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Picking several messages at once.
 *
 * Forwarding five used to be five hold-menus. The mode is entered from
 * the menu that was already there, which is where somebody looking for
 * it would look.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const chat = read("src/components/messages/RealChatView.tsx");
const fwd = read("src/components/messages/ForwardSheet.tsx");

describe("being in the mode, or not", () => {
  it("not selecting and selecting nothing are different states", () => {
    // An empty set is still the mode. Unticking the last one should not
    // drop you out of what you are standing in.
    expect(chat).toContain("useState<ReadonlySet<string> | null>(null)");
    expect(chat).toContain("const selecting = picked !== null;");
  });

  it("the way in is the menu that already exists", () => {
    expect(chat).toContain('label="Select"');
    expect(chat).toContain("startSelecting(menu.msg)");
  });

  it("and the message you held is already picked", () => {
    // Entering the mode with nothing picked wastes the press that got
    // you here.
    expect(chat).toContain("setPicked(new Set([m.id]));");
  });

  it("while picking, a press ticks rather than opening the menu", () => {
    // A hold menu over a selection offers actions for one message in
    // the middle of choosing several.
    const fn = chat.slice(chat.indexOf("function onPressStart"));
    expect(fn.slice(0, 400)).toContain("if (selecting) {");
    expect(fn.slice(0, 400)).toContain("togglePicked(m.id);");
  });
});

describe("what you can do with them", () => {
  it("the bar takes the composer's place rather than sitting above it", () => {
    // There is nothing to type while picking, and a live box under a
    // selection invites typing into a thread that is not listening.
    expect(chat).toContain("{selecting && (");
    expect(chat).toContain("{picked.size} selected");
  });

  it("forwarding sends the run, in the order the thread shows it", () => {
    expect(chat).toContain("setForwardMany(pickedMessages())");
    expect(chat).toContain("messages.filter((m) => picked.has(m.id))");
  });

  it("one at a time, not all at once", () => {
    // Fired together, the server decides what order a conversation
    // happened in.
    expect(fwd).toContain("for (const one of sending) {");
    expect(fwd).toContain("await supabase.rpc(\"send_message\"");
  });

  it("and a failure half way names what stopped rather than counting", () => {
    // Scoped to the error branch rather than to a count of characters
    // from the top of the loop: a comment added above the call used to
    // push the toast out of the window and fail this without anything
    // changing about what happens when a forward fails.
    const loop = fwd.slice(fwd.indexOf("for (const one of sending) {"));
    const failed = loop.slice(loop.indexOf("if (error) {"));
    expect(failed.slice(0, 300)).toContain("toast(error.message");
    expect(failed.slice(0, 300)).toContain("return;");
  });

  it("unsending touches only your own", () => {
    // The server refuses anybody else's, and a button that is going to
    // be refused should not be offered.
    expect(chat).toContain("if (m.sender_id === currentUserId && !m.is_unsent) unsend(m);");
    expect(chat).toContain("disabled={pickedMessages().every((m) => m.sender_id !== currentUserId)}");
  });

  it("and forwarding nothing is not an error, it is nothing", () => {
    expect(fwd).toContain("const sending = msgs ?? (msg ? [msg] : []);");
    expect(fwd).toContain("if (sending.length === 0 || busy || sentTo.has(friend.id)) return;");
  });
});

describe("the single-message path still works the simple way", () => {
  it("one message is still one prop", () => {
    // Every other caller forwards one thing and should not have to wrap
    // it in an array to do it.
    expect(chat).toContain("msg={forwardMsg}");
    expect(fwd).toContain("msg?: ForwardableMsg | null;");
    expect(fwd).toContain("msgs?: ForwardableMsg[];");
  });
});
