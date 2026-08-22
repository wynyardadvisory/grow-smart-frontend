/**
 * How a planting ends — client wording and flow.
 *
 * The canonical vocabulary lives in the API (`planting-ending.js`) and is served
 * by `/plantings/:id/ending/question`. This module holds only what the client
 * needs to render before that round-trip, and the wording, which is deliberately
 * separate from the stored codes so it can be tuned without a migration.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE
 *
 * 1. `neglect` never reaches a screen. The API keeps the code for compatibility
 *    with 18 real rows; the gardener sees "Didn't get to it". The product does
 *    not tell someone they neglected their garden.
 *
 * 2. One question, never two. The surface has already established one axis —
 *    "Finished harvesting" fixes the mechanism, "It didn't come to anything"
 *    fixes the verdict — so only the unknown one is asked.
 */

export const OUTCOME = Object.freeze({
  GOOD: "good", SOME: "some", NOTHING: "nothing", UNKNOWN: "unknown",
});

export const END_REASON = Object.freeze({
  HARVESTED_OUT: "harvested_out", SEASON_ENDED: "season_ended", CLEARED: "cleared",
  NEVER_ESTABLISHED: "never_established", LOST_PEST: "lost_pest",
  LOST_DISEASE: "lost_disease", LOST_WEATHER: "lost_weather",
  LOST_WATER: "lost_water", BOLTED: "bolted", UNATTENDED: "unattended",
  UNKNOWN: "unknown",
});

/** The verdict, asked once the mechanism is already known. */
export const VERDICT_OPTIONS = [
  { key: OUTCOME.GOOD,    label: "Good crop" },
  { key: OUTCOME.SOME,    label: "Some, but not much" },
  { key: OUTCOME.NOTHING, label: "Nothing really" },
];

/** How it finished, asked from the crop card where nothing is established yet. */
export const MECHANISM_OPTIONS = [
  { key: "picked_it_all",    label: "I picked it all",
    sets: { end_reason: END_REASON.HARVESTED_OUT }, then: "verdict" },
  { key: "gave_some",        label: "It gave me some",
    sets: { end_reason: END_REASON.HARVESTED_OUT, outcome: OUTCOME.SOME }, then: null },
  { key: "came_to_nothing",  label: "It didn't come to anything",
    sets: { outcome: OUTCOME.NOTHING }, then: "loss_reason" },
  { key: "cleared",          label: "I cleared it to make room",
    sets: { end_reason: END_REASON.CLEARED }, then: "verdict" },
];

/**
 * What got it. Offered only after "it didn't come to anything", never required.
 *
 * Grown from what real gardeners actually chose: 15% of 100 recorded failures
 * were "other" because there was no "didn't come up", no "bolted" and nowhere
 * to say a crop made way for something else.
 */
export const LOSS_OPTIONS = [
  { key: END_REASON.NEVER_ESTABLISHED, label: "Didn't come up" },
  { key: END_REASON.LOST_PEST,         label: "Pests" },
  { key: END_REASON.LOST_DISEASE,      label: "Disease" },
  { key: END_REASON.LOST_WEATHER,      label: "Weather" },
  { key: END_REASON.LOST_WATER,        label: "Ran out of water" },
  { key: END_REASON.BOLTED,            label: "Bolted" },
  // NEVER "Neglect". The gardener volunteers this; the product does not accuse.
  { key: END_REASON.UNATTENDED,        label: "Didn't get to it" },
  { key: END_REASON.UNKNOWN,           label: "Not sure" },
];

export const OUTCOME_LABEL = Object.freeze({
  [OUTCOME.GOOD]: "Good crop", [OUTCOME.SOME]: "Some, but not much",
  [OUTCOME.NOTHING]: "Nothing really", [OUTCOME.UNKNOWN]: "Not sure",
});

export const REASON_LABEL = Object.freeze({
  [END_REASON.HARVESTED_OUT]: "Picked it all",
  [END_REASON.SEASON_ENDED]: "Season over",
  [END_REASON.CLEARED]: "Made way for something else",
  [END_REASON.NEVER_ESTABLISHED]: "Didn't come up",
  [END_REASON.LOST_PEST]: "Pests",
  [END_REASON.LOST_DISEASE]: "Disease",
  [END_REASON.LOST_WEATHER]: "Weather",
  [END_REASON.LOST_WATER]: "Ran out of water",
  [END_REASON.BOLTED]: "Bolted",
  [END_REASON.UNATTENDED]: "Didn't get to it",
  [END_REASON.UNKNOWN]: "Not sure",
});

/** "Good crop, then cleared for space" — both facts, one line, no repetition. */
export function endingSummary({ verdict, reason }) {
  const v = verdict && verdict !== OUTCOME.UNKNOWN ? OUTCOME_LABEL[verdict] : null;
  const mechanical = reason === END_REASON.CLEARED || reason === END_REASON.SEASON_ENDED;
  const r = reason && reason !== END_REASON.UNKNOWN ? REASON_LABEL[reason] : null;

  if (v && r && mechanical) return `${v}, then ${r.toLowerCase()}`;
  // "Nothing really · Pests" reads better than a sentence, and the cause is
  // already implied by the verdict for a loss.
  if (v && r && verdict === OUTCOME.NOTHING) return `${v} · ${r}`;
  return v || r || "Ending not recorded";
}

/** Dates a gardener actually thinks in. Never a bare ISO string. */
export function formatDay(iso) {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatSpan(start, end) {
  const a = formatDay(start), b = formatDay(end);
  if (a && b) return `${a} → ${b}`;
  if (a) return `Sown ${a}`;
  return null;
}
