/**
 * Reusing a real QA session across smoke runs.
 *
 * Vercro authenticates with Apple / magic link — there is no password to script,
 * and we are not adding one merely for testing. So the QA identity signs in by
 * hand ONCE, and the resulting Supabase session is reused afterwards.
 *
 * The session is a Supabase JWT for the project, not something tied to the site
 * origin, so a session captured on app.vercro.com works just as well against a
 * local dev server. Playwright's own storageState is origin-scoped, which is why
 * the entries are transplanted explicitly rather than handed to newContext().
 *
 * autoRefreshToken is on and Supabase rotates refresh tokens, so every
 * successful run re-persists the refreshed session. Left alone the file would
 * slowly go stale; re-persisting keeps it alive indefinitely while the harness
 * is in regular use.
 *
 * The file lives in .auth/, which is gitignored. Its contents are never printed.
 */
import fs from "fs";
import path from "path";

export const SESSION_FILE = path.join(process.cwd(), ".auth", "qa-session.json");

// Both keys are captured: the client is configured with storageKey
// "vercro-auth", and the SDK also maintains its own sb-<ref>-auth-token.
const AUTH_KEY_RE = /^(vercro-auth|sb-.*-auth-token)$/;

export function hasSession() {
  return fs.existsSync(SESSION_FILE);
}

/** Read the stored entries. Never logged, never returned to the console. */
export function loadSession() {
  if (!hasSession()) return null;
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")); }
  catch { return null; }
}

export function saveSession(entries) {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(entries, null, 0), { mode: 0o600 });
}

/** Pull the auth entries out of a live page's localStorage. */
export async function readAuthEntriesFrom(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src);
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (re.test(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }, AUTH_KEY_RE.source);
}

/** Seed the session into a context before any page script runs. */
export async function injectSession(context, entries) {
  await context.addInitScript((payload) => {
    for (const [k, v] of Object.entries(payload)) {
      try { localStorage.setItem(k, v); } catch {}
    }
  }, entries);
}

/**
 * Is the stored session still usable?
 *
 * Checked by expiry rather than by "did the page look signed in", so an expired
 * session is reported as an expired session instead of being mistaken for a
 * render failure — and so the harness can never quietly grade the signed-out
 * marketing page as a pass.
 */
export function sessionStatus(entries) {
  if (!entries || Object.keys(entries).length === 0) return { ok: false, reason: "no session stored" };
  for (const raw of Object.values(entries)) {
    try {
      const s = JSON.parse(raw);
      const expiresAt = s?.expires_at ?? s?.currentSession?.expires_at;
      if (!expiresAt) continue;
      const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
      // A refresh token is what actually keeps this alive, so an expired access
      // token is fine — the SDK will refresh it on load. Only report age.
      return { ok: true, accessTokenExpired: secondsLeft <= 0, secondsLeft };
    } catch { /* keep looking */ }
  }
  return { ok: true, accessTokenExpired: null, secondsLeft: null };
}

export const REAUTH_MESSAGE = [
  "",
  "  The stored QA session is no longer valid.",
  "  Re-authenticate once:",
  "",
  "      node e2e/capture-session.mjs",
  "",
  "  A browser opens at app.vercro.com — sign in as the QA identity with Apple",
  "  or a magic link. The session is saved to .auth/qa-session.json (gitignored)",
  "  and reused by every later run.",
  "",
].join("\n");
