// ─────────────────────────────────────────────────────────────────────────────
// Analytics layer
//
// Why this file exists at all:
//
// Commit 660440e (5 Jun 2026, "Fix: watering tasks no longer trigger all-done
// state prematurely") deleted 1,779 lines and took the entire PostHog
// instrumentation with it — `import posthog` plus every capture call. Nobody
// noticed for 74 days, because a missing capture throws no error; the event
// simply never arrives. Centralising tracking here means the next accidental
// deletion is one obvious import, not twenty scattered call sites.
//
// Two hazards this module exists to defend against, both observed in real data:
//
// 1. BULK FIRE. The old code captured inside completeTask() and logObservation(),
//    both of which are called in a loop by the Today alert group handlers
//    (`group.forEach(x => completeTask(x))`). One tap on a frost-protect alert
//    covering 231 crops produced 231 `task_completed` events — PostHog recorded
//    up to 231/user/minute for `protect` and 62/user/minute for pest
//    `observation_logged`, inflating historical task volume roughly 3x. Events
//    must describe the USER ACTION, not the records it touched: one gesture,
//    one event, carrying `count`. Callers that loop pass `{ track: false }` and
//    the click handler emits a single aggregate event.
//
// 2. LOST-AT-MOUNT. React runs child effects before parent effects, so
//    GrowSmart's mount effects run BEFORE _app.js's useEffect calls
//    posthog.init(). Anything captured at mount (session_started, the first
//    screen_viewed) would hit an undefined window.posthog and vanish. track()
//    therefore queues until PostHog exists; _app.js calls flushAnalytics() from
//    the `loaded` callback.
// ─────────────────────────────────────────────────────────────────────────────

// Canonical event names. Import these rather than typing string literals — a
// typo'd event name creates a brand new event in PostHog with no error.
export const EVENTS = Object.freeze({
  // Authoritative app-open metric — the denominator for DAU/WAU/MAU and for
  // opening-frequency analysis. See trackAppOpened() for the exact semantics.
  APP_OPENED:                "app_opened",
  // NOT the app-open metric. session_started fires on Supabase's SIGNED_IN,
  // which is an AUTHENTICATION event: it does not fire when an already-signed-in
  // user reopens or reloads the app, and it can fire more than once for one
  // person via token refresh. Kept unchanged for continuity with the pre-June
  // data; use APP_OPENED for anything that needs "someone opened Vercro".
  SESSION_STARTED:           "session_started",
  SCREEN_VIEWED:             "screen_viewed",
  TASKS_SURFACED:            "tasks_surfaced",
  TASK_COMPLETED:            "task_completed",
  CROP_ADDED:                "crop_added",
  HARVEST_LOGGED:            "harvest_logged",
  // 3B3c — the harvest photo funnel.
  //
  // photo_url was 0 of 461, which read as "gardeners don't photograph
  // harvests". It was not: 21 photos reached storage and the link write failed
  // silently every time. We have never had a real baseline for this, so measure
  // each step rather than inferring appetite from an outcome a bug produced.
  HARVEST_PHOTO_OFFERED:     "harvest_photo_offered",
  HARVEST_PHOTO_SELECTED:    "harvest_photo_selected",
  HARVEST_PHOTO_UPLOAD_START:"harvest_photo_upload_started",
  HARVEST_PHOTO_UPLOADED:    "harvest_photo_uploaded",
  HARVEST_PHOTO_FAILED:      "harvest_photo_failed",
  HARVEST_ENRICHMENT_OPENED: "harvest_enrichment_opened",
  PLANTCHECK_USED:           "plantcheck_used",
  OBSERVATION_LOGGED:        "observation_logged",
  ONBOARDING_STEP_VIEWED:    "onboarding_step_viewed",
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
  ONBOARDING_COMPLETED:      "onboarding_completed",
  SUBSCRIPTION_STARTED:      "subscription_started",
  SUBSCRIPTION_COMPLETED:    "subscription_completed",
});

