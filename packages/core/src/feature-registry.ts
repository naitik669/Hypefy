import type { Feature } from "@hypefy/core/features";

/**
 * Every feature whose availability differs by where you are using Hypefy.
 *
 * Deliberately small. This is not a list of what the app does — it is a list
 * of the places where the answer to "can I do this here" is no, and the
 * reason is worth saying out loud. A feature that works everywhere does not
 * belong here; adding it would be inventing work for the registry to do.
 *
 * What is NOT here, on purpose: the native adapter plumbing. NativeShell's
 * back-button handling, the keyboard inset, haptics, the splash screen and
 * the status bar all branch on platform, but none of them is an availability
 * decision — they are one feature implemented twice, and they already degrade
 * silently through safeNative(). Putting them in a feature registry would
 * confuse "implemented differently" with "not offered", which are different
 * questions with different answers for the user.
 */
export const FEATURES = {
  /**
   * Buying anything: premium, frames, nameplates, avatar decorations.
   *
   * Off in both native apps because the stores require their own billing for
   * digital goods, and Hypefy bills through Razorpay. The decision taken on
   * 16 Nov 2026 was to keep purchases on the web rather than adopt Play
   * Billing at 15-30% against Razorpay's ~2%.
   *
   * The fallback is real but unsayable in the app: both stores also refuse
   * apps that point people at a purchase outside their own billing. So the
   * app says only that it is unavailable, and the web says where to go. This
   * was previously a comment in marketplace.ts and is now a rule.
   */
  purchase: {
    id: "purchase",
    platforms: { androidNative: "unavailable", iosNative: "unavailable" },
    reason: {
      androidNative: "Not available in the app",
      iosNative: "Not available in the app",
    },
    fallback: {
      what: "Buy it on hypefy.chat",
      unmentionableOn: ["androidNative", "iosNative"],
    },
    // The UI half only. A purchase is money: the billing routes and the
    // Razorpay webhook are what actually decide, and they do not consult this.
    enforce: "server",
  },

  /**
   * Ads.
   *
   * AdSense's terms bar it from an app WebView — that is AdMob's territory,
   * and AdMob needs a native SDK Hypefy does not have. Unavailable rather
   * than degraded: no ad is shown at all.
   */
  ads: {
    id: "ads",
    platforms: { androidNative: "unavailable", iosNative: "unavailable" },
    reason: { default: "Ads are not shown in the app" },
    enforce: "client",
  },

  /**
   * Blocking screenshots and screen recording of a chat.
   *
   * Android only, through FLAG_SECURE. Browsers expose no capture API at all,
   * so on the web the product can only ask — which is why this is a
   * capability check and the copy must never promise more than it can do.
   */
  "chat.blockCapture": {
    id: "chat.blockCapture",
    requires: { blockCapture: true },
    reason: { default: "Your device can't block screenshots" },
    enforce: "client",
  },

  /**
   * Recording a Shot or a Show with the camera.
   *
   * Capability, not platform: desktop browsers have getUserMedia and the
   * capture code is plain web API, so a laptop with a webcam can record. A
   * device with no camera cannot, wherever it is.
   */
  "shot.capture": {
    id: "shot.capture",
    requires: { camera: true },
    permission: "camera",
    reason: {
      default: "No camera on this device",
      desktopWeb: "No camera on this device — you can still upload a file",
    },
    fallback: { what: "Upload a video instead" },
    enforce: "client",
  },

  /**
   * Uploading in the background, after you leave the screen.
   *
   * A backgrounded WebView stops decoding, which is why a long upload stalls
   * today. Degraded rather than unavailable on the web: the upload still
   * works, it just needs the tab to stay in front.
   */
  "upload.background": {
    id: "upload.background",
    requires: { backgroundWork: true },
    platforms: {
      mobileWeb: "degraded",
      tabletWeb: "degraded",
      desktopWeb: "degraded",
    },
    reason: { default: "Keep this tab open until the upload finishes" },
    enforce: "client",
  },

  /**
   * Voice and video calls.
   *
   * Decided on 16 Nov 2026: excluded from the native apps at v1. They work on
   * the web and react-native-webrtc is the heaviest native dependency in the
   * project, so it waits until after launch. Unlike purchases this fallback
   * IS sayable — no store rule prevents pointing at the web for a call.
   */
  calls: {
    id: "calls",
    requires: { microphone: true },
    platforms: { androidNative: "unavailable", iosNative: "unavailable" },
    reason: { default: "Calls aren't in the app yet" },
    fallback: { what: "Start the call on hypefy.chat" },
    enforce: "server",
  },

  /**
   * End-to-end encrypted chat.
   *
   * Off everywhere and parked. E2EE_ENABLED defaults to false because it
   * blocks the server-side moderation an app store and a young audience
   * require, and puts message history one lost recovery code away from gone.
   * The implementation and its tests are intact behind the flag.
   */
  "chat.e2ee": {
    id: "chat.e2ee",
    flag: "e2ee",
    reason: { default: "End-to-end encryption is off" },
    enforce: "server",
  },

  /**
   * The admin desk: reports queue, cosmetics, takedowns.
   *
   * Entitlement first and server-enforced. It is in the registry so the UI
   * can hide it, and marked "server" so nobody mistakes that for the lock —
   * is_admin() in the database is the lock.
   */
  admin: {
    id: "admin",
    needs: ["admin"],
    platforms: {
      androidNative: "unavailable",
      iosNative: "unavailable",
      mobileWeb: "degraded",
    },
    reason: {
      androidNative: "Moderation tools are on the website",
      iosNative: "Moderation tools are on the website",
      mobileWeb: "The admin desk needs a wider screen",
      default: "You don't have access to this",
    },
    enforce: "server",
  },
} as const satisfies Record<string, Feature>;

export type FeatureId = keyof typeof FEATURES;

/** Look one up by id, typed. */
export function feature(id: FeatureId): Feature {
  return FEATURES[id];
}
