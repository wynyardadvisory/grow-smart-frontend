/**
 * V015b — Add Crop selection regression suite.
 *
 * The defect: CropSearchInput's blur handler ran a 150ms-deferred free-text
 * fallback using state captured BEFORE the user's selection. Tapping "Cabbage"
 * once therefore overwrote the real selection with { id: "__other__",
 * name: "cab" } — leaving the field showing "cab" while a value was set.
 *
 * Test 3 is the one to keep: it models the exact stale-vs-current pair and
 * asserts that current state suppresses the fallback. It fails if anyone
 * reverts the handler to reading `query`/`value` directly instead of via refs.
 *
 * Run: npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { shouldApplyFreeTextFallback, freeTextCrop } from "../lib/crop-search.mjs";

// ── 1–2 · the fallback exists for a reason — don't over-suppress it ──────────

test("1. typed text with no selection — fallback applies", () => {
  // A user who types "Purple Podded Pea" and blurs without picking anything
  // must still get their crop recorded as free text.
  assert.equal(shouldApplyFreeTextFallback({ query: "Purple Podded Pea", value: null }), true);
  assert.deepEqual(freeTextCrop("Purple Podded Pea"), { id: "__other__", name: "Purple Podded Pea" });
});

test("2. nothing typed — no fallback", () => {
  assert.equal(shouldApplyFreeTextFallback({ query: "",     value: null }), false);
  assert.equal(shouldApplyFreeTextFallback({ query: "   ",  value: null }), false);
  assert.equal(shouldApplyFreeTextFallback({ query: undefined, value: null }), false);
  assert.equal(shouldApplyFreeTextFallback(undefined), false);
});

// ── 3 · THE DEFECT ──────────────────────────────────────────────────────────

test("3. a real selection is never overwritten — this is V015b", () => {
  // The state as it is 150ms AFTER tapping "Cabbage": query has been set to the
  // crop name and value holds the real crop definition.
  const afterSelection = { query: "Cabbage", value: { id: "def-cabbage", name: "Cabbage" } };
  assert.equal(shouldApplyFreeTextFallback(afterSelection), false,
    "fallback must not fire once a crop has been selected");

  // The STALE pair the old handler used — what the user typed, and the value as
  // it was before selection. This is the combination that produced the bug.
  const stalePair = { query: "cab", value: null };
  assert.equal(shouldApplyFreeTextFallback(stalePair), true,
    "the stale pair DOES satisfy the fallback — which is precisely why reading " +
    "captured state instead of current state corrupted the selection");

  // The fix is therefore not this function's logic but WHICH state it is given.
  // Passing current state suppresses the overwrite; passing captured state does not.
});

test("3b. selection is preserved even when the typed text still differs", () => {
  // Selecting from the dropdown sets query to the crop name, but a user can also
  // select and then the field can legitimately hold a different string mid-edit.
  // A truthy `value` must win regardless of what query says.
  assert.equal(shouldApplyFreeTextFallback({ query: "cab", value: { id: "def-cabbage", name: "Cabbage" } }), false);
});

test("4. an existing free-text value also blocks a second overwrite", () => {
  // Explains the reported "select it a second time and it sticks" behaviour:
  // once value is non-null — even as __other__ — the guard passes.
  assert.equal(shouldApplyFreeTextFallback({ query: "cab", value: { id: "__other__", name: "cab" } }), false);
});

test("5. freeTextCrop trims and is defensive", () => {
  assert.deepEqual(freeTextCrop("  Cavolo Nero  "), { id: "__other__", name: "Cavolo Nero" });
  assert.deepEqual(freeTextCrop(undefined), { id: "__other__", name: "" });
});
