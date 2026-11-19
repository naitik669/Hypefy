import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, CheckCheck, ShieldAlert, Sparkles, Trophy } from "lucide-react-native";
import { timeAgoShort } from "@hypefy/core/time";
import {
  actorSummary,
  groupNotifs,
  hasNoActor,
  shownNotifs,
  type NotifActor,
  type NotifGroup,
} from "@hypefy/core/notif-group";
import { needsYou, sectionOf, type ActivityPrefs } from "@hypefy/core/activity-prefs";
import { parsePrivateProfile } from "@hypefy/core/profile";
import { supabase } from "@/supabase";
import { loadNotifs, markRead, readAll, type NotifRow } from "@/notifications/load";
import { elsewhere, mobileRoute } from "@/notifications/route";
import { PushNudge } from "@/notifications/PushNudge";
import { Avatar } from "@/avatar";
import { base, palette, type, family, radius } from "@/theme";

/**
 * Activity.
 *
 * **Reading is scoped to what was loaded**, which is the website's own
 * correction: it used to call mark_notifications_read() on open, clearing
 * every notification on the account including the hundreds never fetched or
 * rendered. The badge clears for what is on screen; "Read all" is the
 * deliberate way to clear the rest, and says so.
 *
 * **A row whose destination this app lacks is not tappable, and says where
 * the thing is.** Three of core's fifteen places exist here. The web's own
 * comment on this logic is about rows that looked tappable and did nothing,
 * three times over; a `null` route makes that a decision rather than a
 * silence. See src/notifications/route.ts.
 *
 * What the website has here and this does not: the Tune sheet (its switches
 * are obeyed, not offered — Settings is not ported and a sheet that cannot
 * save is worse than none), swipe-to-clear and mute, Approve/Deny on a
 * follow request, Follow back from the row, the Spotlight question, and
 * infinite scroll past the first fifty.
 */
