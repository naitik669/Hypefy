/**
 * The Android notification channel both ends must agree on.
 *
 * Android 8 and later post every notification to a channel. The channel is
 * created by the APP; the id is chosen by the SENDER. When they disagree,
 * nothing errors: Firebase quietly posts to a fallback channel it makes
 * itself, called "Miscellaneous", which the person can see in the system
 * settings and cannot recognise, and whose importance is not the one the app
 * asked for — so a direct message can arrive without a sound or a heads-up
 * banner for no visible reason.
 *
 * One constant, imported by the sender (src/lib/fcm.ts) and by the app
 * (apps/mobile/src/notifications/taps.ts), is the only way that agreement
 * survives either side being edited alone.
 */
export const PUSH_CHANNEL_ID = "default";

/** What the person sees in Android's notification settings. */
export const PUSH_CHANNEL_NAME = "Hypefy";
