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
| `src/components/feed/useAdSlots.ts` | `useAdFill` and `useAdSlots`, shared by both feeds |
| `src/components/feed/FeedList.tsx` | Home feed — every tab, one lane each |
| `src/components/shots/ShotAdCard.tsx` | The full-screen card in the Shots reel |
| `src/components/shots/ReelsFeed.tsx` | Splices ads into the reel |
| `src/lib/ads-server.ts` | Country and age, resolved on the server |

Tests: `tests/feed-mix.test.ts`, `tests/ads.test.ts`, `tests/adsense.test.ts`,
`tests/ad-slots-hook.test.ts`.

## Where ads appear

| Surface | Cadence | Notes |
|---|---|---|
| Home feed, every tab | First after post 5, then every 8, at most 2 per page | Each tab keeps its own placements. For You also keeps 2 slots clear of every Shot |
| Shots reel (`/shots`, `/shots/[id]`) | First after shot 4, then every 7, up to 6 per load | A full-screen card; the ad sits in a box with swipe room above and below |

Both share one session budget of 8 impressions (`AD_SESSION_BUDGET`), spent on
impression rather than placement.

**New ads only ever land in content that just loaded.** Each pass is capped, so
after a long first page the cursor can stop well short of the end; without a
floor, the next page would put an ad above the reader in the feed, or in front
of the video they are watching in Shots. `extendAdLane` in `feed-mix.ts` is
where that rule lives.

**A Shots ad never covers the screen.** A touch that starts inside the ad's
iframe belongs to Google's document and never reaches the reel's swipe
handler, so a full-screen creative would be a screen you could only tap your
way out of. The margins are where the swipe lives. Covering the creative with
a transparent layer instead would make it unclickable, and ads under overlays
are against AdSense policy.

**Units are requested late.** A feed card asks for its ad about one screen
before it scrolls into view; a Shots card asks when it is one swipe away. Both
keep the unit once requested.

---

## Step 1 — The front door — DONE

The wall used to stand at `/`, which made the whole site look like it did not
exist: a reviewer arrived, met a code field, and left.

It now stands at `/signin` and `/signup` instead, so joining still needs a
code while `/`, `/onboarding` and `/explore` are public. `APP_INVITE_CODE`
stays set — it guards a different door, not the whole building. See
`OPEN_PATHS` in `src/lib/invite-gate.ts`.

Note that this had to be the same for everyone. Letting a crawler past a wall
humans still meet is cloaking, which carries a site-level penalty — and it
would not work anyway, since a review is a person opening the URL in a browser.

## Step 2 — Let Google find the content

Done in code, in **both** repos — `robots.ts` and `sitemap.ts` in each. The
app's sitemap lists real content; the landing site's is nearly a formality, and
the two are joined by the Explore link in the landing nav, which is how a
crawler travels between them.

`/explore` is the piece that makes any of it reachable. Public profiles, posts
and shots were always openable by link, but nothing led to them, so the front
door opened onto a sign-up form.

1. Google Search Console → add `hypefy.chat` as a property (and
   `app.hypefy.chat` separately if you want its numbers).
2. Verify it.
3. Sitemaps → submit `sitemap.xml` for each.

The sitemap lists public profiles, posts and shots. It is read as `anon`, so
private profiles, suspended accounts and removed posts are excluded by RLS
rather than by a filter that has to be maintained.

**Expect this to be the hard part.** Google's most common rejection is
insufficient content, and a new social app is squarely in that zone. Reapplying
after more posts exist is normal, not a sign anything is broken.

## Step 3 — Apply to AdSense

**The site is `hypefy.chat`, not `app.hypefy.chat`.** AdSense verifies a site
and covers the subdomains under it, so proving the root domain is what lets ads
run on the app. It will not accept the subdomain on its own.

1. adsense.google.com → Sites → `hypefy.chat`.
2. Verification method: **meta tag**, not the code snippet. The tag is already
   served by the landing site's `layout.tsx`; the snippet is the Auto ads tag
   and is deliberately absent.
3. Request review. Days to weeks; the account reads *Getting ready* until
   *Ready*.

**`hypefy.chat` is the domain being judged**, and it is a one-page waitlist
site. That is the weakest part of this whole plan. The Explore links give the
crawler a route into real content, but a thin-content decline is the likely
outcome of a first attempt, and the fix is real pages on the landing site.

Publisher id: `pub-8956774728473034` → the tag needs `ca-pub-8956774728473034`,
but `src/lib/ads.ts` accepts either spelling, so paste whichever you have.

**Do not enable Auto ads.** Auto ads is Google placing ads wherever it decides
— anchor bars, side rails, full-screen vignettes. It would layer its own
placements on top of the feed card and undo the whole point of this work.

## Step 4 — Create the ad unit

**A Display unit is enough.** AdSense → Ads → By ad unit → **Display**. Copy
the `data-ad-slot`. That is the whole step.

An In-feed unit is slightly better and entirely optional. Its builder wants to
scan a live page and copy the style of a real feed, and it answers
*"We couldn't find any feed page on this site"* when it cannot — which it
cannot here, because the feed is behind a login. The way past that is the
**manual** tab in the unit builder ("Build your own" rather than "Let Google
suggest a style"), not a different URL.

It is optional because the card already is the native styling: the chrome, the
"Sponsored" label, the reserved height and the house fallback are all ours. All
a layout key ever contributed was fonts and colours inside a box we frame
anyway. Set `NEXT_PUBLIC_ADSENSE_FEED_LAYOUT_KEY` if you have one and the slot
renders as In-feed; leave it empty and the same slot renders as Display.

If you do build one manually, match the card:

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

**Real ads only ever load on `app.hypefy.chat`, `hypefy.chat` and
`www.hypefy.chat`.** Every other origin — localhost, a Vercel preview, a branch
deploy, a tunnel — gets the house card whatever the configuration says. See
`SERVING_HOSTS` in `src/lib/ads.ts`.

That guard exists because the flag below did not hold. Serving locally once
with `NEXT_PUBLIC_ADS_TEST=1`, the request that actually reached Google carried
no `adtest` parameter — so it was a real request, not a test one. It went
unfilled and nothing was counted, but an unexplained gap in the one control
between a developer's machine and billable impressions is not a control.

`NEXT_PUBLIC_ADS_TEST=1` is still worth setting; it is now a second layer
rather than the only one. It sets `data-adtest="on"`, which asks Google for
creatives that are served and rendered for real but never counted or paid.

Restart the dev server. **Next reads `.env.local` only at boot**; editing it
under a running server silently does nothing.

In Vercel, set the same four in **Production only**, and leave
`NEXT_PUBLIC_ADS_TEST` unset there.

The client and the slot are required together — missing either and `adMode()`
returns `off`, because a half-configured deploy is a mistake rather than an
instruction. The layout key is optional; see step 4.

## Step 6 — Verify

**Serving can only be verified on the live site**, by the origin guard above.
Locally you are verifying placement and the house card, which is most of it.

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

- **Android revenue.** Nothing until an AdMob Native Advanced bridge exists: a
  Kotlin plugin that loads a `NativeAd`, passes the creative fields into the
  WebView, and registers impressions and clicks natively. The card is already
  built; only the filler would change.
- **A CMP**, if EEA readers ever matter.
- **The private-profile filter in the sitemap is untested by data** — there are
  currently no private or suspended accounts, so nothing has been excluded yet.
