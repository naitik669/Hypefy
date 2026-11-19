import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { timeAgoShort } from "@hypefy/core/time";
import { supabase } from "@/supabase";
import {
  loadThread,
  loadThreadHeader,
  sendMessage,
  type ChatMessage,
  type ChatProfile,
} from "@/messages/load";
import { Avatar } from "@/avatar";
import { VerifiedStar } from "@/glyphs";
import { base, palette, type, family, radius } from "@/theme";

/**
 * One chat.
 *
 * **Realtime, which is the first subscription the phone makes.**
 * supabase-js's realtime works unchanged here — the blueprint called
 * this config rather than rework, and it is. The channel is per
 * conversation and filtered server-side, so a phone in twenty chats
 * receives only the one it is looking at.
 *
 * The list is inverted rather than scrolled to the end: an inverted
 * FlatList starts at the newest message with no scroll call, so a chat
 * never opens at the top and jumps. It also means a new message
 * arriving extends the list in the direction the eye is already looking.
 *
 * **What a chat on the web does and this does not:** photos, voice
 * notes, replies, reactions, editing, unsending, forwarding, polls,
 * read receipts, typing indicators, and E2EE — which is off and parked
 * on both clients. A message of a kind this cannot draw says what kind
 * it is rather than rendering blank.
 */
export default function Thread() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [header, setHeader] = useState<{ title: string; other: ChatProfile | null } | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) return { kind: "signed-out" as const };
      const [thread, head] = await Promise.all([
        loadThread(supabase as never, id),
        loadThreadHeader(supabase as never, id, data.user.id),
      ]);
      return { kind: "ok" as const, messages: thread, header: head, me: data.user.id };
    } catch (e) {
      return {
        kind: "failed" as const,
        message: e instanceof Error ? e.message : "Could not open this chat.",
      };
    }
  }, [id]);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchAll>>) => {
    if (result.kind === "signed-out") {
      router.replace("/");
      return;
    }
    if (result.kind === "failed") {
      setError(result.message);
      return;
    }
    setError(null);
    setMessages(result.messages);
    setHeader(result.header);
    setMe(result.me);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchAll();
      if (!cancelled) apply(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAll, apply]);

  useEffect(() => {
    /*
     * Filtered server-side on conversation_id. Without the filter every
     * message on Hypefy that this account may read arrives here and is
     * thrown away on the device — which is both the battery and the
     * bandwidth of a chat nobody has open.
     */
    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const next = payload.new as ChatMessage;
          setMessages((prev) => {
            if (!prev) return prev;
            // The sender gets their own insert back through the channel
            // as well, so a message sent from this device would appear
            // twice without this.
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    const result = await sendMessage(supabase as never, id, body);
    setSending(false);
    if ("error" in result) {
      // Kept, not cleared: throwing away what somebody wrote because the
      // network blinked is the one failure they cannot undo.
      setSendError(result.error);
      return;
    }
    setDraft("");
    // The row arrives through the channel, so nothing is added here —
    // adding it as well is how a message appears twice.
  }, [draft, sending, id]);

  const rows = messages ? [...messages].reverse() : [];

  return (
    <KeyboardAvoidingView
      style={base.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.back}
        >
          <ArrowLeft size={22} color={palette.foreground} />
        </Pressable>
        {header && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${header.title}'s profile`}
            disabled={!header.other?.username}
            onPress={() =>
              header.other?.username &&
              router.push({
                pathname: "/u/[username]",
                params: { username: header.other.username },
              })
            }
            style={styles.who}
          >
            <Avatar name={header.title} hue={header.other?.avatar_hue ?? 200} size={30} />
            <Text style={styles.title} numberOfLines={1}>
              {header.title}
            </Text>
            {header.other?.is_verified && <VerifiedStar size={13} />}
          </Pressable>
        )}
        <View style={styles.back} />
      </View>

      {error ? (
        <View style={base.centre}>
          <Text style={base.title}>Could not open this chat</Text>
          <Text style={[base.body, styles.gap]}>{error}</Text>
        </View>
      ) : !messages ? (
        <View style={base.centre}>
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <Bubble message={item} mine={item.sender_id === me} />}
          // Newest at the bottom with no scroll call, and new messages
          // extend the list where the eye already is.
          inverted
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={base.body}>No messages yet. Say something.</Text>
            </View>
          }
        />
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        {sendError && <Text style={styles.sendError}>{sendError}</Text>}
        <View style={styles.composerRow}>
          <TextInput
            accessibilityLabel="Write a message"
            placeholder="Message…"
            placeholderTextColor={palette.faint}
            value={draft}
            onChangeText={setDraft}
            editable={!sending}
            multiline
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: sending, busy: sending }}
            disabled={sending}
            onPress={() => void send()}
            style={({ pressed }) => [styles.send, sending && styles.busy, pressed && styles.pressed]}
          >
            {sending ? (
              <ActivityIndicator color={palette.accentInk} />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  /*
   * An unsent or removed message leaves its row behind. Saying what
   * happened is the point — a blank bubble reads as a message that failed
   * to load, and the person it was sent to deserves to know one was
   * taken back rather than to wonder.
   */
  const gone = message.is_unsent || message.removed_at;
  const unsupported = !gone && message.kind && message.kind !== "text";

  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirsRow]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text style={[styles.body, (gone || unsupported) && styles.quiet]}>
          {gone
            ? message.is_unsent
              ? "This message was unsent"
              : "This message was removed"
            : unsupported
              ? `Sent a ${message.kind} — open it on the web`
              : (message.body ?? "")}
        </Text>
        <Text style={styles.when}>{timeAgoShort(message.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  title: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.sm,
    flexShrink: 1,
  },

  list: { paddingHorizontal: 12, paddingVertical: 12 },
  empty: { paddingTop: 40, alignItems: "center", transform: [{ scaleY: -1 }] },

  bubbleRow: { flexDirection: "row", marginVertical: 3 },
  mineRow: { justifyContent: "flex-end" },
  theirsRow: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { backgroundColor: palette.accent },
  theirs: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  body: { color: palette.foreground, fontFamily: family.normal, fontSize: type.sm },
  quiet: { color: palette.muted, fontStyle: "italic" },
  when: {
    marginTop: 3,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.tiny,
  },

  composer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: palette.foreground,
    fontFamily: family.normal,
    fontSize: type.sm,
  },
  send: {
    minHeight: 44,
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    paddingHorizontal: 16,
  },
  busy: { opacity: 0.6 },
  pressed: { transform: [{ scale: 0.96 }] },
  sendText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
  sendError: {
    paddingBottom: 8,
    color: palette.danger,
    fontFamily: family.normal,
    fontSize: type.xs,
  },
  gap: { marginTop: 10 },
});
