/**
 * The harvest-item contract.
 *
 * Two screens opened one modal with two object shapes and nothing asserted they
 * agreed. On the Today path `item.crop` was undefined, so the subtitle and the
 * confirmation rendered blank and six analytics events emitted crop_name: null
 * — through eight production acceptance cases that all passed.
 *
 * These tests are the thing that was missing: both callers, one shape, asserted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  toHarvestItem, harvestItemLabel,
  formatHarvestQuantity, formatHarvestTotal, hasKnownQuantity,
  HARVEST_UNITS, isCountUnit,
} from "../lib/harvest-item.mjs";

const CROP_ID = "44444444-4444-4444-8444-444444444441";

/** Exactly what GET /dashboard puts in harvest_forecast (api.js:5511). */
const forecastItem = (over = {}) => ({
  crop_name: "Mint", variety: "Moroccan", crop_instance_id: CROP_ID,
  window_start: "2026-08-01", window_end: "2026-09-30",
  phase: "in_window", certainty: "predicted", ...over,
});

/** Exactly what the Crops tab hand-builds (index.js:8631). */
const cropsTabItem = (over = {}) => ({
  name: "Mint", variety: "Moroccan", id: CROP_ID, ...over,
});

// ── the convergence that was missing ────────────────────────────────────────

test("1. both call sites produce the same semantic object", () => {
  const fromToday = toHarvestItem(forecastItem());
  const fromCrops = toHarvestItem(cropsTabItem());

  for (const field of ["cropInstanceId", "displayName", "analyticsName", "variety", "successionLabel"]) {
    assert.equal(fromToday[field], fromCrops[field], `${field} must agree across both paths`);
  }
  assert.equal(fromToday.displayName, "Mint");
  assert.equal(fromToday.cropInstanceId, CROP_ID);
  assert.equal(fromToday.variety, "Moroccan");
});

test("2. the field `crop` does not exist on the contract", () => {
  // The whole defect in one assertion. If `crop` ever comes back as a
  // compatibility shim, the two paths can drift again.
  for (const src of [forecastItem(), cropsTabItem(), {}]) {
    const item = toHarvestItem(src);
    assert.ok(!("crop" in item), "no field named `crop` — that is what the contract replaces");
  }
});

test("3. no field the modal consumes is ever undefined", () => {
  // undefined is what made this invisible: JSON.stringify drops the key, so the
  // POST body simply lost crop_name rather than sending anything wrong.
  const item = toHarvestItem({});
  for (const [k, v] of Object.entries(item)) {
    assert.notEqual(v, undefined, `${k} must be null, never undefined`);
  }
});

// ── display identity vs analytics identity ──────────────────────────────────

test("4. a succession composite decomposes — display keeps it, analytics does not", () => {
  const item = toHarvestItem(forecastItem({ crop_name: "Mint (Sow 2)" }));
  assert.equal(item.displayName, "Mint");
  assert.equal(item.successionLabel, "Sow 2");
  assert.equal(item.successionIndex, 2);
  assert.equal(item.analyticsName, "Mint",
    "PostHog must see one Mint, not Mint / Mint (Sow 1) / Mint (Sow 2)");
});

