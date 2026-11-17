# @hypefy/mobile

The React Native client. Shares logic with the web through `@hypefy/core` and
`@hypefy/tokens`; shares no UI, deliberately.

## What works, and what has not been run

Everything here typechecks under TypeScript 6 and **bundles** — Metro resolves
the workspace packages and the font assets. Nothing in it has run on a device
or in an emulator, because this machine has neither, and no EAS build has been
made because that needs an Expo login.

So treat the list below as "built and bundled", not "working":

- `app/_layout.tsx` — safe areas, dark status bar, holds the splash until the
  fonts load, and carries on without them if they fail.
- `app/index.tsx` — reads the stored session and says what it found. This is
  the screen that answers Phase 5's acceptance criterion.
- `src/session-store.ts` — the Keychain/Keystore binding, over the chunking in
  `@hypefy/core/chunked-store`.
- `src/theme.ts` — the web's tokens as React Native styles.

## First run

```bash
npm install                       # from the repo root
cd apps/mobile
EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... npx expo start
```

The client throws at startup without those two, on purpose — the alternative
is an opaque network error on the first request.

## Config for an EAS build

`eas.json` carries both values in every build profile's `env`, so a cloud
build needs nothing set up by hand. That failure is otherwise expensive: the
app installs, then dies on launch, and finding out costs a whole EAS round
trip. `tests/mobile-foundation.test.ts` ties the two together — whatever the
source reads from `EXPO_PUBLIC_*`, every profile must supply — and refuses a
profile carrying anything server-only.

Putting the anon key in the repo is deliberate, not an oversight. It is
public by design and bounded by RLS; the web already inlines the same string
into every page it serves. The service-role key bypasses RLS and must never
appear here — the test asserts that too.

## Why there is no NativeWind

Tailwind 4 support exists only in NativeWind v5, which is a release candidate,
and the stable line targets Tailwind 3 while the web is on 4. But the deciding
reason is architectural: this project shares logic and deliberately shares no
UI, so NativeWind would buy shared class names between two codebases that are
not shared — in exchange for a second Tailwind, an RC dependency and a CSS
pipeline inside Metro. `@hypefy/tokens` already carries the values and is
asserted against `globals.css` in both directions.

## Known gaps

**Three font files.** The web loads Plus Jakarta Sans as a variable face;
React Native wants one file per weight. The repo has ExtraBold and Medium
(they are there for satori's OpenGraph card), so the six weights the web uses
collapse onto two here — 400 and 500 are right, 600 and 700 render at 800.
Adding `PlusJakartaSans-Regular`, `-SemiBold` and `-Bold` to `assets/fonts`
and listing them in `src/fonts.ts` fans it out with no other change.

**No key-value store.** `@hypefy/core`'s `Kv` interface is not installed here.
It has to be synchronous — three of its consumers return a stored value
straight out of a non-async function — which means MMKV, which needs
`react-native-nitro-modules` and a native build. No consumer of it exists in
this app yet, so `absentKv` applies: anything reading it gets nothing, visibly,
rather than appearing to work and losing data. MMKV goes in with the first
screen that needs it.

**One screen.** No navigation to speak of, no feed, no sign-in form. Phase 6.
