import { rows, row } from "../query";

/**
 * Messages: the inbox, and one thread.
 *
 * **The inner join is the whole performance story and is carried over
 * deliberately.** Selecting straight from `conversations` and trusting
 * RLS looks equivalent and is not: the policy is `is_conv_member(id)`, a
 * SECURITY DEFINER function, so the planner can neither inline it nor
 * use it as an index qual. It walks conversations newest-first calling
 * that function — and a membership lookup inside it — once per row until
 * it has found fifty you can see. Someone in twenty chats paid for a
 * walk of nearly the whole table, growing with every conversation anyone
 * else creates.
 *
 * Starting from `conversation_members` instead makes your rows a direct
 * index lookup. RLS still applies; it is simply not what finds the rows.
 * The web's own note says the same, and writing a "simpler" query here
 * would reintroduce it on the phone only.
 *
 * `get_inbox_summary` does the last-message and unread arithmetic in the
 * database. Without it the inbox pulls every message across all fifty
 * conversations into the app to derive two fields.
 *
 * **What the web has and this does not:**
 *
 *  - **Locked and hidden chats.** `my_chat_levels` decides those, and the
 *    Vault is reached by a gesture this app has no equivalent for yet.
 *    The inbox here is the normal level only, which is what the web shows
 *    by default — but a locked chat is INVISIBLE rather than missing, and
 *    that is the honest description.
 *  - **Nicknames**, so a chat renamed on the web reads by real name here.
 *  - **Reactions as the preview**, pinning, muting, requests, groups'
 *    own titles beyond what the row carries.
 *  - **Sending anything but text**: no photos, voice notes, replies,
 *    posts or Shots forwarded into a chat.
 *  - **E2EE**, which is off and parked on both clients.
 */

/** The web's window. */
export const INBOX_LIMIT = 50;
/** How many messages a thread opens with. */
export const THREAD_PAGE = 50;

/**
 * The columns a bubble reads.
 *
 * Named so tests/mobile-columns.test.ts can check them against the
 * schema — the standing rule after the blank feed of #83: every select
 * the phone makes gets an entry there.
 */
export const MESSAGE_COLUMNS =
  "id, conversation_id, sender_id, body, kind, created_at, is_unsent, removed_at";

export type ChatProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export type InboxRow = {
  id: string;
  type: string | null;
  title: string | null;
  last_message_at: string | null;
  /** The other person, or the first of them in a group. */
  other: ChatProfile | null;
  lastBody: string | null;
  lastKind: string | null;
  lastAt: string | null;
  lastSenderId: string | null;
  unread: number;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  kind: string | null;
  created_at: string;
  is_unsent: boolean | null;
  removed_at: string | null;
};

type Answer = { data: unknown; error: unknown };

type Builder = PromiseLike<Answer> & {
  select(columns: string): Builder;
  eq(column: string, value: string): Builder;
  neq(column: string, value: string): Builder;
  in(column: string, values: string[]): Builder;
  order(column: string, options: { ascending: boolean }): Builder;
  limit(count: number): Builder;
  maybeSingle(): PromiseLike<Answer>;
};

type Queryable = {
  from(table: string): Builder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<Answer>;
};

function one<T>(raw: unknown): T | null {
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return (raw as T) ?? null;
}

/**
 * The newest fifty conversations this person is in.
 *
 * `conversation_members!inner(user_id)` with `.eq` on the joined column
 * is what makes it an index lookup. Both halves matter: the `!inner`
 * makes it a join rather than an embed, and the `.eq` on the joined
 * column is what the index serves.
 */
