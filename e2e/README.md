# Frontend pre-production gate

**Every customer-facing frontend change must pass this before production.**

## Why this exists

On 21 August 2026 a `useState` was added below three early returns in
`Dashboard`. The hook count differed between the first and second render, React
threw error #310, and every user saw *"Application error: a client-side
exception has occurred"*.

`next build` passed. `eslint` was unchanged at its baseline. The change was
verified by reading an API response instead of loading the page.

**A successful build is not permission to deploy.** A build proves the bundle
compiles; it proves nothing about what a browser does with it. React #310 is a
runtime error that only appears on the second render of one component.

## The gate

```
code
 → npm run build            (compiles)
 → npx eslint pages/…       (no new problems vs baseline)
 → npm test                 (API repo: unit + integration)
 → npx next dev -p 3100
 → node e2e/smoke.mjs       ← renders in a real browser, signed in
 → deploy to production
 → node e2e/smoke.mjs https://app.vercro.com
```

## QA identity and session

Vercro signs in with **Apple or a magic link**. Neither can be scripted, and no
password authentication is being added to the product for testing.

So the QA identity signs in **by hand once**, and the session is reused:

```bash
node e2e/capture-session.mjs      # opens a browser, you sign in, session saved
node e2e/smoke.mjs                # every run after that is automatic
```

The session lands in `.auth/qa-session.json` — gitignored, `chmod 600`, never
printed, never committed, never included in a report. The harness also scrubs
anything JWT- or email-shaped out of its own output, so a failing assertion
cannot leak it into a log.

**Use a dedicated ordinary QA identity.** Not a personal login, not an admin.

### Why the session survives

The stored value is a Supabase session for the project, not something bound to
the site origin — so a session captured on `app.vercro.com` works against a
local dev server too. Playwright's own `storageState` is origin-scoped, which is
why the entries are transplanted explicitly rather than passed to `newContext()`.

`autoRefreshToken` is on and Supabase rotates refresh tokens, so **every
successful run re-persists the refreshed session**. Left alone the file would
slowly go stale; re-persisting keeps it usable indefinitely while the gate is in
regular use.

### When it expires

The harness distinguishes an expired session from a broken build. If the
signed-out app renders cleanly, that is reported as **expired session, exit 2**
with re-auth instructions — never graded as a pass, and never blamed on the code.
That distinction matters: silently testing signed-out UI is how a gate gives
false confidence.

### The account needs data

At least one crop, so Today has something to render. For the 3B4 assertions to
be exercised it also needs an **unresolved crop** — active, 22–180 days past its
expected harvest, with no observation recorded.

## What it checks

| Check | Catches |
|---|---|
| Restores a real QA session | Auth regressions; and it drives the **loading → authenticated data** transition, which is exactly where #310 lived. A seeded session skips that transition and would have missed the outage |
| No error boundary | React #310 and every other fatal render error |
| No uncaught page exception | Thrown errors that do not reach a boundary |
| No unexpected console error | Regressions below the fatal threshold |
| Today / Garden / Plan / Crops / Profile all render | A change breaking a tab other than the one being worked on |
| Current changed surface exercised explicitly | The generic suite alone is not enough — each batch adds its own assertion |

Known pre-existing console noise is filtered by an explicit allowlist. Anything
not on that list is treated as a regression, so the list should shrink over time
rather than grow.

## Running the app locally

```bash
npx next dev -p 3100
```

Port 3100 deliberately, not 3000: `vercro-landing` also runs on 3000, and an
earlier run of this gate silently tested the landing site for several rounds
before that was noticed.

## Environment limitations, recorded

Vercel **Preview deployments cannot currently run this suite**:
`grow-smart-frontend` has SSO protection enabled for `all_except_custom_domains`,
so preview URLs are gated and Playwright cannot reach them.

**Follow-up (not done):** configure Vercel *Protection Bypass for Automation* on
`grow-smart-frontend` so the same suite can run against Preview. Do **not**
disable SSO protection globally to achieve this.

`grow-smart-frontend-staging` is reachable but points at `grow-smart-api-staging`,
which is behind main and backed by a **separate** Supabase project — it rejects
production tokens and lacks recent routes. Bringing it to parity is not worth
doing for this gate; localhost with a real login is the better trade today.
