/**
 * Vercro — frontend pre-production smoke gate.
 *
 * WHY THIS EXISTS
 *
 * On 21 August 2026 a `useState` was added below three early returns in
 * Dashboard. The hook count differed between the first and second render, React
 * threw error #310, and every user saw "Application error: a client-side
 * exception has occurred". `next build` passed. `eslint` was unchanged. The
 * change was "verified" by reading an API response instead of loading the page.
 *
 * A successful build is not permission to deploy. This gate makes that true:
 * it signs in as a real user and renders every tab in a real browser, failing
 * on any uncaught exception, error boundary or unexpected console error.
 *
 * CREDENTIALS
 *
 * Supplied ONLY through the environment — never in this file, never committed,
 * never printed. .env* is already gitignored. The account must be an ordinary
 * QA account with no admin rights, never a personal login.
 *
 * Vercro signs in with Apple / magic link, so there is no password to script and
 * none is being added for testing. A dedicated QA identity signs in by hand once
 * via e2e/capture-session.mjs; the session is stored in .auth/ (gitignored) and
 * reused here. Nothing token-shaped is ever printed.
 *
 * Run:  node e2e/smoke.mjs [baseURL]
 */
import { chromium } from "playwright";
import { loadSession, saveSession, injectSession, readAuthEntriesFrom,
         sessionStatus, REAUTH_MESSAGE } from "./session.mjs";

const BASE = process.argv[2] || process.env.VERCRO_BASE_URL || "http://localhost:3100";
const TABS = ["Today", "Garden", "Plan", "Crops", "Profile"];

// Vercro signs in with Apple / magic link, so there is no password to script.
// A QA identity signs in by hand once (node e2e/capture-session.mjs) and the
// session is reused here.
const session = loadSession();
const status = sessionStatus(session);
if (!status.ok) { console.error(REAUTH_MESSAGE); process.exit(2); }

// Pre-existing console noise. Anything not listed here is treated as a regression.
const IGNORE = [
  /Download the React DevTools/i, /\[Fast Refresh\]/i, /\[HMR\]/i,
  /PostHog/i, /validateDOMNesting/i,
  /Failed to load resource.*(favicon|og-image|manifest|icons|apple-touch)/i,
  /viewport meta tags should not be used/i,
];

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// Nothing token-shaped may reach stdout, even inside an error string.
const scrub = (s) => String(s || "")
  .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "<jwt>")
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>");

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  const pageErrors = [], consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(scrub(String(e.message).split("\n")[0]).slice(0, 140)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!IGNORE.some((re) => re.test(t))) consoleErrors.push(scrub(t).slice(0, 140));
  });

  const bodyText = () => page.evaluate(() => document.body.innerText);
  const broken = (t) => /Application error|client-side exception|Something went wrong|Minified React error/i.test(t);

  // ── 1 · boot ──────────────────────────────────────────────────────────────
  const resp = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  record("app boots", resp?.ok() === true, `HTTP ${resp?.status()}`);

  // ── 2 · restore the QA session ────────────────────────────────────────────
  // Seeded into localStorage before any page script runs. The Supabase session
  // is a project JWT rather than something bound to the site origin, so a
  // session captured on app.vercro.com works against a local dev server too —
  // Playwright's storageState is origin-scoped, hence transplanting explicitly.
  await injectSession(ctx, session);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });

  // ── 3 · the transition that broke production ──────────────────────────────
  let reachedToday = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const t = await bodyText();
    if (broken(t)) break;
    if (/Good (morning|afternoon|evening)/i.test(t)) { reachedToday = true; break; }
  }
  const afterLogin = await bodyText();
  if (!reachedToday && !broken(afterLogin)) {
    // Signed-out UI rendered fine — that is an expired session, not a defect.
    // Reported separately so the harness can never grade the marketing page as
    // a pass, and never blame the code for an auth problem.
    console.error("\n  Reached the signed-out app: the stored QA session has expired.");
    console.error(REAUTH_MESSAGE);
    await browser.close();
    process.exit(2);
  }
  record("QA session reaches authenticated Today", reachedToday, reachedToday ? "" : scrub(afterLogin).slice(0, 100));
  record("no React hooks/#310 error through loading→data transition", !broken(afterLogin),
    broken(afterLogin) ? scrub(afterLogin).slice(0, 120) : "");

  // ── 4 · the surface changed by this batch (3B4) ───────────────────────────
  const hasCard = /One quick question/i.test(afterLogin);
  record("3B4 reconciliation card present", hasCard, hasCard ? "" : "no unresolved crop for this account (not a failure of the gate)");
  if (hasCard) {
    const outcomes = await page.evaluate(() =>
      [...document.querySelectorAll("button")].map((b) => b.innerText.trim())
        .filter((l) => ["Still growing","I harvested it","Cleared it","It didn't work out","Not sure"].includes(l)));
    record("3B4 outcomes visible and interactable", outcomes.length >= 4, outcomes.join(" / "));
  }

  // ── 5 · every tab renders ─────────────────────────────────────────────────
  for (const tab of TABS) {
    // Clicked through the DOM rather than a Playwright locator. The bottom nav
    // is fixed-position and `button:text-is(...)` reports it as not visible, so
    // this loop was recording four false FAILs on a healthy app — and a gate
    // that cries wolf is a gate nobody reads. Matched on endsWith so an icon
    // above the label does not break it.
    const clicked = await page.evaluate((name) => {
      const b = [...document.querySelectorAll("button")]
        .filter(x => x.innerText.trim().replace(/\s+/g, " ").endsWith(name)).pop();
      if (!b) return false;
      b.click(); return true;
    }, tab);
    if (!clicked) { record(`${tab} renders`, false, "nav button not found"); continue; }
    await page.waitForTimeout(3000);
    const t = await bodyText();
    record(`${tab} renders`, !broken(t) && t.length > 80, broken(t) ? "error boundary" : `${t.length} chars`);
  }

  // ── 5b · and back to Today ────────────────────────────────────────────────
  // Leaving a tab and returning is where state that was never scoped to its own
  // component shows up. The tab loop alone would miss it.
  {
    const back = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")]
        .filter(x => x.innerText.trim().replace(/\s+/g, " ").endsWith("Today")).pop();
      if (!b) return false;
      b.click(); return true;
    });
    if (!back) record("returns to Today", false, "nav button not found");
    else {
      await page.waitForTimeout(3000);
      const t = await bodyText();
      record("returns to Today", !broken(t) && /Good (morning|afternoon|evening)/i.test(t),
        broken(t) ? "error boundary" : `${t.length} chars`);
    }
  }

  // ── 6 · nothing threw ─────────────────────────────────────────────────────
  record("no uncaught page exceptions", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  record("no unexpected console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

  // Supabase rotates refresh tokens, so store the refreshed session. Left alone
  // the saved file would slowly go stale and force needless manual re-auth.
  try {
    const refreshed = await readAuthEntriesFrom(page);
    if (Object.keys(refreshed).length) saveSession(refreshed);
  } catch { /* never fail the gate over housekeeping */ }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log("FAILED:\n" + failed.map((f) => `  · ${f.name} ${f.detail}`).join("\n")); process.exit(1); }
  console.log("SMOKE GATE PASSED");
}
main().catch((e) => { console.error("harness error:", scrub(e?.message)); process.exit(1); });
