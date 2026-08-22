/**
 * Client wording and flow for how a planting ends.
 *
 * Two rules this file exists to enforce, both of which the old "✕ Mark as
 * failed" sheet broke: the product never tells a gardener they neglected
 * something, and it never asks for both axes when the surface has already
 * established one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  OUTCOME, END_REASON, VERDICT_OPTIONS, MECHANISM_OPTIONS, LOSS_OPTIONS,
  OUTCOME_LABEL, REASON_LABEL, endingSummary, formatDay, formatSpan,
} from "../lib/planting-ending.mjs";

// ── language ────────────────────────────────────────────────────────────────

test("1. `neglect` appears in no user-facing string", () => {
  const all = [
    ...VERDICT_OPTIONS.map(o => o.label),
    ...MECHANISM_OPTIONS.map(o => o.label),
    ...LOSS_OPTIONS.map(o => o.label),
    ...Object.values(OUTCOME_LABEL), ...Object.values(REASON_LABEL),
  ];
  for (const s of all) {
    assert.doesNotMatch(s.toLowerCase(), /neglect/, `"${s}" must not blame the gardener`);
  }
  // The concept is still reachable — 18 of 100 real failures chose it.
  assert.ok(LOSS_OPTIONS.some(o => o.key === END_REASON.UNATTENDED && o.label === "Didn't get to it"));
});

test("2. no user-facing string uses 'fail'", () => {
  const all = [
    ...VERDICT_OPTIONS.map(o => o.label), ...MECHANISM_OPTIONS.map(o => o.label),
    ...LOSS_OPTIONS.map(o => o.label), ...Object.values(OUTCOME_LABEL),
    ...Object.values(REASON_LABEL),
  ];
  for (const s of all) assert.doesNotMatch(s.toLowerCase(), /\bfail(ed|ure|s)?\b/, `"${s}"`);
});

test("3. the loss list covers what real gardeners chose, and excludes what isn't a loss", () => {
  const keys = LOSS_OPTIONS.map(o => o.key);
  // 15% of real failures were "other" because these three had nowhere to go.
  assert.ok(keys.includes(END_REASON.NEVER_ESTABLISHED));
  assert.ok(keys.includes(END_REASON.BOLTED));
  assert.ok(keys.includes(END_REASON.LOST_WATER), "48% of real losses");
  // "Made way for something else" is a legitimate ending, not a loss.
  assert.ok(!keys.includes(END_REASON.CLEARED));
});

// ── one question, never two ─────────────────────────────────────────────────

test("4. every mechanism establishes an axis and asks for at most the other", () => {
  for (const m of MECHANISM_OPTIONS) {
    const sets = m.sets || {};
    assert.ok(Object.keys(sets).length > 0, `${m.key} must establish something`);
    if (m.then === "verdict") {
      assert.equal(sets.outcome, undefined, `${m.key}: asking the verdict it already knows`);
      assert.ok(sets.end_reason, `${m.key}: must have established the mechanism`);
    }
    if (m.then === "loss_reason") {
      assert.equal(sets.end_reason, undefined, `${m.key}: asking the cause it already knows`);
      assert.ok(sets.outcome, `${m.key}: must have established the verdict`);
    }
    if (m.then === null) {
      assert.ok(sets.outcome && sets.end_reason, `${m.key}: asking nothing means knowing both`);
    }
  }
});

test("5. 'it gave me some' completes in a single tap", () => {
  const m = MECHANISM_OPTIONS.find(o => o.key === "gave_some");
  assert.equal(m.then, null);
  assert.equal(m.sets.outcome, OUTCOME.SOME);
  assert.equal(m.sets.end_reason, END_REASON.HARVESTED_OUT);
});

test("6. 'came to nothing' never assumes what got it", () => {
  const m = MECHANISM_OPTIONS.find(o => o.key === "came_to_nothing");
  assert.equal(m.sets.outcome, OUTCOME.NOTHING);
  assert.equal(m.sets.end_reason, undefined);
  assert.equal(m.then, "loss_reason");
});

test("7. 'cleared' never assumes the crop was bad", () => {
  // The commonest ending a productive garden has, and the one no previous
  // vocabulary could express: it gave well AND was pulled for space.
  const m = MECHANISM_OPTIONS.find(o => o.key === "cleared");
  assert.equal(m.sets.end_reason, END_REASON.CLEARED);
  assert.equal(m.sets.outcome, undefined);
  assert.equal(m.then, "verdict");
});

// ── the summary line ────────────────────────────────────────────────────────

test("8. a good crop cleared for space reads as both facts", () => {
  assert.equal(
    endingSummary({ verdict: OUTCOME.GOOD, reason: END_REASON.CLEARED }),
    "Good crop, then made way for something else");
});

test("9. a loss names its cause without repeating itself", () => {
  assert.equal(
    endingSummary({ verdict: OUTCOME.NOTHING, reason: END_REASON.LOST_PEST }),
    "Nothing really · Pests");
});

test("10. a plain harvest does not append a redundant mechanism", () => {
  assert.equal(
    endingSummary({ verdict: OUTCOME.GOOD, reason: END_REASON.HARVESTED_OUT }),
    "Good crop");
});

test("11. an unrecorded ending says so rather than rendering blank", () => {
  assert.equal(endingSummary({ verdict: OUTCOME.UNKNOWN, reason: END_REASON.UNKNOWN }),
    "Ending not recorded");
  assert.equal(endingSummary({}), "Ending not recorded");
});

test("12. a mechanism with no verdict still says something true", () => {
  assert.equal(endingSummary({ verdict: OUTCOME.UNKNOWN, reason: END_REASON.CLEARED }),
    "Made way for something else");
});

// ── dates ───────────────────────────────────────────────────────────────────

test("13. dates render the way a gardener reads them", () => {
  assert.equal(formatDay("2026-08-22"), "22 Aug 2026");
  assert.equal(formatDay(null), null);
  assert.equal(formatDay("nonsense"), null);
});

test("14. a span shows both ends, and degrades to the sowing alone", () => {
  // Month abbreviations come from the runtime's ICU data and differ between
  // Node versions and browsers ("Sep" vs "Sept"), so the assertion is on the
  // shape rather than on a locale quirk we do not control.
  assert.equal(formatSpan("2026-05-15", "2026-08-02"), "15 May 2026 → 2 Aug 2026");
  assert.match(formatSpan("2026-05-15", "2026-09-02"), /^15 May 2026 → 2 Sept? 2026$/);
  assert.equal(formatSpan("2026-05-15", null), "Sown 15 May 2026");
  assert.equal(formatSpan(null, null), null);
});

// ── completeness of the vocabulary ──────────────────────────────────────────

test("15. every option key is a real domain code", () => {
  const outcomes = new Set(Object.values(OUTCOME));
  const reasons  = new Set(Object.values(END_REASON));
  for (const o of VERDICT_OPTIONS) assert.ok(outcomes.has(o.key), o.key);
  for (const o of LOSS_OPTIONS)    assert.ok(reasons.has(o.key),  o.key);
  for (const m of MECHANISM_OPTIONS) {
    if (m.sets.outcome)    assert.ok(outcomes.has(m.sets.outcome));
    if (m.sets.end_reason) assert.ok(reasons.has(m.sets.end_reason));
  }
});

test("16. every code has wording", () => {
  for (const c of Object.values(OUTCOME))    assert.ok(OUTCOME_LABEL[c], c);
  for (const c of Object.values(END_REASON)) assert.ok(REASON_LABEL[c],  c);
});
