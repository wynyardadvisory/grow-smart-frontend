/**
 * The words Vercro says to a gardener.
 *
 * WHY THIS EXISTS
 *
 * On 22 August a terminology audit of the live product found **eleven** phrasings
 * of "it is ready or nearly ready" — Harvest approaching · Harvest window · In
 * harvest window · Near harvest · Ready to harvest · Harvest expected · Harvest
 * now expected · Expected harvest · Harvest forecast · Harvest Now · Ready soon
 * — and `Failed` rendering on the crop rail for a crop lost to slugs, three
 * years after the product decided it does not blame gardeners.
 *
 * The founder, who designed the product, could no longer reliably distinguish
 * harvest from final harvest from finished from season finished from dormant.
 * That is the strongest possible evidence that the state machine had reached the
 * surface.
 *
 * THE RULE
 *
 * One concept, one phrase, defined here. A string a gardener can read comes from
 * this file. Internal state names — `ended_undated`, `harvest_season_closed_at`,
 * `end_state`, `record_type`, `concern`, `active` — may never surface.
 *
 * WHAT THIS IS NOT
 *
 * This is not a plain-English pass over gardening. `dormant`, `sow`, `harvest`,
 * `bolted`, `mulch` and `prune` are real gardening words that gardeners use and
 * expect, and they stay. We are removing Vercro's vocabulary, not the craft's.
 */

/** One phrase per point in a plant's life. Derived phases, never stored. */
export const PHASE = Object.freeze({
  not_sown:            "Not yet sown",
  establishing:        "Growing",
  growing:             "Growing",
  developing:          "Growing",
  harvest_approaching: "Nearly ready",
  // NOT "Ready to pick". Both of these are ESTIMATES from days-to-maturity, and
  // the product may not assert a readiness it has not observed. The lifecycle
  // contract has always said it: "a crop past its window asks, it does not
  // declare the crop over." A first draft of this vocabulary collapsed both to
  // "Ready to pick" and the contract test caught it.
  harvest_window:      "Should be ready",
  check_now:           "Should be ready — worth checking",
  dormant:             "Dormant",
  harvested:           "Finished",
  // Never "Failed". A crop eaten by slugs did not fail an exam; it didn't work
  // out. Three vocabularies used to blame the gardener here and all three are
  // gone — this is the last of them.
  failed:              "Didn't work out",
  unknown:             "Stage not known",
});

/**
 * Readiness, wherever it is said.
 *
 * `harvest_approaching` and `harvest_window` used to be four and seven phrasings
 * respectively, depending on which screen you were on.
 */
export const READY = Object.freeze({
  not_yet:  "Not ready yet",
  nearly:   "Nearly ready",
  // Hedged, because it is derived from days-to-maturity and nobody has looked.
  ready:    "Should be ready",
  check:    "Should be ready — worth checking",
  // Only where something actually looked at the plant — a Plant Check photo.
  observed: "Looks ready",
  forecast: "Ready soon",
});

/** Picking. The gardener says how much, never which database flag. */
export const PICKING = Object.freeze({
  some:       "Picked some",
  last:       "Last pick",
  some_saved: "Picked some — saved",
  last_saved: "Last pick — saved",
  action:     "Pick now",
});

/** How a planting's time ended, and how the record describes it. */
export const ENDING = Object.freeze({
  finished:      "Finished",
  unrecorded:    "Finished — you haven't said how",
  cleared:       "Cleared",
  season_closed: "Done for this year",
  in_the_garden: "In the garden",
});

/** Things worth a look. Never "watch out" as a noun. */
export const CHECKING = Object.freeze({
  heading: "Worth checking",
  one:     "Worth checking",
});

/**
 * Terms that must never reach a gardener, and what to say instead.
 *
 * Asserted against every user-facing source file, not against this module — a
 * guarantee that only holds where it is measured is not a guarantee, which is
 * how `Failed` survived on the crop rail while a test asserted it could not.
 */
export const BANNED = Object.freeze([
  { term: "Mark as failed",   instead: "This one's finished" },
  { term: "Neglect",          instead: "Didn't get to it" },
  { term: "Partial harvest",  instead: "Picked some" },
  { term: "Final harvest",    instead: "Last pick" },
  { term: "Watch out",        instead: "Worth checking" },
  { term: "Season closed",    instead: "Done for this year" },
  { term: "Active crops",     instead: "In the garden" },
  { term: "Harvest window",   instead: "Should be ready" },
  { term: "Near harvest",     instead: "Nearly ready" },
  { term: "Harvest approaching", instead: "Nearly ready" },
  { term: "Ready to harvest", instead: "Should be ready" },
]);

/** Gardening words that are correct and must survive any simplification pass. */
export const KEEP = Object.freeze([
  "dormant", "sow", "sown", "harvest", "bolted", "mulch", "prune", "seedling",
  "germinating", "transplant", "compost",
]);
