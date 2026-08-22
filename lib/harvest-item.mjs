/**
 * THE HARVEST ITEM — one shape, fixed at the boundary
 * ─────────────────────────────────────────────────────────────────────────────
 * Two screens opened the same harvest modal with two different objects.
 *
 *   Today  — spreads a /dashboard forecast item: { crop_name, variety,
 *            crop_instance_id, window_start, window_end, phase, certainty }
 *   Crops  — hand-builds { crop, variety, crop_instance_id }
 *
 * HarvestModal read `item.crop` in nine places. On the Today path every one was
 * undefined, so the modal's subtitle and its "Harvest logged!" confirmation both
 * rendered a BLANK crop name, `crop_name` was dropped from the POST body by
 * JSON.stringify, and all six harvest analytics events emitted crop_name: null.
 * It survived because the Crops path — the one anybody testing by hand tends to
 * use — was correct.
 *
 * The fix is not nine reads changed to `item.crop ?? item.crop_name`. That is a
 * shim, and a shim is a licence for a third caller to invent a fourth spelling.
 * Both callers normalise INTO this contract, the modal reads nothing else, and
 * the field `crop` ceases to exist so it cannot come back.
 *
 * DISPLAY IDENTITY IS NOT ANALYTICS IDENTITY
 *
 * /dashboard composes crop_name as `${name} (Sow ${succession_index})` — a
 * presentation string in a data field. Sent to PostHog it splits one crop into
 * "Mint", "Mint (Sow 1)", "Mint (Sow 2)"… so no crop can be measured. Shown to a
 * gardener with a single sowing it is machine notation. Shown to one running
 * four successions it is the only way to tell which row is which.
 *
 * So the two identities are separated rather than traded off: analyticsName is
 * always the bare crop, and the succession label travels beside it for the UI to
 * use when — and only when — it disambiguates something.
 */

/** Legacy composite: "Mint (Sow 2)". Requires the literal word Sow and digits, so
 *  a variety name that legitimately contains brackets is left alone. */
const SUCCESSION_SUFFIX = /^(.*?)\s*\(Sow\s+(\d+)\)$/;

/**
 * Normalise whatever a caller has into the one shape the harvest flow consumes.
 *
 * @param {object} source  a /dashboard harvest_forecast item, or a crop row
 * @param {object} [overrides]  caller intent, e.g. { presetFinal: false }
 */
export function toHarvestItem(source, overrides = {}) {
  const s = source || {};

  // Prefer the decomposed fields the API now sends. Fall back to parsing the
  // composite, because an installed native build or a cached response may still
  // carry only crop_name — reading a legacy wire format is not the same thing
  // as keeping two internal spellings alive.
  let displayName = s.name ?? null;
  let successionIndex = s.succession_index ?? null;

  if (!displayName) {
    const composite = s.crop_name ?? s.crop ?? null;
    if (composite) {
      const m = SUCCESSION_SUFFIX.exec(String(composite));
      if (m) { displayName = m[1]; successionIndex = successionIndex ?? Number(m[2]); }
      else   { displayName = String(composite); }
    }
  }

  return {
    cropInstanceId: s.crop_instance_id ?? s.id ?? null,

    // What the gardener is shown. Never carries engine notation.
    displayName,

    // "Sow 2", or null. Rendered only where several sowings are in play — the
    // gardener needs to know WHICH carrot, not that a database has an index.
    successionLabel: successionIndex != null ? `Sow ${successionIndex}` : null,
    successionIndex: successionIndex ?? null,

    // The stable analytics dimension. Bare crop name, always, so one crop is one
    // series in PostHog whatever its succession.
    analyticsName: displayName,

    variety: s.variety ?? null,

    // Carried, never inferred. null means unknown — the modal's copy currently
    // hedges both ways in one sentence because it has never been told which.
    isPerennial: s.is_perennial ?? null,

    // null means ASK. Today presets this from "Picked some" / "Finished
    // harvesting"; Crops does not, and inherited `?? true` — silently
    // pre-selecting *final*, the choice that closes a crop.
    presetFinal: s.presetFinal ?? null,

    harvestWindow: (s.window_start || s.window_end || s.phase)
      ? { start: s.window_start ?? null, end: s.window_end ?? null, phase: s.phase ?? null }
      : null,

    ...overrides,
  };
}