// Events captured before posthog.init() resolves. Bounded so a PostHog outage
// or an ad-blocked bundle can't grow this without limit.
const MAX_QUEUE = 50;
let queue = [];

// key -> last-fired timestamp, for trackOnce().
const lastFired = new Map();

function client() {
  return typeof window !== "undefined" ? window.posthog : null;
}

/**
 * "web" | "ios" | "android".
 *
 * Capacitor's native builds serve the app from $host = localhost, which is
 * indistinguishable from `npm run dev` in PostHog. Registering this as a super
 * property is the only reliable way to tell an iPhone from a dev machine.
 */
export function getPlatform() {
  if (typeof window === "undefined") return "unknown";
  const cap = window.Capacitor;
  if (cap?.isNative) {
    const p = typeof cap.getPlatform === "function" ? cap.getPlatform() : null;
    return p === "ios" || p === "android" ? p : "native";
  }
  return "web";
}

/** Super properties attached to every event, including $autocapture. */
function superProperties() {
  const platform = getPlatform();
  return {
    platform,
    is_native: platform === "ios" || platform === "android",
  };
}

/**
 * Register platform on every subsequent event. Called from _app.js's `loaded`
 * callback so it is set before anything can be captured.
 */
export function registerAnalyticsContext(instance) {
  const ph = instance || client();
  if (!ph || typeof ph.register !== "function") return;
  ph.register(superProperties());
}

/**
 * Called once from _app.js's `loaded` callback. Registers super properties and
 * replays anything captured during the mount-order gap described above.
 */
export function flushAnalytics(instance) {
  const ph = instance || client();
  if (!ph || typeof ph.capture !== "function") return;
  registerAnalyticsContext(ph);
  const pending = queue;
  queue = [];
  pending.forEach(({ event, props, options }) => {
    try { ph.capture(event, props, options); } catch (e) { /* never break the app for analytics */ }
  });
}

/**
 * Capture one event. Safe to call anywhere, at any time, on any platform.
 *
 * Every call describes a single user action. If you are inside a loop over
 * records, you are at the wrong altitude — see the bulk-fire note at the top.
 */
export function track(event, props = {}, options) {
  const ph = client();
  if (!ph || typeof ph.capture !== "function") {
    if (queue.length < MAX_QUEUE) queue.push({ event, props, options });
    return;
  }
  try {
    ph.capture(event, props, options);
  } catch (e) { /* never break the app for analytics */ }
}

/**
 * Capture at most once per `ttlMs` for a given key.
 *
 * For render-triggered events only (screen_viewed, tasks_surfaced). Dashboard
 * calls setData twice on a cold open — once from the localStorage cache, once
 * from the fresh /dashboard response — and React remounts the component on
 * every tab return, so a naive render-time capture double-counts.
 *
 * Returns true if the event was captured.
 */
export function trackOnce(key, event, props = {}, ttlMs = 30000) {
  const now = Date.now();
  const previous = lastFired.get(key);
  if (previous !== undefined && now - previous < ttlMs) return false;
  lastFired.set(key, now);
  track(event, props);
  return true;
}

/** Clear a trackOnce key so the next call fires regardless of its TTL. */
export function resetTrackOnce(key) {
  lastFired.delete(key);
}

/**
 * Link the anonymous person to the authenticated user.
 *
 * Restores the identify() calls removed by 660440e. Without this, signed-in
 * users keep accumulating as anonymous persons and no funnel spanning signup
 * can resolve — the audit found 6 people in 30 days with 10+ events and no
 * identity attached.
 */
export function identifyUser(user, extraProps = {}) {
  const ph = client();
  if (!ph || !user?.id || typeof ph.identify !== "function") return;
  try {
    ph.identify(user.id, { email: user.email, ...extraProps });
  } catch (e) { /* never break the app for analytics */ }
}