test("5. analyticsName NEVER carries engine notation", () => {
  for (const name of ["Carrot (Sow 1)", "Carrot (Sow 12)", "Carrot"]) {
    const item = toHarvestItem(forecastItem({ crop_name: name }));
    assert.equal(item.analyticsName, "Carrot");
    assert.doesNotMatch(item.analyticsName, /\(Sow/);
  }
});

test("6. explicit fields win over the composite", () => {
  const item = toHarvestItem(forecastItem({ crop_name: "Mint (Sow 2)", name: "Mint", succession_index: 2 }));
  assert.equal(item.displayName, "Mint");
  assert.equal(item.successionIndex, 2);
});

test("7. a name that legitimately contains brackets is not mangled", () => {
  for (const name of ["Tomato (Cherry)", "Bean (Climbing)", "Sow thistle", "Kale (Red Russian)"]) {
    const item = toHarvestItem(forecastItem({ crop_name: name }));
    assert.equal(item.displayName, name, `"${name}" must survive intact`);
    assert.equal(item.successionLabel, null);
  }
});

test("8. the label shows succession only when there is one", () => {
  assert.equal(harvestItemLabel(toHarvestItem(forecastItem())), "Mint — Moroccan");
  assert.equal(
    harvestItemLabel(toHarvestItem(forecastItem({ crop_name: "Mint (Sow 2)" }))),
    "Mint · Sow 2 — Moroccan");
  assert.equal(
    harvestItemLabel(toHarvestItem(forecastItem({ variety: null }))), "Mint");
  assert.equal(harvestItemLabel(toHarvestItem({})), "", "no name renders nothing, never 'undefined'");
});

// ── presetFinal: the hazard found while auditing ────────────────────────────

test("9. an unspecified finality is null — ASK, never the crop-closing default", () => {
  // The Crops tab never set presetFinal, and the modal did `?? true`, silently
  // pre-selecting "Final harvest" — the option that ends the planting.
  assert.equal(toHarvestItem(cropsTabItem()).presetFinal, null);
  assert.equal(toHarvestItem(forecastItem()).presetFinal, null);
});

test("10. Today's two buttons carry their answer through", () => {
  assert.equal(toHarvestItem(forecastItem(), { presetFinal: false }).presetFinal, false);
  assert.equal(toHarvestItem(forecastItem(), { presetFinal: true }).presetFinal, true);
  assert.equal(toHarvestItem(forecastItem({ presetFinal: false })).presetFinal, false,
    "false must survive — it is a real answer, not an absent one");
});

test("11. lifecycle and window travel with the item", () => {
  const item = toHarvestItem(forecastItem({ is_perennial: true }));
  assert.equal(item.isPerennial, true);
  assert.deepEqual(item.harvestWindow, { start: "2026-08-01", end: "2026-09-30", phase: "in_window" });
  assert.equal(toHarvestItem(cropsTabItem()).isPerennial, null, "unknown is null, never assumed false");
  assert.equal(toHarvestItem(cropsTabItem()).harvestWindow, null);
});

// ── quantity display ────────────────────────────────────────────────────────

test("12. canonical quantities render in the unit the gardener used", () => {
  const cases = [
    [{ quantity_grams: 2500, quantity_entered_value: "2.500", quantity_entered_unit: "kg" }, "2.5 kg"],
    [{ quantity_grams: 250,  quantity_entered_value: "0.250", quantity_entered_unit: "kg" }, "0.25 kg"],
    [{ quantity_grams: 500,  quantity_entered_value: "500",   quantity_entered_unit: "g"  }, "500 g"],
    [{ quantity_grams: 3000, quantity_entered_value: "3.000", quantity_entered_unit: "kg" }, "3 kg"],
    [{ quantity_count: 14,   quantity_entered_unit: "number" }, "14 items"],
    [{ quantity_count: 1,    quantity_entered_unit: "number" }, "1 item"],
    [{ quantity_count: 2,    quantity_entered_unit: "bunch"  }, "2 bunches"],
  ];
  for (const [row, expected] of cases) assert.equal(formatHarvestQuantity(row), expected);
});

test("13. a legacy row says the unit is unknown and NEVER says grams", () => {
  const shown = formatHarvestQuantity({ quantity_g: 650 });
  assert.match(shown, /unit not recorded/);
  assert.doesNotMatch(shown, /650\s*g\b/, "must not imply grams");
  assert.equal(hasKnownQuantity({ quantity_g: 650 }), false);
  assert.equal(hasKnownQuantity({ quantity_grams: 650 }), true);
});

test("14. no quantity renders nothing at all", () => {
  assert.equal(formatHarvestQuantity({}), null);
  assert.equal(formatHarvestQuantity(null), null);
  assert.equal(formatHarvestQuantity({ quantity_grams: null, quantity_count: null }), null);
  assert.equal(hasKnownQuantity({}), false);
});

test("15. 900 g and 14 items are two dimensions, and never 914", () => {
  const line = formatHarvestTotal({ total_quantity_grams: 900, total_quantity_count: 14 });
  assert.equal(line, "900 g · 14 items");
  assert.doesNotMatch(line, /914/);
});

test("16. a total of one dimension shows one dimension; of none, nothing", () => {
  assert.equal(formatHarvestTotal({ total_quantity_grams: 2500 }), "2.5 kg");
  assert.equal(formatHarvestTotal({ total_quantity_grams: 3000 }), "3 kg");
  assert.equal(formatHarvestTotal({ total_quantity_count: 1 }), "1 item");
  assert.equal(formatHarvestTotal({}), null, "a total made only of unknowns is not a total");
});

test("17. the API's pre-formatted string is preferred when present", () => {
  assert.equal(formatHarvestQuantity({ quantity_display: "2.5 kg", quantity_grams: 2500 }), "2.5 kg");
  assert.equal(formatHarvestQuantity({ quantity_display: "" }), null);
});

// ── units offered by the form ───────────────────────────────────────────────

test("18. every offered unit has a step suited to it", () => {
  assert.deepEqual(HARVEST_UNITS.map(u => u.value), ["kg", "g", "number", "bunch"]);
  for (const u of HARVEST_UNITS) {
    // A mobile keyboard should offer a decimal point only where one is meaningful.
    if (isCountUnit(u.value)) assert.equal(u.step, "1", `${u.value} must not invite a fraction`);
    else assert.ok(Number(u.step) <= 1, `${u.value} must allow a decimal`);
  }
});
