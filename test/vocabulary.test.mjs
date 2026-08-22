/**
 * The language guarantees, asserted where the gardener actually meets them.
 *
 * WHY THIS FILE SCANS SOURCE RATHER THAN A MODULE
 *
 * Garden Memory P1a shipped two language guarantees with tests: `neglect`
 * appears in no user-facing string, and no user-facing string uses "fail". Both
 * passed continuously. Both were false.
 *
 * They asserted against `lib/planting-ending.mjs` — a module the UI can simply
 * bypass. Meanwhile `PHASE_LABEL.failed = "Failed"` rendered on the crop rail in
 * production, and a whole "Mark as failed" sheet with a **Neglect** button sat in
 * the shipped bundle. A guarantee that only holds where it is measured is not a
 * guarantee.
 *
 * So this scans every file that can put words on a screen, with comments
 * stripped — comments are where this codebase explains itself, including why a
 * banned term is banned, and they must stay sayable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BANNED, KEEP, PHASE, READY, PICKING, ENDING } from "../lib/vocabulary.mjs";

// Every file that can render text to a gardener.
const SURFACES = [
  "pages/index.js", "pages/_app.js", "pages/_document.js",
  "lib/vocabulary.mjs", "lib/planting-ending.mjs", "lib/harvest-item.mjs",
  "components/Brand.js",
].filter(f => fs.existsSync(path.join(process.cwd(), f)));

/**
 * Comments explain the code, including why a banned term is banned, so they are
 * stripped. Newlines inside them are preserved — a reported line number that
 * does not match the file is worse than no line number.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/([^:"'`\\])\/\/[^\n"'`]*$/gm, "$1");
}

/**
 * Uses of a banned term that are not the product speaking.
 *
 * Every entry needs a reason. The point is not to make the test pass; it is that
 * an exception must be argued for and visible, which is exactly what did not
 * happen when `Failed` sat on the crop rail for months.
 */
