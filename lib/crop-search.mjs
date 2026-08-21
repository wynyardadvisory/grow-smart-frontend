/**
 * V015b — Add Crop selection.
 *
 * CropSearchInput's blur handler defers its free-text fallback by 150ms so a
 * dropdown mousedown can land first. That timeout used to close over `query`
 * and `value` as they were when the handler was created — i.e. BEFORE any
 * selection.
 *
 * Tapping "Cabbage" therefore ran, 150ms later, with the stale pair
 * (query "cab", value null), took the fallback branch, and replaced the real
 * selection with { id: "__other__", name: "cab" }. The visible field fell back
 * to "cab" while a value was still set — which is why the variety field
 * appeared but the crop name did not, and why selecting a second time worked
 * (by then `value` was non-null, so the stale guard no longer passed).
 *
 * Reported by two customers in March and April 2026; confirmed still live on
 * 21 August 2026 against the production demo account.
 *
 * This lives in lib/ rather than inline so the decision is testable on its own.
 * The component must call it with CURRENT state (via refs), never with values
 * captured when the handler was created.
 */

/**
 * Should the blur handler convert whatever was typed into a free-text crop?
 *
 * @param {{ query?: string, value?: object|null }} state CURRENT state, not captured state
 * @returns {boolean} true only when the user typed something and selected nothing
 */
export function shouldApplyFreeTextFallback(state) {
  const query = state?.query;
  const value = state?.value;
  if (typeof query !== "string") return false;
  if (!query.trim()) return false;   // nothing typed — nothing to fall back to
  if (value) return false;           // a real selection exists — never overwrite it
  return true;
}

/** The shape written when the fallback does apply. */
export function freeTextCrop(query) {
  return { id: "__other__", name: String(query ?? "").trim() };
}
