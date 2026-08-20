/**
 * CROP GUIDANCE RESOLUTION — V038
 * ─────────────────────────────────────────────────────────────────────────────
 * The Crop Timeline's "what to do right now" panel was a single hardcoded map of
 * SIX STAGES OF TOMATO ADVICE, rendered for all 283 crop definitions. Captured
 * against Spinach 'Perpetual Spinach' it read:
 *
 *     Pick when fully coloured and slightly soft
 *     Harvest regularly to encourage more fruit
 *     Pick before first frost — green fruit ripens indoors
 *
 * Spinach is a leaf. It has no fruit, it does not colour, and it does not ripen
 * indoors. This is the same defect as the long-standing Mint "pick regularly to
 * encourage more fruit" complaint — one set of tomato instructions shown for
 * every plant in the catalogue.
 *
 * THE RESOLUTION CHAIN
 *
 *   observation  → what we know about THIS plant          (not built yet)
 *   variety      → what is true of THIS variety           (not built yet)
 *   crop         → what is true of THIS crop
 *   category     → what is true of this KIND of plant     (deliberately empty)
 *   grower_notes → the crop's own notes, already populated for 100% of defs
 *   nothing      → SAY NOTHING
 *
 * WHY THE CROP LAYER CONTAINS EXACTLY ONE ENTRY
 *
 * The existing copy is tomato copy. It is correct for tomatoes and wrong for
 * everything else, so it is filed under Tomato — which is what it always was.
 * No new horticultural copy is invented here. Filling ten categories × six
 * stages would be the same mistake at a larger scale, and it would need
 * horticultural review before it could ship. Correctness first; completeness is
 * a separate, reviewed piece of work.
 *
 * THE RULE THAT MATTERS: if no layer resolves, RENDER NOTHING. An empty panel is
 * a correct answer. The absence of a "no advice available" concept is precisely
 * what caused this defect — the old code always had something to show, and what
 * it had was tomato advice.
 */

/** Stage advice that genuinely belongs to a specific crop. Keyed by crop_definitions.name. */
export const CROP_STAGE_ADVICE = Object.freeze({
  // Verbatim the pre-V038 map. It was always tomato advice; now it is labelled
  // as such and only shown on tomatoes.
  Tomato: Object.freeze({
    seed:       ["Keep at 20-25°C for germination", "Keep compost moist but not soggy", "Expect shoots in 7-14 days"],
    seedling:   ["Pot on when first true leaves appear", "Keep on a warm sunny windowsill", "Water from below to avoid damping off"],
    vegetative: ["Pot on to final container if needed", "Begin fortnightly balanced feed", "Ensure good light and airflow"],
    flowering:  ["Tap stems gently to aid pollination", "Switch to high potash feed", "Remove lower leaves for airflow"],
    fruiting:   ["Feed weekly with high potash", "Water consistently to avoid blossom end rot", "Check regularly for pests and blight"],
    harvesting: ["Pick when fully coloured and slightly soft", "Harvest regularly to encourage more fruit", "Pick before first frost — green fruit ripens indoors"],
  }),
});

/**
 * Category-level stage advice.
 *
 * DELIBERATELY EMPTY. This is where the architecture expects generic-but-correct
 * guidance to live (root crops, salad, brassica, allium, herb, fruit, legume…),
 * but writing ~40 pieces of gardening advice that ships to users is a content
 * decision needing horticultural review, not something to generate here.
 *
 * Adding a category here immediately improves every crop in it. That is the
 * point of the chain.
 */
export const CATEGORY_STAGE_ADVICE = Object.freeze({});

/**
 * Resolve what, if anything, to show.
 *
 * @param {object}  arg
 * @param {object=} arg.cropDef  crop_definitions row — needs `name`, `category`, `grower_notes`
 * @param {object=} arg.variety  varieties row (reserved — no variety layer yet)
 * @param {string=} arg.stage    seed | seedling | vegetative | flowering | fruiting | harvesting
 * @returns {{layer: string|null, heading: string|null, items: string[], text: string|null}}
 */
export function resolveStageGuidance({ cropDef, variety, stage } = {}) {
  const none = { layer: null, heading: null, items: [], text: null };
  if (!cropDef) return none;

  // 1. observation — not built (V053+)
  // 2. variety     — not built (V014/V015). `variety` is accepted now so the
  //                  call sites do not change when it arrives.

  // 3. crop
  const byCrop = stage && CROP_STAGE_ADVICE[cropDef.name]?.[stage];
  if (byCrop?.length) {
    return { layer: "crop", heading: "What to do right now", items: [...byCrop], text: null };
  }

  // 4. category
  const byCategory = stage && CATEGORY_STAGE_ADVICE[cropDef.category]?.[stage];
  if (byCategory?.length) {
    return { layer: "category", heading: "What to do right now", items: [...byCategory], text: null };
  }

  // 5. the crop's own notes.
  //
  // Heading is deliberately DIFFERENT. grower_notes is crop-specific but
  // stage-agnostic — "Do not add fresh manure — causes forking" is true of
  // carrots always, not of carrots today. Presenting it under "What to do right
  // now" would be a smaller version of the same overclaim this fix removes.
  const notes = typeof cropDef.grower_notes === "string" ? cropDef.grower_notes.trim() : "";
  if (notes) {
    return { layer: "grower_notes", heading: "Growing notes", items: [], text: notes };
  }

  // 6. silence
  return none;
}
