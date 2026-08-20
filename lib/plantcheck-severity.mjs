/**
 * PLANT CHECK SEVERITY — CLIENT RESOLUTION AND DISPLAY
 * ─────────────────────────────────────────────────────────────────────────────
 * The canonical vocabulary is healthy | watch | treat | urgent, defined by the
 * API in plantcheck-severity.js and enforced by diagnosis_log_severity_check.
 *
 * This module does two things and nothing else:
 *
 *   1. Resolves which state a response describes, tolerating BOTH the canonical
 *      field and the deprecated magnitude field, so the app renders correctly
 *      whichever API build it is talking to.
 *
 *   2. Turns that state into language a gardener would use. The internal state
 *      is `treat`; nobody should ever read "TREAT severity" on screen.
 *
 * .mjs rather than .js so `node --test` can import it directly — the package is
 * type:commonjs, and untested display logic is how "TREAT severity" would ship.
 */

export const SEVERITY = Object.freeze(["healthy", "watch", "treat", "urgent"]);

/** Deprecated magnitude vocabulary → canonical. Only for older API responses. */
const LEGACY_TO_CANONICAL = Object.freeze({ low: "watch", medium: "treat", high: "urgent" });

/**
 * Which canonical state does this result describe?
 *
 * Order matters. `severity_state` is the source of truth; `severity` is the
 * deprecated wire field and is only consulted when the canonical one is absent,
 * i.e. when this client is talking to an API build from before V052A.
 *
 * @param {object} result a /diagnoses/analyze response
 * @returns {string|null} canonical state, or null when genuinely unknown
 */
export function resolveSeverityState(result) {
  if (!result) return null;
  if (result.severity_state && SEVERITY.includes(result.severity_state)) return result.severity_state;
  // A healthy result carries no severity at all — on either vocabulary — so the
  // healthy signal has to come from looks_healthy.
  if (result.looks_healthy === true) return "healthy";
  const legacy = result.severity ? String(result.severity).trim().toLowerCase() : null;
  if (legacy && SEVERITY.includes(legacy)) return legacy;          // tolerate canonical here too
  if (legacy && LEGACY_TO_CANONICAL[legacy]) return LEGACY_TO_CANONICAL[legacy];
  return null;
}

/**
 * Customer-facing language.
 *
 * Deliberately verb-led rather than adjective-led: the state exists to tell the
 * gardener what to do, so the label says what to do. "Medium severity" is a
 * classification; "Action recommended" is guidance.
 */
export const SEVERITY_COPY = Object.freeze({
  healthy: { label: "Healthy",              emoji: "🌿", tone: "positive" },
  watch:   { label: "Keep an eye on this",  emoji: "👀", tone: "info"     },
  treat:   { label: "Action recommended",   emoji: "⚠️", tone: "attention" },
  urgent:  { label: "Needs attention now",  emoji: "🚨", tone: "danger"   },
});

export function severityLabel(state) { return SEVERITY_COPY[state]?.label ?? null; }
export function severityEmoji(state) { return SEVERITY_COPY[state]?.emoji ?? "ℹ️"; }
export function severityTone(state)  { return SEVERITY_COPY[state]?.tone  ?? "neutral"; }
