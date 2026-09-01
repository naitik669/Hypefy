# Hypefy native apps (Capacitor)

Hypefy ships to Google Play and the App Store as a Capacitor shell that loads
the live site (`https://app.hypefy.chat`). The app is server-rendered, so it
cannot be a static bundle — `capacitor.config.ts` uses `server.url` to point the
native WebView at production. Auth already builds redirects from
`window.location.origin`, so sessions resolve against the prod origin unchanged.

## What's scaffolded (C1 — done)
- Capacitor 8 + plugins: `app`, `push-notifications`, `splash-screen`,
  `status-bar`, `haptics`.
- `capacitor.config.ts` (appId `chat.hypefy.app`, `server.url`).
- `resources/` icon + splash sources (1024 icon, adaptive fg/bg, 2732 splash).
- `android/` platform generated, icons/splash applied, permissions + OAuth
  deep-link intent-filter configured.

## Commands
```bash
npm run cap:sync       # sync config + plugins into native projects
npm run cap:assets     # regenerate icons/splash from resources/
npm run cap:android    # open Android Studio
npm run cap:ios        # open Xcode (macOS only)
```

## Android build (needs Android Studio + JDK 17)
1. `npm run cap:sync`
2. `npm run cap:android`, then Build → Generate Signed Bundle (AAB) for Play.
3. First run downloads Gradle dependencies.

## iOS — must be added on a Mac
`@capacitor/ios` is installed but the `ios/` project was not generated here
(Windows). On a Mac:
```bash
npx cap add ios
npm run cap:assets       # generates iOS icons/splash
npx cap sync ios
npm run cap:ios          # open Xcode
```
Then add these **Info.plist** usage strings (required by the WebRTC calls,
Shows/live camera, and voice notes — the app is rejected without them):
- `NSCameraUsageDescription` — "Hypefy uses the camera for video calls, Shots, and Shows."
- `NSMicrophoneUsageDescription` — "Hypefy uses the microphone for calls and voice notes."
- `NSPhotoLibraryUsageDescription` — "Hypefy needs photo access to upload media."
Add the OAuth custom-scheme (`chat.hypefy`) under URL Types, and enable the Push
Notifications + Associated Domains capabilities.

## Remaining phases (gated on Naitik's accounts/services)

### C2 — OAuth deep-linking
Google blocks OAuth inside raw WebViews. When running in Capacitor, set
`signInWithOAuth` / email `redirectTo` to `chat.hypefy://auth/callback`, listen
for `appUrlOpen` via `@capacitor/app`, and call `exchangeCodeForSession`.
Register the scheme + an https App Link in the Supabase Auth allow-list and the
Google Cloud OAuth client. (Android intent-filter is already in the manifest;
https App Links also need `assetlinks.json` served from the domain.)

### C3 — Native push (FCM + APNs)
Web Push/VAPID does not deliver to a wrapped iOS app. Register the device token
with `@capacitor/push-notifications`, store it in a new `push_devices`
(platform, token, user) table, and extend `POST /api/push` to send via FCM
(Android) and APNs (iOS). Needs an FCM project + `google-services.json` and an
APNs auth key. Keep web-push for installed-PWA users.

### C4 — Calls on mobile networks
WebRTC needs a TURN server for cellular/symmetric-NAT. The code already reads
`NEXT_PUBLIC_TURN_URLS` / `_USERNAME` / `_CREDENTIAL` — point them at a TURN
provider before calls are reliable on mobile data.

## Store submission (needs accounts)
Google Play Console ($25) and Apple Developer ($99/yr), app signing keys, store
listings, screenshots, data-safety / privacy labels (see `/privacy`), and age
rating (the signup age gate + Community Guidelines support this).