/** The subtitle line: "Mint · Sow 2 — Moroccan", omitting whatever is absent. */
export function harvestItemLabel(item, { withSuccession = true } = {}) {
  if (!item?.displayName) return "";
  const head = withSuccession && item.successionLabel
    ? `${item.displayName} · ${item.successionLabel}`
    : item.displayName;
  return item.variety ? `${head} — ${item.variety}` : head;
}

// ── quantity display ────────────────────────────────────────────────────────
//
// Mirrors formatHarvestQuantity/formatHarvestTotal in the API's
// harvest-quantity.js, which owns the canonical contract. This side only ever
// FORMATS what the API has already resolved — it never converts a unit, because
// two implementations of a conversion are two chances to disagree.

/**
 * Render one persisted harvest quantity.
 *
 * Reads the canonical columns and never invents a unit. Five display sites used
 * to append "g" to whatever number they found: `{quantity_g}g{units}` printed
 * "650g · g", and the summary rows ignored the unit entirely.
 *
 * @returns {string|null} null when the harvest carries no quantity at all.
 */
export function formatHarvestQuantity(row) {
  if (!row) return null;
  const { quantity_grams, quantity_count, quantity_entered_value, quantity_entered_unit } = row;

  // The API can send it pre-formatted; prefer that, so one string is produced in
  // one place.
  if (row.quantity_display != null) return row.quantity_display || null;

  if (quantity_count != null) {
    const n = Number(quantity_count);
    if (quantity_entered_unit === "bunch") return `${n} ${n === 1 ? "bunch" : "bunches"}`;
    return `${n} ${n === 1 ? "item" : "items"}`;
  }

  if (quantity_grams != null) {
    // Show it back in the unit it was given in. The gardener said 2.5 kg; 2500 g
    // is the same mass and a different sentence.
    if (quantity_entered_value != null && quantity_entered_unit) {
      const raw = String(quantity_entered_value);
      // numeric(10,3) arrives as "2.500". Trim the padding, but ONLY after a
      // decimal point — a blanket trailing-zero strip turns "500" into "5".
      const trimmed = raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
      return `${trimmed} ${quantity_entered_unit}`;
    }
    const g = Number(quantity_grams);
    return g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)} kg` : `${g} g`;
  }

  // Legacy row: a number whose unit was never captured (194 of them, 28 users).
  // It is evidence that a harvest happened and no evidence at all about weight,
  // so it must never render as grams.
  if (row.quantity_g != null) return `${row.quantity_g} — unit not recorded`;

  return null;
}

/** Whether this row's quantity has a known dimension. */
export function hasKnownQuantity(row) {
  return !!row && (row.quantity_grams != null || row.quantity_count != null);
}

/**
 * Render a season total. Never adds unlike dimensions: "14 bulbs + 900 g" is
 * two facts, and summing them into "914g" is how the old total_quantity_g read.
 */
export function formatHarvestTotal({ total_quantity_grams, total_quantity_count } = {}) {
  const parts = [];
  if (total_quantity_grams != null) {
    parts.push(total_quantity_grams >= 1000
      ? `${(total_quantity_grams / 1000).toFixed(total_quantity_grams % 1000 === 0 ? 0 : 1)} kg`
      : `${total_quantity_grams} g`);
  }
  if (total_quantity_count != null) {
    parts.push(`${total_quantity_count} ${total_quantity_count === 1 ? "item" : "items"}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Units the harvest form offers, and the input step each one deserves. */
export const HARVEST_UNITS = [
  { value: "kg",     label: "kg",     step: "0.01" },
  { value: "g",      label: "g",      step: "1"    },
  { value: "number", label: "number", step: "1"    },
  { value: "bunch",  label: "bunch",  step: "1"    },
];

export const isCountUnit = (u) => u === "number" || u === "bunch";
