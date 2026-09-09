# Ads in the feed — setup and operation

Everything in the codebase is built and tested. What is left is account work in
Google's interfaces and four environment variables. This is that, in order.

Nothing here switches on by accident: with no configuration, no ad slot is
placed, no third-party script loads, and no connection to Google is opened.

---

## Where the code lives

| File | What it does |
|---|---|
| `src/lib/feed-mix.ts` | `placeAds` decides where slots go; `spliceFeed` builds the render list |
| `src/lib/ads.ts` | The gate. Mode, region, age, native, session budget |
| `src/lib/adsense.ts` | Loads Google's script, once |
| `src/components/feed/AdFeedCard.tsx` | The card — a post's exact chrome |
| `src/components/feed/AdSenseUnit.tsx` | The `<ins>` and its lifecycle |
| `src/components/feed/HouseSponsoredCard.tsx` | What fills the card when Google doesn't |
| `src/components/feed/FeedList.tsx` | Placement effect and the render arm |

Tests: `tests/feed-mix.test.ts`, `tests/ads.test.ts`, `tests/adsense.test.ts`.

---

## Step 1 — Take the invite wall down

**This is the blocker, and it is not a code change.** AdSense reviews a site by
visiting it. `app.hypefy.chat/` currently serves "Invite only", so a reviewer
sees a form and declines for "site unavailable" or "no content" — the open
deep links never come into it.

1. Vercel → the project → Settings → Environment Variables → Production.
2. Delete `APP_INVITE_CODE`. (`INVITE_COOKIE_SECRET` can stay; it does nothing
   on its own.)
3. Redeploy.
4. Confirm `https://app.hypefy.chat/` no longer shows the code field.

`isGateDisabled()` in `src/lib/invite-gate.ts` returns true when that variable
is unset, and every request then passes straight through.

**Putting the wall back after approval does not work.** AdSense re-crawls
continuously, and a site that becomes a login wall has ads disabled for it with
"site down or unavailable". Treat this step as one-way for as long as ads run.

## Step 2 — Let Google find the content

Already done in code — `src/app/robots.ts` and `src/app/sitemap.ts`. After
step 1:

1. Google Search Console → add `app.hypefy.chat` as a property.
2. Verify it (the DNS or HTML-tag method; Vercel makes the DNS one easy).
3. Sitemaps → submit `sitemap.xml`.

The sitemap lists public profiles, posts and shots. It is read as `anon`, so
private profiles, suspended accounts and removed posts are excluded by RLS
rather than by a filter that has to be maintained.

**Expect this to be the hard part.** Google's most common rejection is
insufficient content, and a new social app is squarely in that zone. Reapplying
after more posts exist is normal, not a sign anything is broken.

## Step 3 — Apply to AdSense

1. Sign up at adsense.google.com and add `app.hypefy.chat` as a site.
2. Paste the verification snippet where AdSense asks — or skip it, because
   `AdSenseUnit` already loads the same script from your publisher id once a
   unit renders.
3. Wait. Days to weeks. The account shows *Getting ready* until it is *Ready*.

Publisher id: `pub-8956774728473034` → the tag needs `ca-pub-8956774728473034`,
but `src/lib/ads.ts` accepts either spelling, so paste whichever you have.

**Do not enable Auto ads.** Auto ads is Google placing ads wherever it decides
— anchor bars, side rails, full-screen vignettes. It would layer its own
placements on top of the feed card and undo the whole point of this work.

## Step 4 — Create the in-feed unit

AdSense → Ads → By ad unit → **In-feed**. Not Display, not In-article, not
Auto: In-feed is the only one that produces a layout key.

Use the manual layout builder and match the card:

- Image **above** the text
- Roughly 1.91:1 image
- Height around 320px — `AD_RESERVED_PX` in `src/lib/ads.ts`

Save, and copy the two values from the generated snippet:

- `data-ad-slot` → a 10-digit number
- `data-ad-layout-key` → looks like `-fb+5w+4e-db+86`

## Step 5 — Configure

Locally, in `.env.local`:

```
NEXT_PUBLIC_ADS_MODE=adsense
NEXT_PUBLIC_ADSENSE_CLIENT=pub-8956774728473034
NEXT_PUBLIC_ADSENSE_FEED_SLOT=<the 10-digit slot>
NEXT_PUBLIC_ADSENSE_FEED_LAYOUT_KEY=<the layout key>
NEXT_PUBLIC_ADS_TEST=1
```

**`NEXT_PUBLIC_ADS_TEST=1` is not optional outside Production.** It sets
`data-adtest="on"`, so creatives are requested, served and rendered for real
but never counted or paid. Without it, every page you or the E2E suite loads
is a real impression from your own machine — invalid traffic, and the fastest
way to lose the account.

Restart the dev server. **Next reads `.env.local` only at boot**; editing it
under a running server silently does nothing.

In Vercel, set the same four in **Production only**, and leave
`NEXT_PUBLIC_ADS_TEST` unset there.

All three ids are required together. Missing one and `adMode()` returns `off`
— a half-configured deploy is a mistake, not an instruction.

## Step 6 — Verify

With `NEXT_PUBLIC_ADS_TEST=1`:

1. Sign in and scroll the For You feed.
2. An ad card should appear around the 5th post, never adjacent to a Shot,
   never as the last card, at most 2 per page.
3. `document.querySelectorAll('[data-ad-card]')` finds them;
   `data-ad-fill` reads `adsense` or `house`.
4. Network: one request to `pagead2.googlesyndication.com`, however many slots.
5. Block ads in the browser and reload — the card must show the Hypefy promo
   at the same height, not collapse and not leave an empty frame.

Then in the Android app: build the WebView shell and confirm **no** `pagead2`
request is made and the house card renders. `isNative()` is what stops it, and
it is only truthful after mount.

---

## What is deliberately not served

Slots are still placed for these readers — the card just carries a Hypefy
promo instead, because an empty slot would leave a hole where the placement
rules put a card.

| Reader | Why |
|---|---|
| Inside the Android app | `capacitor.config.ts` points the Play Store app at the live site, so a web tag there is a tag inside the app. That is AdMob's territory, not AdSense's |
| EEA, UK, Switzerland | No consent management platform exists in this app |
| Unknown country | Read as EEA. A header that did not arrive is not evidence of anything |

Personalisation is separate: ads are personalised only for a reader confirmed
18+ from a date of birth on file. Everyone else — including every OAuth account
that never passed `/age-check` — gets non-personalised ads via
`data-tag-for-under-age-of-consent`.

## Still open

- **`ads.txt`.** Google reads it from the root domain, and `hypefy.chat` is a
  separate project from this repo. Without it you get unauthorised-inventory
  warnings and suppressed bidding.
- **Android revenue.** Nothing until an AdMob Native Advanced bridge exists: a
  Kotlin plugin that loads a `NativeAd`, passes the creative fields into the
  WebView, and registers impressions and clicks natively. The card is already
  built; only the filler would change.
- **A CMP**, if EEA readers ever matter.
- **The private-profile filter in the sitemap is untested by data** — there are
  currently no private or suspended accounts, so nothing has been excluded yet.