const ALLOWED = [
  { file: "lib/vocabulary.mjs", why: "defines the bans; it must be able to name them" },
  { match: /action\.includes\(/, why: "matches server-generated action text, not display copy" },
  { match: /state\s*[=!]==?\s*"failed"|state\s*=\s*"failed"/, why: "image-cache state, never rendered" },
  { match: /funnel\.|admin|metrics/i, why: "admin metrics screen — Mark's own instrumentation, not gardener copy" },
];
const allowed = (file, line) =>
  ALLOWED.some(a => (a.file && file === a.file) || (a.match && a.match.test(line)));

const CODE = SURFACES.map(f => ({
  file: f,
  src: stripComments(fs.readFileSync(path.join(process.cwd(), f), "utf8")),
}));

const findAll = (needle) => {
  const hits = [];
  for (const { file, src } of CODE) {
    const lines = src.split("\n");
    lines.forEach((ln, i) => {
      if (!ln.toLowerCase().includes(needle.toLowerCase())) return;
      if (allowed(file, ln)) return;
      hits.push(`${file}:${i + 1}  ${ln.trim().slice(0, 90)}`);
    });
  }
  return hits;
};

test("1. every surface file is actually being scanned", () => {
  assert.ok(SURFACES.includes("pages/index.js"), "the file holding the whole app must be covered");
  assert.ok(CODE.every(c => c.src.length > 0));
});

test("2. no banned term reaches a gardener, on any surface", () => {
  const failures = [];
  for (const { term, instead } of BANNED) {
    const hits = findAll(term);
    if (hits.length) failures.push(`"${term}" (say "${instead}") →\n    ${hits.join("\n    ")}`);
  }
  assert.equal(failures.length, 0, "\n" + failures.join("\n"));
});

test("3. the product never tells a gardener they failed", () => {
  // The specific regression: PHASE_LABEL.failed rendered "Failed" for a crop
  // lost to slugs while a test asserted this could not happen.
  // Case-sensitive on the display forms: `state === "failed"` is an image cache,
  // `"Failed"` is a label a gardener reads.
  const hits = [];
  for (const { file, src } of CODE) {
    src.split("\n").forEach((ln, i) => {
      if (allowed(file, ln)) return;
      if (/"Failed"|'Failed'|>\s*Failed\s*<|"Neglect"|>\s*Neglect\s*</.test(ln)) hits.push(`${file}:${i + 1}  ${ln.trim().slice(0, 90)}`);
    });
  }
  assert.equal(hits.length, 0, "\n  " + hits.join("\n  "));
  assert.equal(PHASE.failed, "Didn't work out");
});

test("4. `neglect` appears in no gardener-facing string anywhere", () => {
  const hits = [];
  for (const { file, src } of CODE) {
    if (file === "lib/vocabulary.mjs") continue;
    for (const m of src.matchAll(/["'`]([^"'`\n]{2,80})["'`]/g)) {
      if (/neglect/i.test(m[1])) hits.push(`${file}: ${m[1]}`);
    }
  }
  assert.equal(hits.length, 0, "\n  " + hits.join("\n  "));
});

test("5. the legacy failure endpoint is no longer called from the client", () => {
  const hits = findAll("/fail");
  assert.equal(hits.length, 0, "\n  " + hits.join("\n  "));
});

test("6. one phrase per state of readiness, and none of them asserts", () => {
  // Eleven phrasings on 22 August. Now four, each meaning something different.
  assert.equal(READY.nearly, "Nearly ready");
  assert.equal(PHASE.harvest_approaching, READY.nearly);
  assert.equal(PHASE.harvest_window, READY.ready);
  assert.equal(PHASE.check_now, READY.check);
});

test("6b. a readiness the product has not observed is never asserted", () => {
  // The lifecycle contract: "a crop past its window asks, it does not declare
  // the crop over." days-to-maturity proves time has passed, never that a crop
  // is ready — so the estimate-driven phrases hedge and only the phrase used
  // after something LOOKED at the plant may claim.
  assert.match(PHASE.harvest_window, /should be/i);
  assert.match(PHASE.check_now, /worth checking/i);
  assert.equal(READY.observed, "Looks ready", "reserved for Plant Check, which sees the plant");
  for (const p of [PHASE.harvest_window, PHASE.check_now, READY.ready]) {
    assert.doesNotMatch(p, /^Ready\b/, `"${p}" asserts a readiness nobody observed`);
  }
});

test("7. picking says how much was picked, not which flag was set", () => {
  assert.equal(PICKING.some, "Picked some");
  assert.equal(PICKING.last, "Last pick");
  assert.doesNotMatch(PICKING.some + PICKING.last, /partial|final/i);
});

test("8. a perennial's year ends in the gardener's words", () => {
  assert.equal(ENDING.season_closed, "Done for this year");
  assert.doesNotMatch(ENDING.season_closed, /season closed|dormant|closed/i);
});

test("9. an unexplained ending says so, and is distinct from a recorded one", () => {
  assert.notEqual(ENDING.unrecorded, ENDING.finished);
  assert.match(ENDING.unrecorded, /haven't said how/);
});

test("10. real gardening language survives the simplification", () => {
  // The pass removes Vercro's vocabulary, not the craft's. `dormant` is what a
  // gardener calls a fruit tree in January and it stays.
  assert.equal(PHASE.dormant, "Dormant");
  const src = CODE.map(c => c.src).join("\n").toLowerCase();
  for (const w of ["dormant", "sow", "harvest", "mulch", "prune"]) {
    assert.ok(src.includes(w), `${w} must survive`);
  }
  assert.ok(KEEP.includes("dormant") && KEEP.includes("bolted"));
});

test("11. no internal state name is written as a gardener-facing string", () => {
  const internal = ["ended_undated", "ended_unrecorded", "harvest_season_closed_at",
                    "end_state", "record_type", "bulk_completable", "crop_instance_id"];
  const hits = [];
  for (const { file, src } of CODE) {
    for (const m of src.matchAll(/["'`]([^"'`\n]{4,90})["'`]/g)) {
      const v = m[1];
      // A bare identifier is a key or a comparison; a sentence containing one is copy.
      if (internal.includes(v.trim())) continue;
      if (internal.some(t => v.includes(t)) && /\s/.test(v.trim())) hits.push(`${file}: ${v}`);
    }
  }
  assert.equal(hits.length, 0, "\n  " + hits.join("\n  "));
});
