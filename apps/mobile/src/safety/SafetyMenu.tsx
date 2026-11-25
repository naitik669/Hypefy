import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ban, Check, Flag, X } from "lucide-react-native";
import {
  BLOCK_COPY,
  MAX_REPORT_DETAILS,
  REPORT_LABELS,
  REPORT_REASONS,
  blockUser,
  isBlockedByMe,
  submitReport,
  unblockUser,
} from "@hypefy/core/safety";
import { supabase } from "@/supabase";
import { safetyRows, type SafetyRow, type SafetyTarget } from "@/safety/menu";
import { palette, type, family, radius } from "@/theme";

/**
 * Report and block, as one sheet with steps rather than sheets on sheets.
 *
 * The web opens a menu, then a ReportSheet or a ConfirmDialog on top of it.
 * Here the three are steps inside ONE Modal. That is a platform reason:
 * two React Native Modals open at once on Android drop touches on the lower
 * one and can leave a dim layer behind when the top one closes. The content
 * of each step is the web's — the reasons, the optional details, "Thanks
 * for reporting", and the block confirmation's words, all from
 * @hypefy/core/safety.
 *
 * The block confirmation is drawn inside the sheet rather than as the web's
 * centred dialog for the same reason. Its words and its two buttons are the
 * web's.
 */

type Step = "menu" | "report" | "confirm" | "reported";

