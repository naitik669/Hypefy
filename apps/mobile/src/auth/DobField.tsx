import { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { palette, type, family } from "@/theme";
import { dobFromParts, digitsOnly, type DobParts } from "@/auth/dob-parts";
import { parseDob } from "@hypefy/core/dob";

/**
 * Date of birth, as three numbers.
 *
 * **This is a different control from the web's**, and deliberately so
 * rather than as a shortcut. The web spins three wheels in a bottom sheet
 * (DateOfBirthPicker), and its own comment explains why a wheel beats a
 * calendar for a birthday: the weekday carries no information anyone wants,
 * yet a calendar grid spends its whole layout encoding it. All true — and
 * porting that wheel means porting BottomSheet and Wheel, which are a
 * gesture-driven sheet and a snapping scroller, before this screen can ask
 * one question. A platform date picker would need
 * @react-native-community/datetimepicker, a native module, which costs a
 * cloud build and stops over-the-air delivery.
 *
 * So: three fields, the device's own number pad, and the SAME stored value
 * — `YYYY-MM-DD` — which is the part the age gate and the database depend
 * on. Which dates exist comes from @hypefy/core/dob, so 31 February is
 * refused here exactly as the wheel refuses to scroll to it.
 *
 * It is the one place in the app that knowingly differs in KIND from the
 * site rather than in detail. When the sheet and the wheel are ported for
 * their own sake, this becomes a wrapper around them.
 *
 * The composing is in @/auth/dob-parts so a test can call it.
 */

function partsOf(value: string): DobParts {
  const parsed = parseDob(value);
  if (!parsed) return { d: "", m: "", y: "" };
  return {
    d: String(parsed.day).padStart(2, "0"),
    m: String(parsed.monthIndex + 1).padStart(2, "0"),
    y: String(parsed.year),
  };
}

export function DobField({
  value,
  onChange,
  editable = true,
}: {
  value: string;
  onChange: (next: string) => void;
  editable?: boolean;
}) {
  const [parts, setParts] = useState<DobParts>(() => partsOf(value));

  const publish = useCallback(
    (next: DobParts) => {
      setParts(next);
      onChange(dobFromParts(next));
    },
    [onChange],
  );

  const started = parts.d !== "" || parts.m !== "" || parts.y !== "";

  return (
    <View>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Day of birth"
          placeholder="DD"
          placeholderTextColor={palette.faint}
          value={parts.d}
          onChangeText={(t) => publish({ ...parts, d: digitsOnly(t, 2) })}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          editable={editable}
          style={[styles.input, styles.narrow]}
        />
        <TextInput
          accessibilityLabel="Month of birth"
          placeholder="MM"
          placeholderTextColor={palette.faint}
          value={parts.m}
          onChangeText={(t) => publish({ ...parts, m: digitsOnly(t, 2) })}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          editable={editable}
          style={[styles.input, styles.narrow]}
        />
        <TextInput
          accessibilityLabel="Year of birth"
          placeholder="YYYY"
          placeholderTextColor={palette.faint}
          value={parts.y}
          onChangeText={(t) => publish({ ...parts, y: digitsOnly(t, 4) })}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={4}
          editable={editable}
          style={[styles.input, styles.wide]}
        />
      </View>
      {/* Said, rather than left as a date that silently will not submit. */}
      {started && value === "" && (
        <Text style={styles.hint}>Enter a day, month and year that exist.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  input: {
    height: 48, // h-12, as the other fields on this card
    borderRadius: 12, // rounded-xl
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 12,
    color: palette.foreground,
    fontFamily: family.medium,
    fontSize: type.sm,
    textAlign: "center",
  },
  narrow: { width: 64 },
  wide: { flex: 1 },
  hint: {
    marginTop: 4,
    color: palette.muted,
    fontFamily: family.normal,
    fontSize: 11,
  },
});
