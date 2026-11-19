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
import { commentProblem, MAX_COMMENT } from "@hypefy/core/comments";
import { formatCount } from "@hypefy/core/format";
import { timeAgoShort } from "@hypefy/core/time";
import { supabase } from "@/supabase";
import {
  createComment,
  loadComments,
  PAGE,
  thread,
  type Comment,
} from "@/comments/load";
import { Avatar } from "@/avatar";
import { VerifiedStar, HypeIcon } from "@/glyphs";
import { base, palette, type, family, radius } from "@/theme";

/**
 * A post's comments — the first screen that is not a tab, and the first
 * write that creates a ROW rather than toggling one.
 *
 * On the web this is a BottomSheet over the feed. Here it is a route, for
 * two reasons: the sheet and its gesture are not ported, and a route gets
 * the platform's own back — the system gesture and the hardware button —
 * for free. A sheet that only closes by tapping a small X is the kind of
 * thing that feels wrong on Android without anyone being able to say why.
 *
 * Reached from a post's comment button, and left by Back or the arrow.
 * Both are asserted, per the rule that came out of #78: a screen can
 * match the website perfectly and still be unreachable.
 *
 * The thread is one level deep, as the web renders it, and the threading
 * comes from @hypefy/core/comments — so a reply written on the website
 * appears here under its root even though this screen cannot write one.
 */