export function SafetyMenu({
  open,
  onClose,
  target,
  viewerId,
  onBlocked,
}: {
  open: boolean;
  onClose: () => void;
  target: SafetyTarget;
  viewerId: string | null;
  /** Called once a block is written, so the screen can drop their content. */
  onBlocked?: (userId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("menu");
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Whether they are already blocked matters only on a profile, where the
  // row turns into Unblock. Read when the sheet opens, as the web does.
  useEffect(() => {
    if (!open || target.type !== "profile" || !viewerId) return;
    let live = true;
    void isBlockedByMe(supabase as never, viewerId, target.authorId).then((b) => {
      if (live) setBlocked(b);
    });
    return () => {
      live = false;
    };
  }, [open, target.type, target.authorId, viewerId]);

  const close = () => {
    if (busy) return;
    onClose();
    setStep("menu");
    setReason(null);
    setDetails("");
    setProblem(null);
  };

  const rows = safetyRows(target, viewerId, blocked);
  const label = REPORT_LABELS[target.type];

  async function choose(row: SafetyRow) {
    setProblem(null);
    if (row.key === "report") return setStep("report");
    if (row.key === "block") return setStep("confirm");
    if (!viewerId) return;
    setBusy(true);
    const result = await unblockUser(supabase as never, viewerId, target.authorId);
    setBusy(false);
    if (!result.ok) return setProblem(result.error);
    setBlocked(false);
    close();
  }

  async function sendReport() {
    if (!reason || busy || !viewerId) return;
    setBusy(true);
    setProblem(null);
    const result = await submitReport(supabase as never, {
      reporterId: viewerId,
      targetType: target.type,
      targetId: target.id,
      reason,
      details,
    });
    setBusy(false);
    if (!result.ok) {
      // Said, not swallowed: the web resets the choice silently, which on a
      // phone with a bad signal reads as a button that did nothing.
      setProblem(result.error);
      return;
    }
    setStep("reported");
  }

  async function confirmBlock() {
    if (busy || !viewerId) return;
    setBusy(true);
    setProblem(null);
    const result = await blockUser(supabase as never, viewerId, target.authorId);
    setBusy(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    onBlocked?.(target.authorId);
    close();
  }

  const title =
    step === "report"
      ? `Report ${label}`
      : step === "confirm"
        ? BLOCK_COPY.title(target.username)
        : step === "reported"
          ? `Report ${label}`
          : "Options";

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={close}
        />
        <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grip} />
          <View style={styles.head}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={close}
              style={styles.x}
            >
              <X size={18} color={palette.muted} />
            </Pressable>
          </View>

          {step === "menu" &&
            rows.map((row) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                disabled={busy}
                onPress={() => void choose(row)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.rowIcon, row.danger && styles.rowIconDanger]}>
                  {row.key === "report" ? (
                    <Flag size={18} color={row.danger ? palette.danger : palette.muted} />
                  ) : (
                    <Ban size={18} color={row.danger ? palette.danger : palette.muted} />
                  )}
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, row.danger && styles.danger]}>{row.label}</Text>
                  <Text style={styles.rowSub}>{row.sub}</Text>
                </View>
              </Pressable>
            ))}

          {step === "report" && (
            <View>
              <Text style={styles.prompt}>Why are you reporting this {label}?</Text>
              {REPORT_REASONS.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: reason === r }}
                  accessibilityLabel={r}
                  onPress={() => setReason(r)}
                  style={[styles.reason, reason === r && styles.reasonOn]}
                >
                  <Text style={styles.reasonText}>{r}</Text>
                  <View style={[styles.tick, reason === r && styles.tickOn]}>
                    {reason === r && <Check size={13} color={palette.accentInk} />}
                  </View>
                </Pressable>
              ))}
              <TextInput
                accessibilityLabel="Add details (optional)"
                placeholder="Add details (optional)"
                placeholderTextColor={palette.faint}
                value={details}
                onChangeText={setDetails}
                maxLength={MAX_REPORT_DETAILS}
                multiline
                style={styles.details}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Submit report"
                accessibilityState={{ disabled: !reason || busy, busy }}
                disabled={!reason || busy}
                onPress={() => void sendReport()}
                style={[styles.primary, (!reason || busy) && styles.off]}
              >
                {busy ? (
                  <ActivityIndicator color={palette.accentInk} />
                ) : (
                  <Text style={styles.primaryText}>Submit report</Text>
                )}
              </Pressable>
            </View>
          )}

          {step === "reported" && (
            <View style={styles.done}>
              <View style={styles.doneMark}>
                <Check size={26} color={palette.accent} />
              </View>
              <Text style={styles.doneTitle}>Thanks for reporting</Text>
              <Text style={styles.doneBody}>Our team will review this {label}.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={close}
                style={[styles.primary, styles.doneButton]}
              >
                <Text style={styles.primaryText}>Done</Text>
              </Pressable>
            </View>
          )}

          {step === "confirm" && (
            <View style={styles.confirm}>
              <View style={styles.confirmMark}>
                <Ban size={22} color={palette.danger} />
              </View>
              <Text style={styles.confirmBody}>{BLOCK_COPY.body}</Text>
              <View style={styles.confirmRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  disabled={busy}
                  onPress={close}
                  style={[styles.cancel, busy && styles.off]}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={BLOCK_COPY.confirm}
                  accessibilityState={{ busy }}
                  disabled={busy}
                  onPress={() => void confirmBlock()}
                  style={[styles.block, busy && styles.off]}
                >
                  {busy ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.blockText}>{BLOCK_COPY.confirm}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {problem && <Text style={styles.problem}>{problem}</Text>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.6)" },
  // rounded-t-3xl border-t border-border bg-elevated px-5
  panel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.elevated,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  // mx-auto mb-3 h-1.5 w-10 rounded-full bg-border
  grip: {
    alignSelf: "center",
    marginBottom: 12,
    height: 6,
    width: 40,
    borderRadius: 3,
    backgroundColor: palette.border,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  title: { color: palette.foreground, fontFamily: family.bold, fontSize: type.base },
  x: { height: 32, width: 32, alignItems: "center", justifyContent: "center" },

  // flex items-center gap-3 rounded-xl px-2 py-3
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  rowPressed: { backgroundColor: "rgba(255, 255, 255, 0.05)" },
  rowIcon: {
    height: 40,
    width: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  rowIconDanger: { backgroundColor: "rgba(255, 69, 69, 0.1)" },
  rowText: { flex: 1 },
  rowLabel: { color: palette.foreground, fontFamily: family.semibold, fontSize: type.sm },
  rowSub: { color: palette.muted, fontFamily: family.normal, fontSize: type.xs },
  danger: { color: palette.danger },

  prompt: {
    paddingBottom: 4,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.xs,
  },
  // flex items-center justify-between rounded-xl px-3 py-3
  reason: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  reasonOn: { backgroundColor: "rgba(163, 230, 53, 0.1)" },
  reasonText: { color: palette.foreground, fontFamily: family.normal, fontSize: type.sm },
  tick: {
    height: 20,
    width: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tickOn: { borderColor: palette.accent, backgroundColor: palette.accent },
  details: {
    marginTop: 8,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.foreground,
    fontFamily: family.normal,
    fontSize: type.sm,
    textAlignVertical: "top",
  },
  // mt-3 h-11 w-full rounded-xl bg-accent
  primary: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accent,
  },
  primaryText: { color: palette.accentInk, fontFamily: family.bold, fontSize: type.sm },
  off: { opacity: 0.5 },

  done: { alignItems: "center", gap: 8, paddingVertical: 24 },
  doneMark: {
    height: 48,
    width: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(163, 230, 53, 0.15)",
  },
  doneTitle: { color: palette.foreground, fontFamily: family.semibold, fontSize: type.sm },
  doneBody: {
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.xs,
    textAlign: "center",
  },
  doneButton: { alignSelf: "stretch" },

  confirm: { alignItems: "center", gap: 12, paddingTop: 4, paddingBottom: 4 },
  confirmMark: {
    height: 48,
    width: 48,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 69, 69, 0.1)",
  },
  confirmBody: {
    maxWidth: 260,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: type.sm,
    lineHeight: 19.6,
    textAlign: "center",
  },
  confirmRow: { marginTop: 8, flexDirection: "row", gap: 8, alignSelf: "stretch" },
  cancel: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { color: palette.foreground, fontFamily: family.semibold, fontSize: type.sm },
  block: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.danger,
  },
  blockText: { color: "#ffffff", fontFamily: family.bold, fontSize: type.sm },

  problem: {
    paddingTop: 10,
    color: palette.danger,
    fontFamily: family.normal,
    fontSize: type.xs,
    textAlign: "center",
  },
});
