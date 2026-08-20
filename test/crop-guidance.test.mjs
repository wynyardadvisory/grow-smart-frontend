/**
 * V038 — Crop Timeline guidance resolution.
 *
 * The defect: one hardcoded map of TOMATO advice was rendered for all 283 crop
 * definitions, so Spinach was told to "pick before first frost — green fruit
 * ripens indoors".
 *
 * Test 4 is the one to keep: it asserts that no non-tomato crop can ever receive
 * the tomato copy. That single assertion is the defect.
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveStageGuidance, CROP_STAGE_ADVICE, CATEGORY_STAGE_ADVICE } from "../lib/crop-guidance.mjs";

const TOMATO_PHRASES = [
  "green fruit ripens indoors",
  "blossom end rot",
  "Pick when fully coloured and slightly soft",
  "Harvest regularly to encourage more fruit",
  "high potash",
];

// Real rows, transcribed from crop_definitions on 20 Aug 2026.
const DEFS = {
  Tomato:    { name: "Tomato",    category: "fruiting", grower_notes: "Pinch out side shoots on cordon types weekly. Feed with tomato fertiliser once first fruits set." },
  Spinach:   { name: "Spinach",   category: "salad",    grower_notes: "Bolts in heat — use bolt-resistant varieties. Perpetual spinach (chard) is more reliable in summer." },
  Apple:     { name: "Apple",     category: "fruit",    grower_notes: "Plant bare-root trees Nov-Mar, container trees year-round. Choose disease-resistant varieties. Annual pruning in winter essential." },
  Carrot:    { name: "Carrot",    category: "root",     grower_notes: "Do not add fresh manure — causes forking. Thin to 5cm apart. Cover shoulders if greening occurs." },
  Courgette: { name: "Courgette", category: "fruiting", grower_notes: "Harvest when 15–20cm long. Do not let fruits mature or production stops. One or two plants feed a family." },
  Rosemary:  { name: "Rosemary",  category: "herb",     grower_notes: "Hardy in well-drained soil. Resents waterlogging — plant on a slope or raised bed." },
  Nameless:  { name: "Mystery Crop", category: null,    grower_notes: null },
};
const STAGES = ["seed", "seedling", "vegetative", "flowering", "fruiting", "harvesting"];

test("1. tomato — keeps its own stage advice", () => {
  const r = resolveStageGuidance({ cropDef: DEFS.Tomato, stage: "harvesting" });
  assert.equal(r.layer, "crop");
  assert.equal(r.heading, "What to do right now");
  assert.ok(r.items.includes("Pick when fully coloured and slightly soft"));
});

test("2. spinach — gets its own notes, never tomato advice", () => {
  const r = resolveStageGuidance({ cropDef: DEFS.Spinach, stage: "harvesting" });
  assert.equal(r.layer, "grower_notes");
  assert.equal(r.heading, "Growing notes", "stage-agnostic notes must not claim to be 'right now'");
  assert.match(r.text, /Bolts in heat/);
  assert.equal(r.items.length, 0);
});

test("3. apple, carrot, courgette, rosemary — each gets its OWN notes", () => {
  for (const key of ["Apple", "Carrot", "Courgette", "Rosemary"]) {
    const r = resolveStageGuidance({ cropDef: DEFS[key], stage: "harvesting" });
    assert.equal(r.layer, "grower_notes", `${key} should fall through to its own notes`);
    assert.equal(r.text, DEFS[key].grower_notes.trim());
  }
});

test("4. NO non-tomato crop can EVER receive tomato copy — at any stage", () => {
  for (const [key, def] of Object.entries(DEFS)) {
    if (key === "Tomato") continue;
    for (const stage of STAGES) {
      const r = resolveStageGuidance({ cropDef: def, stage });
      const rendered = [...r.items, r.text || ""].join(" ");
      for (const phrase of TOMATO_PHRASES) {
        assert.ok(
          !rendered.includes(phrase),
          `${key} at stage "${stage}" rendered tomato copy: "${phrase}". THIS IS THE V038 DEFECT.`
        );
      }
    }
  }
});

test("5. courgette is 'fruiting' category but still must NOT inherit tomato copy", () => {
  // The trap: courgette shares tomato's category. Category is not identity.
  const r = resolveStageGuidance({ cropDef: DEFS.Courgette, stage: "harvesting" });
  assert.notEqual(r.layer, "crop");
  assert.ok(!(r.text || "").includes("ripens indoors"));
});

test("6. no content at all — render NOTHING, do not invent", () => {
  const r = resolveStageGuidance({ cropDef: DEFS.Nameless, stage: "harvesting" });
  assert.equal(r.layer, null);
  assert.equal(r.heading, null);
  assert.equal(r.items.length, 0);
  assert.equal(r.text, null);
});

test("7. missing crop definition is safe", () => {
  for (const bad of [undefined, null, {}]) {
    const r = resolveStageGuidance({ cropDef: bad, stage: "harvesting" });
    assert.equal(r.layer, null);
  }
});

test("8. missing or unknown stage falls through to notes rather than throwing", () => {
  for (const stage of [undefined, null, "", "germinating"]) {
    const r = resolveStageGuidance({ cropDef: DEFS.Tomato, stage });
    assert.equal(r.layer, "grower_notes", "an unknown stage must not resolve stage advice");
  }
});

test("9. blank grower_notes is treated as absent, not as empty content", () => {
  const r = resolveStageGuidance({ cropDef: { name: "X", category: "root", grower_notes: "   " }, stage: "harvesting" });
  assert.equal(r.layer, null);
});

test("10. the crop layer holds ONLY content written for that crop", () => {
  // A guard on the architecture: if someone adds a crop here, they are asserting
  // the copy was written for it. Today that is Tomato and nothing else.
  assert.deepEqual(Object.keys(CROP_STAGE_ADVICE), ["Tomato"]);
});

test("11. the category layer is empty, and that is deliberate", () => {
  // When category content is added it must be reviewed horticulturally first.
  // This test exists so adding it is a conscious act, not a drive-by.
  assert.deepEqual(Object.keys(CATEGORY_STAGE_ADVICE), [],
    "Category guidance now exists — confirm it has had horticultural review, then update this test.");
});

test("12. a variety argument is accepted now, so call sites do not change later", () => {
  const r = resolveStageGuidance({ cropDef: DEFS.Tomato, variety: { name: "Sungold" }, stage: "harvesting" });
  assert.equal(r.layer, "crop");
});