// ── app_opened ───────────────────────────────────────────────────────────────
//
// One genuine visit = one event.
//
// "Open" cannot mean "page load". Capacitor keeps the native webview alive for
// days, so an iPhone user who never force-quits Vercro would load the page once
// a week while opening the app daily — the metric would undercount exactly the
// users we most want to measure. An open therefore means the app was brought to
// the FOREGROUND, whether by a fresh load or by a resume from background.
//
// That admits the opposite failure: visibilitychange fires on every glance at
// another app, so foregrounding alone would wildly overcount. The rule that
// makes both work is a 30-minute sessionization window — the same inactivity
// gap PostHog uses to delimit its own sessions, so `app_opened` per session
// stays close to 1 and "opens per active user" is directly interpretable.
//
// The 30-minute gap is persisted in localStorage, not held in component state
// or a module variable, which is what makes it immune to every duplication path
// that matters: React remounts and rerenders, StrictMode's double-invoked
// effects, tab changes, dashboard cache refreshes, and the deliberate
// window.location.reload() after a successful purchase. A module variable would
// survive remounts but not reloads; localStorage survives both.
//
// Keyed per user id so signing in as a different person on a shared device
// registers as a genuine new open rather than being swallowed by the gap.
const APP_OPEN_GAP_MS = 30 * 60 * 1000;
const APP_OPEN_KEY_PREFIX = "vercro_last_app_open:";

// Fallback for private browsing / disabled storage, so a blocked localStorage
// degrades to "one open per JS context" rather than to no opens at all.
const lastOpenFallback = new Map();

function readLastOpen(userId) {
  try {
    const raw = window.localStorage.getItem(APP_OPEN_KEY_PREFIX + userId);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch (e) {
    return lastOpenFallback.get(userId) || 0;
  }
}

function writeLastOpen(userId, ts) {
  lastOpenFallback.set(userId, ts);
  try { window.localStorage.setItem(APP_OPEN_KEY_PREFIX + userId, String(ts)); } catch (e) { /* private mode */ }
}

/**
 * Record a genuine app open by an identified user.
 *
 * Anonymous visitors are deliberately excluded: a DAU denominator that counts
 * people who bounced off the auth screen is not a measure of app usage. The
 * audit's DAU included them, which is part of why DAU/MAU read so low.
 *
 * @param {{id: string, created_at?: string}} user  authenticated Supabase user
 * @param {"launch"|"resume"} openType
 * @returns {boolean} true if an event was emitted
 */
export function trackAppOpened(user, openType = "launch") {
  if (typeof window === "undefined" || !user?.id) return false;

  const now = Date.now();
  const last = readLastOpen(user.id);
  if (last && now - last < APP_OPEN_GAP_MS) return false;

  // Written before capture so a synchronous re-entry (StrictMode's double
  // effect invocation) reads the fresh timestamp and is suppressed.
  writeLastOpen(user.id, now);

  const platform = getPlatform();
  track(EVENTS.APP_OPENED, {
    open_type: openType,
    // platform / is_native are already super properties. Repeated explicitly
    // because this event is the denominator for every headline metric, and it
    // should stay self-describing even if super-property registration ever
    // regresses the way the capture layer itself did in June.
    platform,
    is_native: platform === "ios" || platform === "android",
    days_since_signup: daysSinceSignup(user),
    // Gives return-frequency analysis without a self-join. Null on first ever open.
    hours_since_last_open: last ? Math.round(((now - last) / 3600000) * 10) / 10 : null,
  });
  return true;
}

/** Test seam — clears the app-open gap for a user. */
export function resetAppOpenGap(userId) {
  lastOpenFallback.delete(userId);
  try { window.localStorage.removeItem(APP_OPEN_KEY_PREFIX + userId); } catch (e) {}
}

/**
 * Whole days since the account was created, or null if unknown.
 * Used to age-segment sessions without joining out to Supabase.
 */
export function daysSinceSignup(user) {
  if (!user?.created_at) return null;
  const created = new Date(user.created_at).getTime();
  if (!created || Number.isNaN(created)) return null;
  return Math.floor((Date.now() - created) / 86400000);
}