type Group = NotifGroup<NotifActor>;

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const [notifs, setNotifs] = useState<NotifRow[] | null>(null);
  const [prefs, setPrefs] = useState<ActivityPrefs>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) return { kind: "signed-out" as const };
      const [list, me] = await Promise.all([
        loadNotifs(supabase as never, data.user.id),
        supabase.rpc("my_private_profile"),
      ]);
      return {
        kind: "ok" as const,
        list,
        prefs: (parsePrivateProfile(me.data)?.notifPrefs ?? {}) as ActivityPrefs,
      };
    } catch (e) {
      return {
        kind: "failed" as const,
        message: e instanceof Error ? e.message : "Could not load your activity.",
      };
    }
  }, []);

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
    setPrefs(result.prefs);
    setNotifs(result.list);
    // Only what arrived. Marking more than was rendered is how the website
    // silently cleared notifications nobody had seen.
    const unread = result.list.filter((n) => !n.is_read).map((n) => n.id);
    void markRead(supabase as never, unread);
  }, []);

  const reload = useCallback(async () => {
    apply(await fetchAll());
  }, [fetchAll, apply]);

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

  const visible = useMemo(() => shownNotifs(notifs ?? [], prefs), [notifs, prefs]);
  const groups = useMemo(() => groupNotifs<NotifRow, NotifActor>(visible), [visible]);
  // What needs an answer first, then the rest by when it happened — the
  // website's order.
  const needs = useMemo(() => groups.filter((g) => needsYou(g.type, g.isRead)), [groups]);
  const rest = useMemo(() => groups.filter((g) => !needsYou(g.type, g.isRead)), [groups]);

  const rows = useMemo(() => {
    const out: ({ sort: "head"; label: string } | { sort: "row"; group: Group })[] = [];
    if (needs.length > 0) {
      out.push({ sort: "head", label: "Needs you" });
      for (const g of needs) out.push({ sort: "row", group: g });
    }
    for (const section of ["today", "week", "earlier"] as const) {
      const inSection = rest.filter((g) => sectionOf(g.latestAt) === section);
      if (inSection.length === 0) continue;
      out.push({
        sort: "head",
        label: section === "today" ? "Today" : section === "week" ? "This week" : "Earlier",
      });
      for (const g of inSection) out.push({ sort: "row", group: g });
    }
    return out;
  }, [needs, rest]);

  const clearEverything = useCallback(async () => {
    setNote(null);
    const before = notifs;
    setNotifs((prev) => prev?.map((n) => (n.is_read ? n : { ...n, is_read: true })) ?? prev);
    const result = await readAll(supabase as never);
    if ("error" in result) {
      // Put it back: a badge that cleared on a failed write disagrees with
      // the next refresh and with the bell.
      setNotifs(before);
      setNote("Couldn't mark everything read.");
    }
  }, [notifs]);

  const anyUnread = (notifs ?? []).some((n) => !n.is_read);

  return (
    <View style={base.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
          onPress={() => router.back()}
          style={styles.action}
        >
          <ArrowLeft size={22} color={palette.foreground} />
        </Pressable>
        <Text style={styles.heading} accessibilityRole="header">
          Activity
        </Text>
        {anyUnread ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark everything read"
            hitSlop={10}
            onPress={() => void clearEverything()}
            style={styles.action}
          >
            <CheckCheck size={21} color={palette.muted} />
          </Pressable>
        ) : (
          <View style={styles.action} />
        )}
      </View>

      {note && <Text style={styles.note}>{note}</Text>}

      {error ? (
        <View style={base.centre}>
          <Text style={base.title}>Could not load your activity</Text>
          <Text style={[base.body, styles.gap]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={styles.retry}
            onPress={() => void reload()}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !notifs ? (
        <View style={base.centre}>
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => (r.sort === "head" ? `head-${r.label}` : r.group.key)}
          renderItem={({ item }) =>
            item.sort === "head" ? (
              <Text style={styles.section}>{item.label.toUpperCase()}</Text>
            ) : (
              <Row group={item.group} />
            )
          }
          contentContainerStyle={styles.list}
          // Asked here because this is who wants it, which is the
          // website's reasoning in PushNudge's own comment.
          ListHeaderComponent={<PushNudge />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void reload().finally(() => setRefreshing(false));
              }}
              tintColor={palette.accent}
              colors={[palette.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={base.title}>Nothing yet</Text>
              <Text style={[base.body, styles.gap]}>
                Hypes, comments and follows turn up here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function Row({ group: g }: { group: Group }) {
  const route = mobileRoute(g.target);
  const onWeb = elsewhere(g.target);
  const name = actorSummary(g);
  const noActor = hasNoActor(g.type);
  const cluster = g.actors.length > 1;

  const inner = (
    <>
      <View style={styles.face}>
        {g.type === "trial_reminder" ? (
          <View style={styles.badgeTile}>
            <Sparkles size={22} color={palette.accent} />
          </View>
        ) : g.type === "milestone" ? (
          <View style={styles.badgeTile}>
            <Trophy size={21} color={palette.accent} />
          </View>
        ) : g.type === "security_alert" ? (
          // Nobody did this to you; it happened to your account. A face here
          // is a stranger's initial beside "New sign-in", which reads as an
          // accusation of the wrong person.
          <View style={styles.alertTile}>
            <ShieldAlert size={22} color={palette.danger} />
          </View>
        ) : cluster ? (
          <View style={styles.stack}>
            {g.actors.slice(0, 3).map((a, i) => (
              <View
                key={i}
                style={[
                  styles.stacked,
                  i === 0 ? styles.stackLead : i === 1 ? styles.stackTwo : styles.stackThree,
                ]}
              >
                <Avatar
                  name={a.display_name ?? a.username ?? "?"}
                  hue={a.avatar_hue ?? 280}
                  size={i === 0 ? 34 : 22}
                />
              </View>
            ))}
          </View>
        ) : (
          <Avatar name={name} hue={g.actors[0]?.avatar_hue ?? 280} size={44} />
        )}
        {!g.isRead && <View style={styles.dot} />}
      </View>

      <View style={styles.text}>
        <Text style={styles.body}>
          {!noActor && <Text style={styles.who}>{name} </Text>}
          <Text style={noActor ? styles.who : styles.what}>{g.body}</Text>
          <Text style={styles.when}> {timeAgoShort(g.latestAt)}</Text>
        </Text>
        {onWeb && (
          // Said, not hidden: this row is about something real, and the one
          // useful thing to know is that it is on the website.
          <Text style={styles.onWeb}>Open this on the web</Text>
        )}
      </View>

      {g.thumb && (
        <Image source={{ uri: g.thumb.url }} style={styles.thumb} accessibilityIgnoresInvertColors />
      )}
    </>
  );

  if (!route) {
    // Not a Pressable at all. A disabled button still reports itself as a
    // button to a screen reader and still flashes under a finger.
    return <View style={[styles.row, !g.isRead && styles.unread]}>{inner}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${noActor ? "" : `${name} `}${g.body ?? ""}`.trim()}
      onPress={() => router.push(route as never)}
      style={({ pressed }) => [styles.row, !g.isRead && styles.unread, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
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
  action: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  heading: {
    flex: 1,
    color: palette.foreground,
    fontFamily: family.bold,
    fontSize: type.base,
  },

  list: { paddingBottom: 40 },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    color: palette.faint,
    fontFamily: family.bold,
    fontSize: type.tiny,
    letterSpacing: 1.2,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // The accent edge the website draws down the left of an unread row.
  unread: { borderLeftWidth: 3, borderLeftColor: palette.accent, paddingLeft: 13 },
  pressed: { opacity: 0.7 },

  face: { width: 44, height: 44 },
  stack: { width: 44, height: 44 },
  stacked: { position: "absolute" },
  stackLead: { left: 0, top: 0, zIndex: 1 },
  stackTwo: { right: 0, bottom: 0, zIndex: 2 },
  stackThree: { left: 0, bottom: 0, zIndex: 2 },
  badgeTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  alertTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  dot: {
    position: "absolute",
    right: -1,
    top: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.accent,
  },

  text: { flex: 1, minWidth: 0 },
  body: { fontFamily: family.normal, fontSize: type.sm, lineHeight: 19 },
  who: { color: palette.foreground, fontFamily: family.semibold },
  what: { color: palette.muted },
  when: { color: palette.faint, fontSize: type.xs },
  onWeb: {
    marginTop: 3,
    color: palette.faint,
    fontFamily: family.normal,
    fontSize: type.tiny,
  },

  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: palette.surface },

  empty: { paddingTop: 60, paddingHorizontal: 24, alignItems: "center" },
  note: {
    paddingHorizontal: 16,
    paddingTop: 10,
    color: palette.danger,
    fontFamily: family.normal,
    fontSize: type.xs,
  },
  gap: { marginTop: 10 },
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
