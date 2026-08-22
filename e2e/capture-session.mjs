/**
 * One-time QA login capture.
 *
 * Vercro signs in with Apple or a magic link. Neither can be scripted, and we
 * are not adding password auth purely for testing. So this opens a real browser,
 * waits for a human to sign in as the QA identity, and saves the resulting
 * Supabase session for later runs.
 *
 * Run:  node e2e/capture-session.mjs
 *
 * Nothing about the session is printed. It is written to .auth/qa-session.json,
 * which is gitignored, with 0600 permissions.
 */
import { chromium } from "playwright";
import { readAuthEntriesFrom, saveSession, SESSION_FILE } from "./session.mjs";

const TARGET = process.argv[2] || "https://app.vercro.com";
const TIMEOUT_MIN = 10;

console.log(`
  Opening ${TARGET} in a browser window.

  Sign in as the DEDICATED QA IDENTITY — not a personal account, and not an
  admin. Apple or magic link, whichever you normally use.

  Waiting up to ${TIMEOUT_MIN} minutes. The window closes by itself once the
  session is captured.
`);

const browser = await chromium.launch({ headless: false, args: ["--window-size=460,940"] });
const context = await browser.newContext({ viewport: { width: 420, height: 880 } });
const page = await context.newPage();
await page.goto(TARGET, { waitUntil: "domcontentloaded" });

const deadline = Date.now() + TIMEOUT_MIN * 60_000;
let entries = null;

while (Date.now() < deadline) {
  await page.waitForTimeout(2000);
  // Signed in = the app is showing its authenticated greeting AND a session
  // exists in storage. Both, so a half-finished OAuth round trip is not
  // mistaken for success.
  let signedIn = false;
  try {
    signedIn = await page.evaluate(() =>
      /Good (morning|afternoon|evening)/i.test(document.body.innerText));
  } catch { /* mid-navigation */ }
  if (!signedIn) continue;

  const found = await readAuthEntriesFrom(page);
  if (Object.keys(found).length) { entries = found; break; }
}

await browser.close();

if (!entries) {
  console.error("\n  No session captured — sign-in did not complete in time. Nothing was written.\n");
  process.exit(1);
}

saveSession(entries);
console.log(`
  Session captured for ${Object.keys(entries).length} storage key(s).
  Saved to ${SESSION_FILE.replace(process.cwd(), ".")} (gitignored, chmod 600).

  Now run the gate:
      node e2e/smoke.mjs                      # local dev on :3100
      node e2e/smoke.mjs https://app.vercro.com
`);
