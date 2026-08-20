# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Vercro (internally "Grow Smart") — a gardening app shipped as three surfaces from one codebase:
a Next.js **Pages Router** web app, an installable PWA, and native iOS/Android apps via **Capacitor**.
The backend is a **separate service** (the Grow Smart API); this repo contains no server code
beyond the unused `pages/api/hello.js` stub.

## Commands

```bash
npm run dev      # dev server on :3000
npm run build    # next build → static export into out/ (output: 'export')
npm run lint     # eslint (flat config, eslint-config-next core-web-vitals)
```

There is no test suite and no test tooling installed. Don't claim tests pass — verify by running the app.

Native builds (after `npm run build`, which regenerates `out/` — Capacitor's `webDir`):

```bash
npx cap sync ios
npx cap sync android
npx cap open ios
```

App version numbers are bumped by hand: `versionCode`/`versionName` in
[android/app/build.gradle](android/app/build.gradle), and `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`
in the Xcode project.

Deploys go to Vercel. Note `.claude/settings.json` denies `git push`, `vercel deploy`,
`supabase db push`, and other destructive/publishing commands — ask the user to run those.

## Architecture

### One file holds the app

[pages/index.js](pages/index.js) is ~19,000 lines and contains essentially the entire application:
every screen, sheet, modal, hook, design token, and the Konva garden renderer. `pages/_app.js`
only initialises PostHog; `pages/_document.js` only sets PWA meta tags.

Treat `pages/index.js` as the current source of truth. Do not refactor or split it merely as part
of an unrelated feature or visual change. New components/files may be introduced when there is a
clear architectural benefit, but structural refactoring should be deliberate, separately scoped,
and preserve behaviour. Existing code is organised by banner comments (`// ===== SECTION =====`);
follow that convention when working within the file.

Rough map of `index.js` by concern (line numbers drift — grep the function name):

| Region | Contents |
|---|---|
| top | Capacitor native-plugin loaders, `TOUR_STEPS`, tour overlay |
| ~515–760 | Supabase client, `API`, `apiFetch`, `useProStatus`, design tokens `C`/`SEASON` |
| ~800–3000 | Auth, onboarding pieces, harvest/badge/share sheets |
| ~3700–5300 | `Dashboard` (Today tab) and its cards |
| ~5600–9250 | `GardenView`, `CropList`, `AddCrop`, crop sheets |
| ~9400–11000 | Notifications, time away, `ProfileScreen` |
| ~11000–12000 | `PlantCheck`, `ProPaywallSheet` |
| ~12300–14000 | Barcode scanner, feedback, `AdminScreen` and metrics |
| ~14090–18350 | Konva tokens `K`, sprite drawing, `PlanScreen` and planning sheets |
| ~18790+ | `GrowSmart` — the root component: session, tabs, nav, native init |

Styling is **inline style objects** throughout, driven by the `C` token object (which shifts
palette by season via `SEASON`). `styles/globals.css` is near-empty and `Home.module.css` is unused.

### Data flow

All reads/writes go through `apiFetch(path, options)`, which pulls the current Supabase session
and sends the JWT as `Authorization: Bearer`. There is no client-side data cache or state library —
components fetch in `useEffect` and hold their own state. The API base is `NEXT_PUBLIC_API_URL`
(falls back to `http://localhost:3001`).

Supabase is used for **auth only** (`storageKey: "vercro-auth"`); domain data lives behind the API.

### Native integration

Native-only packages must never be resolved at build time, because `next build` runs in a plain
Node environment. The established pattern at the top of `index.js`:

```js
let Purchases = null;
if (typeof window !== "undefined" && window.Capacitor?.isNative) {
  import("@revenuecat/purchases-capacitor").then(m => { Purchases = m.Purchases; });
}
```

`@capacitor-community/in-app-review` uses a runtime `require()` inside a try/catch for the same
reason. Follow whichever pattern the neighbouring code uses.

**Native Apple/Google sign-in spans three layers** and is fragile to refactoring:

1. [public/capacitor-bridge.js](public/capacitor-bridge.js) — loaded via `<Script strategy="beforeInteractive">`,
   deliberately outside the bundler. Exposes `window.vercroStartOAuth`.
2. [lib/capacitor-oauth.js](lib/capacitor-oauth.js) — must stay a top-level import of `index.js`;
   inlining it into a component or conditional gets the `webkit.messageHandlers.startOAuth`
   call tree-shaken away.
3. [ios/App/App/MainViewController.swift](ios/App/App/MainViewController.swift) — registers the
   `startOAuth` WKScriptMessageHandler and runs `ASWebAuthenticationSession`, calling back on
   the `com.vercro.app://` scheme.

### Pro gating and payments

`useProStatus()` returns `{ isPro, isProForDiagnosis, plan, isMark, isTestUser }`. Paywalls are
permanently on (the old `PRO_ENABLED` flag was removed); free users get 3 of each metered feature
(PlantChecks, locations, planting-suggestion boosts, Why Now). Access bypasses are **hardcoded
identity lists** near the top of `index.js` — `MARK_EMAIL`, `TEST_USER_IDS` (App Store review
accounts), `PRO_PREVIEW_USER_IDS`, `PARTNER_ADMIN_IDS`. Admin UI visibility keys off the same
values in `GrowSmart`.

Purchases split by platform: **web → Stripe checkout** (`/subscription/create-checkout`, returning
to `?subscribed=true`), **native → RevenueCat** (separate iOS and Android API keys).

### Analytics

`_app.js` must keep `window.posthog = ph` inside PostHog's `loaded` callback. Every `capture()`
in `index.js` is guarded by `typeof window !== "undefined" && window.posthog`, so dropping that
line silently kills all custom events with no error. Cross-subdomain cookies stitch
vercro.com → app.vercro.com.

### Cache control

Capacitor ships a bundled copy of `out/`, so stale assets have caused real shipped bugs. Both
[next.config.mjs](next.config.mjs) and [vercel.json](vercel.json) mark HTML `no-store` while
allowing long-lived caching of hashed `/_next/static/` assets. Keep those in sync if you touch either.

### Brand

The identity is **`Vercro.`** — the name in Newsreader, followed by an **amber full stop**
(`#D9A441`). The same amber appears as the sun/seed dot above the sprout in the mark. It is
part of the identity and is not omitted from a visual lockup.

Two places hold it, and nothing else may draw it:

- [components/Brand.js](components/Brand.js) — on screen. `<VercroMark>`, `<VercroWordmark>`,
  `<VercroLogo>`, plus canvas helpers (`drawVercroLockup`, `ensureBrandFonts`, `BRAND_FONT`)
  for the share cards.
- [brand/](brand/) — the SVG masters, and `build-icons.mjs`, which generates **every** favicon,
  PWA icon, Apple touch icon, iOS/Android app icon, splash screen, push badge and OG image from
  them. Run `npm run icons`; check with `npm run icons:verify`.

Rules:

- **Never hand-write the amber period.** It lives inside `VercroWordmark` as a real typographic
  `.` with `aria-hidden`, so a screen reader reads the brand as "Vercro". A call site that
  colours its own period will drift the moment the token moves.
- Use `BRAND.amber`, never `C.amber`. They hold the same value today, but `C.amber` is the
  frost/overdue attention colour and may be retuned on its own schedule.
- The mark is **transparent** and not welded to its dark square. `tone` names the surface it
  sits on (`onDark` / `onLight`), not the colour of the artwork. The dark square is an app-icon
  treatment and lives only in `brand/vercro-app-icon.svg`.
- **Prose stays "Vercro"** — no full stop. Page titles, descriptions, alt text, FAQ copy, share
  text and accessible names are prose. Only visual lockups take the dot.
- Sprout/leaf **emoji as brand** are gone. `🌱` is still legitimate content: `getCropEmoji()`'s
  fallback, the Seedling stage, empty states. Never put one next to the name Vercro.
- Don't hand-edit anything under `public/icons/`, `ios/.../Assets.xcassets/` or
  `android/.../mipmap-*`; change a master and regenerate.
- Canvas silently substitutes a fallback for a font that has not loaded — `await
  ensureBrandFonts()` before the first `fillText`. This is how the share cards ended up
  rendering in Georgia.

### Tabs and the guided tour

The `TABS` constant is not what renders — `GrowSmart` builds the bottom nav inline, and
`useNavEnabled()` (hardcoded `true`) selects the five-tab layout including **Plan**, with Feeds
living inside the Crops tab. Admin tabs are appended conditionally.

The walkthrough works by threading a single `tourRefs` object of `useRef`s from `GrowSmart` down
into each tab component; `TOUR_STEPS` entries reference those refs by string key. Adding a tour
step means adding the ref in `GrowSmart`, passing it through, and attaching it to the DOM node.

## Production and UI change rules

Vercro is a live production product with real users across web, iOS and Android. Visual work must
preserve existing behaviour unless Mark explicitly approves a functional change.

Before substantial UI changes:

- inspect the complete current implementation of the affected screen/component
- inventory its existing states, actions, conditional behaviour and platform differences
- distinguish visual changes from behavioural changes
- flag anything in a proposed design that removes, simplifies, invents or conflicts with existing
  functionality

Do not treat a v0 mockup/audit, screenshot or design proposal as implementation truth. It is design
direction. The repository is the source of truth for existing behaviour.

Prefer small, reviewable changes over broad rewrites. Do not opportunistically refactor unrelated
code during visual work.

After substantial frontend changes:

- run `npm run build`
- run `npm run lint` where practical and report pre-existing versus introduced failures
- visually verify affected screens using the Browser tools where possible
- consider web, iOS and Android implications
- report what was changed, what was actually verified, what was not verified, and any manual
  testing still required

Never claim something was tested or verified unless it actually was.

Do not commit, push, deploy, promote, release or change production configuration unless Mark
explicitly asks in the current conversation.

## Conventions

- Path alias `@/*` maps to the repo root (`jsconfig.json`).
- Comments in this codebase document *why*, often citing the bug that motivated the code. Preserve
  them when editing nearby, and write new ones in the same register.
- Dimensions are stored in metres by the backend; display goes through `formatDimension()` with the
  unit from `useMeasurementUnit()` (localStorage).
- Bottom sheets use `useSwipeToDismiss(onClose)`, spread onto the sheet div, not the backdrop.
