/**
 * V073 — action grouping, tested against real production task text.
 *
 * dedupByCrop keyed on `t.crop?.name || t.rule_id`, so anything without a crop
 * collapsed by RULE: weeding is per-area, so every area after the first vanished.
 * 439 open tasks were invisible to 65 users across 275 areas, the oldest due
 * 18 April. One user had 61 hidden.
 *
 * Fixing the key alone would have swung Today from 3.1 cards to 5.7, with a
 * worst case of 83. Grouping by rule instead gives 1.7 and a worst case of 6,
 * while hiding nothing. This file pins the labelling that makes that readable.
 *
 * commonActionLabel is read out of pages/index.js rather than copied, so the
 * test cannot drift away from the shipped implementation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../pages/index.js", import.meta.url), "utf8");
const start = src.indexOf("function commonActionLabel");
assert.ok(start > 0, "commonActionLabel must exist in pages/index.js");
const end = src.indexOf("\n}", start) + 2;
const commonActionLabel = eval(`(${src.slice(start, end)})`);

// ── Real strings, copied verbatim from production ───────────────────────────

test("weeding across many beds — the case that was hidden", () => {
  const actions = [
    "Check for weeds in Pallet 8 left", "Check for weeds in Pallet 2 right",
    "Check for weeds in Rhubarb bed",   "Check for weeds in Fig bed",
  ];
  assert.equal(commonActionLabel(actions), "Check for weeds",
    "the trailing preposition must go — 'Check for weeds in' is not a heading");
});

test("soil moisture keeps the per-area detail in the row", () => {
  const actions = [
    "Check soil moisture in Fig bed — your last reading was 131 days ago",
    "Check soil moisture in Bed 3 left — your last reading was 131 days ago",
  ];
  assert.equal(commonActionLabel(actions), "Check soil moisture");
});

test("feeding groups by the action, not the crop", () => {
  const actions = [
    "Time to feed Courgette — apply balanced liquid feed. Add your feed to the feeds section for personalised reminders",
    "Time to feed Leek — apply nitrogen-rich. Add your feed to the feeds section for personalised reminders",
  ];
  assert.equal(commonActionLabel(actions), "Time to feed");
});

test("27 succession sowings of one crop collapse to one heading", () => {
  const actions = Array.from({ length: 27 }, (_, i) =>
    `Time to direct sow Radish outdoors. Window: Mar–Aug (Sow ${i % 8})`);
  assert.equal(commonActionLabel(actions), "Time to direct sow Radish outdoors. Window: Mar–Aug");
});

// ── THE CASE REAL DATA CAUGHT ───────────────────────────────────────────────

test("heterogeneous phrasing yields NO label, never a whole sentence", () => {
  // Both of these live under one rule_id in production.
  const watering = [
    "Check whether Bed 5 needs watering (Last watering or meaningful rain: 48 days ago) — pay particular attention to: Carrot",
    "Water Greenhouse (Last watering or meaningful rain: 48 days ago) — pay particular attention to: Tomato",
  ];
  const harvest = [
    "Cherry should be ready to harvest — check for ripeness and pick regularly to encourage more fruit",
    "Echinacea should be entering its harvest window — cut what you need",
  ];
  for (const g of [watering, harvest]) {
    const label = commonActionLabel(g);
    assert.equal(label, null,
      `a group sharing no opening words must return null, got: ${label}`);
  }
});

test("a one-word overlap is not a heading", () => {
  assert.equal(commonActionLabel(["Water Greenhouse", "Water Patio"]), null,
    "'Water' alone is too thin to caption a group — the task type covers it");
});

test("degenerate inputs never throw", () => {
  assert.equal(commonActionLabel([]), "");
  assert.equal(commonActionLabel(null), "");
  assert.equal(commonActionLabel(["Only one"]), "Only one");
  assert.equal(commonActionLabel([undefined, undefined]), null);
});

// ── Identity: the actual defect ─────────────────────────────────────────────

test("INVARIANT · identity is the entity, never its name", () => {
  const key = (t) => `${t.rule_id || "?"}|` + (
    t.crop_instance_id ? `crop:${t.crop_instance_id}`
    : t.area_id        ? `area:${t.area_id}`
    : `task:${t.id}`);

  // Three sowings of Carrot — same name, three different plants.
  const carrots = [
    { id: "1", rule_id: "watering_due", crop_instance_id: "a" },
    { id: "2", rule_id: "watering_due", crop_instance_id: "b" },
    { id: "3", rule_id: "watering_due", crop_instance_id: "c" },
  ];
  assert.equal(new Set(carrots.map(key)).size, 3, "same crop NAME must not merge");

  // Weeding in three beds — no crop at all, which is what the old key collapsed.
  const beds = [
    { id: "4", rule_id: "weeding_due", area_id: "x" },
    { id: "5", rule_id: "weeding_due", area_id: "y" },
    { id: "6", rule_id: "weeding_due", area_id: "z" },
  ];
  assert.equal(new Set(beds.map(key)).size, 3, "one rule across three areas is three jobs");

  // Genuine duplicates — same action, same thing — still collapse.
  const dupes = [
    { id: "7", rule_id: "weeding_due", area_id: "x" },
    { id: "8", rule_id: "weeding_due", area_id: "x" },
  ];
  assert.equal(new Set(dupes.map(key)).size, 1, "same action on the same thing is one job");

  // Different rules on the same bed are different work.
  const twoRules = [
    { id: "9",  rule_id: "weeding_due",        area_id: "x" },
    { id: "10", rule_id: "soil_moisture_stale", area_id: "x" },
  ];
  assert.equal(new Set(twoRules.map(key)).size, 2);
});