export default function Comments() {
  const insets = useSafeAreaInsets();
  const { id, owner } = useLocalSearchParams<{ id: string; owner?: string }>();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const fetchAll = useCallback(async (): Promise<
    { kind: "ok"; comments: Comment[]; more: boolean } | { kind: "failed"; message: string }
  > => {
    try {
      const page = await loadComments(supabase as never, id);
      return { kind: "ok", comments: page.comments, more: page.more };
    } catch (e) {
      return {
        kind: "failed",
        message: e instanceof Error ? e.message : "Could not load the comments.",
      };
    }
  }, [id]);

  /** Applies a result. Never called synchronously from an effect body. */
  const apply = useCallback(
    (result: Awaited<ReturnType<typeof fetchAll>>) => {
      if (result.kind === "failed") {
        setError(result.message);
        return;
      }
      setError(null);
      setComments(result.comments);
      setMore(result.more);
    },
    [],
  );

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

  const send = useCallback(async () => {
    const problem = commentProblem(body);
    if (problem) {
      setSendError(problem);
      return;
    }
    if (!owner) {
      // Without the post's author there is nobody to notify, and
      // create_comment writes that notification. Guessing would send it to
      // the wrong person, which is worse than refusing.
      setSendError("Could not tell who to notify. Go back and try again.");
      return;
    }
    setSending(true);
    setSendError(null);
    const result = await createComment(supabase as never, {
      postId: id,
      ownerId: owner,
      body: body.trim(),
    });
    setSending(false);
    if ("error" in result) {
      // Postgres names the cause, and a rate limit reads very differently
      // from a dead session.
      setSendError(result.error);
      return;
    }
    /*
     * Cleared only on success. The web's own note: clearing
     * unconditionally threw away what you had written on every failure.
     */
    setBody("");
    apply(await fetchAll());
  }, [body, owner, id, apply, fetchAll]);

  const rows = comments ? thread(comments) : [];
  const total = comments?.length ?? 0;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
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
        <Text style={styles.title}>
          {comments === null ? "Comments" : `${formatCount(total)} comments`}
        </Text>
        <View style={styles.back} />
      </View>

      {error ? (
        <View style={base.centre}>
          <Text style={base.title}>Could not load the comments</Text>
          <Text style={[base.body, styles.gap]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={styles.retry}
            onPress={() => void fetchAll().then(apply)}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : comments === null ? (
        <View style={base.centre}>
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.root.id}
          renderItem={({ item }) => (
            <View>
              <Row node={item.root} />
              {item.replies.map((reply) => (
                <Row key={reply.id} node={reply} reply />
              ))}
            </View>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={base.title}>No comments yet</Text>
              <Text style={[base.body, styles.gap]}>Be the first to say something.</Text>
            </View>
          }
          ListFooterComponent={
            /*
             * Said rather than silently truncated: the web pages on
             * scroll, and until this does, a thread longer than a page
             * would otherwise look complete.
             *
             * `undefined` rather than `null` when there is nothing to say —
             * the prop's type takes an element or nothing, and `null` is
             * neither.
             */
            more ? (
              <Text style={styles.truncated}>
                Showing the first {PAGE}. Open this post on the web to read the rest.
              </Text>
            ) : undefined
          }
          initialNumToRender={12}
        />
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
        {sendError && <Text style={styles.sendError}>{sendError}</Text>}
        <View style={styles.composerRow}>
          <TextInput
            accessibilityLabel="Write a comment"
            placeholder="Add a comment…"
            placeholderTextColor={palette.faint}
            value={body}
            onChangeText={setBody}
            editable={!sending}
            multiline
            maxLength={MAX_COMMENT}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            accessibilityState={{ disabled: sending, busy: sending }}
            disabled={sending}
            onPress={() => void send()}
            style={({ pressed }) => [
              styles.send,
              sending && styles.sendOff,
              pressed && styles.pressed,
            ]}
          >
            {sending ? (
              <ActivityIndicator color={palette.accentInk} />
            ) : (
              <Text style={styles.sendText}>Post</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Row({ node, reply = false }: { node: Comment; reply?: boolean }) {
  const profile = node.profiles;
  const name = profile?.display_name || profile?.username || "Someone";
  return (
    <View style={[styles.row, reply && styles.rowReply]}>
      <Avatar name={name} hue={profile?.avatar_hue ?? 200} size={reply ? 28 : 34} />
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
          {profile?.is_verified && <VerifiedStar size={12} />}
          <Text style={styles.rowWhen}>· {timeAgoShort(node.created_at)}</Text>
          {node.pinned_at && <Text style={styles.pinned}>Pinned</Text>}
        </View>
        <Text style={styles.rowText}>{node.body}</Text>
        {/* The star is a count, not a button: hyping a comment is a write
            of its own and is not ported. */}
        {(node.hype_count ?? 0) > 0 && (
          <View style={styles.rowHype}>
            <HypeIcon size={13} color={palette.muted} />
            <Text style={styles.rowHypeCount}>{formatCount(node.hype_count ?? 0)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: {
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.base,
  },

  list: { paddingVertical: 8 },
  empty: { paddingTop: 60, paddingHorizontal: 24, alignItems: "center" },
  gap: { marginTop: 10 },
  truncated: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.xs,
    textAlign: "center",
  },

  row: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  // One level deep, indented under its root, as the web renders it.
  rowReply: { paddingLeft: 48 },
  rowBody: { flex: 1 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowName: {
    color: palette.foreground,
    fontFamily: family.semibold,
    fontSize: type.sm,
    flexShrink: 1,
  },
  rowWhen: { color: palette.muted, fontFamily: family.normal, fontSize: type.xs },
  pinned: {
    marginLeft: 2,
    color: palette.accent,
    fontFamily: family.medium,
    fontSize: type.tiny,
  },
  rowText: {
    marginTop: 2,
    color: palette.foreground,
    fontFamily: family.normal,
    fontSize: type.sm,
    lineHeight: 19.6,
  },
  rowHype: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  rowHypeCount: { color: palette.muted, fontFamily: family.medium, fontSize: type.tiny },

  composer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    backgroundColor: palette.background,
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
    paddingTop: 12,
    paddingBottom: 12,
    color: palette.foreground,
    fontFamily: family.normal,
    fontSize: type.sm,
  },
  send: {
    minHeight: 44,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: palette.accent,
    paddingHorizontal: 16,
  },
  sendOff: { opacity: 0.6 },
  pressed: { transform: [{ scale: 0.96 }] },
  sendText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
  sendError: {
    paddingBottom: 8,
    color: palette.danger,
    fontFamily: family.normal,
    fontSize: type.xs,
  },

  retry: {
    marginTop: 24,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
});
