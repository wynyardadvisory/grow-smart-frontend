# Vercro — app front end

The Vercro app (internally "Grow Smart"), shipped as three surfaces from one codebase: a
Next.js **Pages Router** web app, an installable PWA, and native iOS/Android apps via
**Capacitor**. The backend is a separate service, the Grow Smart API.

See [CLAUDE.md](CLAUDE.md) for architecture, conventions and the production change rules.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` points at the Grow Smart API (falls back to `http://localhost:3001`).
Auth is Supabase; domain data lives behind the API.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | `next build` → static export into `out/` |
| `npm run lint` | ESLint (flat config, `next/core-web-vitals`) |
| `npm run icons` | Regenerate every platform icon from `brand/` |
| `npm run icons:verify` | Check the generated assets without rebuilding them |

There is no test suite and no test tooling installed. Verify by running the app.

## Native builds

`out/` is Capacitor's `webDir`, so build first:

```bash
npm run build
npx cap sync ios
npx cap sync android
npx cap open ios
```

Version numbers are bumped by hand — `versionCode`/`versionName` in
[android/app/build.gradle](android/app/build.gradle), `MARKETING_VERSION`/
`CURRENT_PROJECT_VERSION` in the Xcode project.

## Brand

The identity lives in [brand/](brand/README.md) (SVG masters + the icon generator) and
[components/Brand.js](components/Brand.js) (on-screen components). Nothing else draws a Vercro
lockup, and nothing else writes the amber full stop. See the Brand section of
[CLAUDE.md](CLAUDE.md) before touching any of it.

## Deploys

Vercel. `.claude/settings.json` denies `git push`, `vercel deploy` and other
publishing/destructive commands — ask Mark to run those.
