/**
 * What `push_devices.platform` holds.
 *
 * Its own module with no native imports, so a Node test can CALL it. Inside
 * push.ts it sits beside `import * as Notifications from "expo-notifications"`,
 * and importing that module in Vitest fails at evaluation (`__DEV__ is not
 * defined`) — so the only thing a test could do with this is read it as text.
 * That is the trap this repo keeps falling into, and avatar-color.ts exists
 * for the same reason.
 */
export function platformName(os: string): "android" | "ios" | null {
  if (os === "android") return "android";
  if (os === "ios") return "ios";
  return null;
}