export async function loadInbox(
  supabase: Queryable,
  userId: string,
): Promise<InboxRow[]> {
  const convsRes = await supabase
    .from("conversations")
    .select("id, last_message_at, type, title, conversation_members!inner(user_id)")
    .eq("conversation_members.user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(INBOX_LIMIT);

  const convs = rows<{
    id: string;
    last_message_at: string | null;
    type: string | null;
    title: string | null;
  }>(convsRes, "conversations");
  if (convs.length === 0) return [];

  const ids = convs.map((c) => c.id);

  const [membersRes, summaryRes] = await Promise.all([
    supabase
      .from("conversation_members")
      .select(
        "conversation_id, user_id, profiles(id, display_name, username, avatar_hue, avatar_url, is_verified)",
      )
      .in("conversation_id", ids)
      // Everyone but me: the row is about who I am talking to.
      .neq("user_id", userId),
    supabase.rpc("get_inbox_summary", { p_conversation_ids: ids }),
  ]);

  const otherByConv = new Map<string, ChatProfile>();
  for (const m of rows<{ conversation_id: string; profiles: unknown }>(
    membersRes,
    "conversation members",
  )) {
    if (otherByConv.has(m.conversation_id)) continue;
    const profile = one<ChatProfile>(m.profiles);
    if (profile) otherByConv.set(m.conversation_id, profile);
  }

  const summaryByConv = new Map<
    string,
    {
      last_body: string | null;
      last_kind: string | null;
      last_created_at: string | null;
      last_sender_id: string | null;
      unread_count: number | null;
    }
  >();
  for (const s of rows<{
    conversation_id: string;
    last_body: string | null;
    last_kind: string | null;
    last_created_at: string | null;
    last_sender_id: string | null;
    unread_count: number | null;
  }>(summaryRes, "inbox summary")) {
    summaryByConv.set(s.conversation_id, s);
  }

  return convs.map((c) => {
    const s = summaryByConv.get(c.id);
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      last_message_at: c.last_message_at,
      other: otherByConv.get(c.id) ?? null,
      lastBody: s?.last_body ?? null,
      lastKind: s?.last_kind ?? null,
      lastAt: s?.last_created_at ?? null,
      lastSenderId: s?.last_sender_id ?? null,
      unread: s?.unread_count ?? 0,
    };
  });
}

/**
 * What a row says it is about.
 *
 * A group uses its own title; a DM is the other person. A group with no
 * title falls back to that person rather than to "Conversation", because
 * a chat named after nobody tells you nothing.
 */
export function inboxTitle(r: InboxRow): string {
  if (r.title?.trim()) return r.title.trim();
  return r.other?.display_name || r.other?.username || "Conversation";
}

/**
 * The line under the name.
 *
 * A message that was unsent or removed leaves its row behind, so the
 * preview has to say what happened rather than show an empty line — an
 * inbox row with no text reads as a failure to load.
 */
export function previewOf(r: InboxRow): string {
  if (!r.lastAt) return "No messages yet";
  if (r.lastKind && r.lastKind !== "text") {
    // A photo, a voice note, a forwarded post. The phone cannot render
    // them in a thread yet, and naming the kind is better than a blank.
    return `Sent a ${r.lastKind}`;
  }
  const body = r.lastBody?.trim();
  return body && body.length > 0 ? body : "Message";
}

/** One thread's messages, oldest last — the order a chat is read in. */
export async function loadThread(
  supabase: Queryable,
  conversationId: string,
): Promise<ChatMessage[]> {
  const res = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(THREAD_PAGE);

  /*
   * Asked newest-first so the LIMIT takes the newest fifty, then
   * reversed for reading. Asking oldest-first would take the fifty
   * oldest and show a chat frozen at its beginning.
   */
  return rows<ChatMessage>(res, "messages").slice().reverse();
}

/** The other person in a one-to-one chat, for the thread's header. */
export async function loadThreadHeader(
  supabase: Queryable,
  conversationId: string,
  userId: string,
): Promise<{ title: string; other: ChatProfile | null }> {
  const [convRes, memberRes] = await Promise.all([
    supabase.from("conversations").select("type, title").eq("id", conversationId).maybeSingle(),
    supabase
      .from("conversation_members")
      .select(
        "user_id, profiles(id, display_name, username, avatar_hue, avatar_url, is_verified)",
      )
      .eq("conversation_id", conversationId)
      .neq("user_id", userId)
      .limit(1),
  ]);

  const conv = row<{ type: string | null; title: string | null }>(convRes, "conversation");
  const member = rows<{ profiles: unknown }>(memberRes, "conversation member")[0];
  const other = member ? one<ChatProfile>(member.profiles) : null;
  const title =
    conv?.title?.trim() || other?.display_name || other?.username || "Conversation";
  return { title, other };
}

/**
 * Sends text.
 *
 * `send_message` is the RPC the web calls, and it owns the message row,
 * the conversation's `last_message_at` and the notification. An insert
 * into `messages` would write the row and leave the inbox showing the
 * previous message as the newest one.
 */
export async function sendMessage(
  supabase: Queryable,
  conversationId: string,
  body: string,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_body: body,
    p_kind: "text",
  });
  if (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Could not send that.";
    return { error: message };
  }
  return { ok: true };
}
