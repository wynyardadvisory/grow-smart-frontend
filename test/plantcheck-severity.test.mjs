/**
 * V052A — frontend severity resolution and display.
 *
 * Covers the two compatibility directions that matter, because getting either
 * wrong is user-visible on the product's best feature:
 *
 *   new client + new API  → canonical severity_state
 *   new client + old API  → deprecated magnitude field
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SEVERITY, resolveSeverityState, severityLabel, severityEmoji, SEVERITY_COPY,
} from "../lib/plantcheck-severity.mjs";

test("canonical rendering — severity_state is preferred", () => {
  for (const s of SEVERITY) {
    assert.equal(resolveSeverityState({ severity_state: s }), s);
  }
});

test("canonical rendering — severity_state wins over a conflicting legacy field", () => {
  // Belt and braces: during the transition both fields are present, and the
  // canonical one is the source of truth.
  assert.equal(resolveSeverityState({ severity_state: "urgent", severity: "low" }), "urgent");
});

test("legacy fallback — an old API response still resolves", () => {
  assert.equal(resolveSeverityState({ severity: "low" }),    "watch");
  assert.equal(resolveSeverityState({ severity: "medium" }), "treat");
  assert.equal(resolveSeverityState({ severity: "high" }),   "urgent");
});

test("legacy fallback — healthy comes from looks_healthy on both vocabularies", () => {
  // A healthy result carries no severity at all, old API or new.
  assert.equal(resolveSeverityState({ looks_healthy: true }), "healthy");
  assert.equal(resolveSeverityState({ looks_healthy: true, severity: null }), "healthy");
});

test("unknown input resolves to null rather than a wrong state", () => {
  assert.equal(resolveSeverityState({ severity: "catastrophic" }), null);
  assert.equal(resolveSeverityState({}), null);
  assert.equal(resolveSeverityState(null), null);
});

test("display copy exists for every canonical state", () => {
  assert.deepEqual(Object.keys(SEVERITY_COPY).sort(), [...SEVERITY].sort());
  for (const s of SEVERITY) {
    assert.ok(severityLabel(s), `${s} has no label`);
    assert.ok(severityEmoji(s), `${s} has no emoji`);
  }
});

test("display copy never leaks developer vocabulary to the user", () => {
  // The internal state is "treat". Nobody should ever read "TREAT severity".
  for (const s of SEVERITY) {
    const label = severityLabel(s).toLowerCase();
    assert.ok(!label.includes("severity"), `"${severityLabel(s)}" exposes the word severity`);
    if (s !== "healthy") {
      assert.notEqual(label, s, `"${severityLabel(s)}" is just the raw state`);
    }
  }
});

test("unknown state degrades to a neutral icon rather than throwing", () => {
  assert.equal(severityLabel(null), null);
  assert.equal(severityEmoji(null), "ℹ️");
});
