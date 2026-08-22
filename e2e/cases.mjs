/**
 * 3B3c acceptance cases — driven through the real product UI.
 *
 * Run:  HEADED=1 node e2e/cases.mjs <case>
 *
 * HEADED=1 is REQUIRED. posthog-js will not transmit from a headless browser,
 * so a headless run records zero analytics — which looks exactly like the
 * attribution defect under test. Diagnosed by wrapping posthog.capture in the
 * page: the product called it correctly every time while nothing left the
 * browser.
 */
import fs from "fs";
import { withApp, text, modalState, clickButton, clickIfPresent, navigateTab,
         analyticsFor, apiFor, report, flushAnalytics } from "./harvest-acceptance.mjs";

const CASE = process.argv[2];

// A tiny real PNG, written to a temp file for the file input. 1x1, valid.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");
function pngPath(name) {
  const p = `/tmp/vercro-acceptance-${name}.png`;
  fs.writeFileSync(p, PNG);
  return p;
}

/** Open the harvest modal from Today. `which` presets finality. */
async function openFromToday(page, which) {
  await clickButton(page, which);
  await page.waitForTimeout(1000);
}

/** Expand the optional enrichment disclosure. */
async function openEnrichment(page) {
  const btn = page.locator('button:has-text("Add weight, notes or a rating")').first();
  await btn.click();
  await page.waitForTimeout(500);
}

async function setQuantity(page, value, unit) {
  await openEnrichment(page);
  await page.locator('input[type="number"]').first().fill(String(value));
  await page.locator("select").first().selectOption(unit);
  await page.waitForTimeout(300);
}

async function attachPhoto(page, name) {
  // Scoped to the harvest sheet's own label. The page carries more than one
  // image input, and `.first()` silently picked a different one — the harvest
  // saved with has_photo:false and no photo call, which reads exactly like a
  // product failure. It was the selector.
  const input = page.locator('label:has-text("Show Vercro your harvest") input[type="file"]').first();
  await input.setInputFiles(pngPath(name));
  await page.waitForTimeout(1500);
}

/**
 * Save, then WAIT FOR THE CONFIRMATION rather than a fixed delay.
 *
 * A final harvest re-runs the rule engine server-side and can take far longer
 * than a partial. A fixed 4s wait closed the browser mid-flight on the first
 * perennial run: the request was aborted, no row was written, and the case
 * looked like a silent product failure when it was the harness giving up.
 */
async function save(page, timeout = 45000) {
  await clickButton(page, "Save harvest");
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const m = await modalState(page);
    if (m && /(Harvest logged!|Partial harvest logged!|Harvest undone)/.test(m.text)) {
      await page.waitForTimeout(1500);   // let the trailing photo/analytics land
      return true;
    }
    if (m && /Something went wrong|Couldn't save/.test(m.text)) return false;
    // The CROPS tab's onSaved calls setPendingHarvest(null), which unmounts the
    // sheet the moment the save resolves — so there is no confirmation screen
    // there at all, and no Undo button. Treat the sheet disappearing as a
    // completed save rather than hanging until timeout.
    if (!m) { await page.waitForTimeout(1500); return "closed"; }
    await page.waitForTimeout(1000);
  }
  throw new Error("save did not confirm within " + timeout + "ms");
}

/** Everything the reconciliation needs from one run. */
function summarise(rec, extra = {}) {
  const post = apiFor(rec, "POST", /^\/harvest-log$/)[0] || null;
  const photo = apiFor(rec, "POST", /^\/harvest-log\/.*\/photo$/)[0] || null;
  const del = apiFor(rec, "DELETE", /^\/harvest-log\//)[0] || null;
  return {
    ...extra,
    api: {
      post: post && { status: post.status, request: post.requestBody, response: post.responseBody },
      photo: photo && { status: photo.status, request: photo.requestBody, response: photo.responseBody },
      delete: del && { status: del.status, response: del.responseBody },
    },
    analytics: rec.analytics
      .filter(e => e.event.startsWith("harvest"))
      .map(e => ({ event: e.event, props: e.properties })),
    analyticsOrder: rec.analytics.filter(e => e.event.startsWith("harvest")).map(e => e.event),
    consoleErrors: rec.consoleErrors,
    pageErrors: rec.pageErrors,
  };
}

const CASES = {
  // ── 1, 11, 12, 13, 14 — capture-first, nothing invented ──────────────────
  async "1-no-enrichment"({ page, rec }) {
    const before = await modalStateAfter(page, "Picked some");
    await save(page);
    const after = await modalState(page);
    return summarise(rec, { modalOnOpen: before, modalAfterSave: after?.text });
  },

  // ── 2 — quantity only, the decimal-kg case that used to 500 ──────────────
  async "2-quantity-only"({ page, rec }) {
    const before = await modalStateAfter(page, "Picked some");
    await setQuantity(page, "2.5", "kg");
    const withQty = await modalState(page);
    await save(page);
    return summarise(rec, {
      modalOnOpen: before,
      quantityStep: withQty?.quantityStep,
      unitOptions: withQty?.unitOptions,
      slidersUntouched: withQty?.sliders,
      sliderDisplay: withQty?.sliderDisplay,
      modalAfterSave: (await modalState(page))?.text,
    });
  },

  // ── 3 + 6 — photo persists, and survives the read path ───────────────────
  async "3-harvest-plus-photo"({ page, rec }) {
    await modalStateAfter(page, "Picked some");
    await attachPhoto(page, "case3");
    await save(page);
    return summarise(rec, { modalAfterSave: (await modalState(page))?.text });
  },

  // ── 4 — both pathways together, neither interfering ──────────────────────
  async "4-quantity-plus-photo"({ page, rec }) {
    await modalStateAfter(page, "Picked some");
    await setQuantity(page, "500", "g");
    await attachPhoto(page, "case4");
    await save(page);
    return summarise(rec, { modalAfterSave: (await modalState(page))?.text });
  },

  // ── 5 — a REAL forced failure on the link write ──────────────────────────
  async "5-photo-failure"({ page, rec }) {
    // Fail the photo endpoint at the network edge. The harvest POST is
    // untouched, so this exercises the real client path: harvest saved, photo
    // not. Synthetic in the sense that the failure is injected; the product's
    // handling of it is entirely real.
    await page.route("**/harvest-log/*/photo", route =>
      route.fulfill({ status: 500, contentType: "application/json",
                      body: JSON.stringify({ error: "Photo uploaded but could not be linked to the harvest" }) }));
    await modalStateAfter(page, "Picked some");
    await attachPhoto(page, "case5");
    await save(page);
    await page.waitForTimeout(2000);
    return summarise(rec, { modalAfterSave: (await modalState(page))?.text });
  },

  // ── 7 — partial keeps the crop alive ─────────────────────────────────────
  async "7-partial"({ page, rec }) {
    const m = await modalStateAfter(page, "Picked some");
    await save(page);
    return summarise(rec, { modalOnOpen: m, modalAfterSave: (await modalState(page))?.text });
  },

  // ── count dimension ──────────────────────────────────────────────────────
  async "2b-count"({ page, rec }) {
    await modalStateAfter(page, "Picked some");
    await setQuantity(page, "6", "number");
    const m = await modalState(page);
    await save(page);
    return summarise(rec, { quantityStep: m?.quantityStep, modalAfterSave: (await modalState(page))?.text });
  },

  // ── fractional count must be refused, readably ───────────────────────────
  async "2c-fractional-count"({ page, rec }) {
    await modalStateAfter(page, "Picked some");
    await setQuantity(page, "1.5", "number");
    await clickButton(page, "Save harvest");
    await page.waitForTimeout(3000);
    return summarise(rec, { modalAfterSave: (await modalState(page))?.text });
  },

  // ── 8 — final annual, from the Today card ────────────────────────────────
  async "8-final-annual"({ page, rec }) {
    const m = await modalStateAfter(page, "Finished harvesting");
    await save(page);
    return summarise(rec, { modalOnOpen: m, modalAfterSave: (await modalState(page))?.text });
  },

  // ── Crops tab — presetFinal must NOT default to the crop-closing choice ──
  async "crops-tab-presetfinal"({ page, rec }) {
    await navigateTab(page, "Crops");
    await harvestNow(page);
    const m = await modalState(page);
    if (!m) throw new Error("Crops-tab harvest modal did not open");
    const save = m.buttons.find(b => /Save harvest|Pick one above/.test(b.label));
    return summarise(rec, {
      modalOnOpen: m,
      saveLabel: save?.label,
      saveDisabled: save?.disabled,
      subtitle: m.text.split("\n")[1],
    });
  },

  // ── 9 — final PERENNIAL: season closes, the plant does not ───────────────
  async "9-final-perennial"({ page, rec }) {
    await navigateTab(page, "Crops");
    await harvestNow(page, process.env.CROP || "Mint");
    const before = await modalState(page);
    await clickButton(page, "Final harvest");           // resolve finality
    await page.waitForTimeout(400);
    const chosen = await modalState(page);
    await save(page);
    return summarise(rec, {
      modalOnOpen: before,
      finalityCopy: chosen?.text,
      modalAfterSave: (await modalState(page))?.text,
    });
  },

  // ── 8 — final ANNUAL, from Today (Runner Bean, status 'harvesting') ──────
  async "8-final-annual"({ page, rec }) {
    const m = await modalStateAfter(page, "Finished harvesting");
    await save(page);
    return summarise(rec, { modalOnOpen: m, modalAfterSave: (await modalState(page))?.text });
  },

  // ── 10 — undo, immediately after a final harvest, in the same sheet ──────
  async "10-undo-annual"({ page, rec }) {
    await modalStateAfter(page, "Finished harvesting");
    await save(page);
    const afterSave = await modalState(page);
    await clickButton(page, "Undo harvest");
    await page.waitForTimeout(4000);
    return summarise(rec, {
      modalAfterSave: afterSave?.text,
      modalAfterUndo: (await modalState(page))?.text,
    });
  },

  // ── 10b — undo must take the photo object with it ────────────────────────
  async "10b-undo-with-photo"({ page, rec }) {
    await modalStateAfter(page, "Finished harvesting");   // final, so Undo is offered
    await attachPhoto(page, "undo");
    await save(page);
    const afterSave = await modalState(page);
    const uploaded = rec.analytics.find(e => e.event === "harvest_photo_uploaded");
    await clickButton(page, "Undo harvest");
    await page.waitForTimeout(6000);
    return summarise(rec, {
      modalAfterSave: afterSave?.text,
      photoUrlUploaded: uploaded?.properties?.linked ?? null,
      modalAfterUndo: (await modalState(page))?.text,
    });
  },

  // ── 6 — the photo survives the read path, after a full reload ────────────
  async "6-photo-readback"({ page, rec }) {
    await navigateTab(page, "Profile");
    // The harvest log is collapsed by default.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")]
        .find(x => /My Harvest Log/.test(x.innerText));
      b?.click();
    });
    await page.waitForTimeout(3500);
    // Expand every per-crop group so the individual entries render.
    await page.evaluate(() => {
      [...document.querySelectorAll("button,div")]
        .filter(e => /Show \d+ individual harvest|individual harvests/.test(e.innerText || "")
                  && (e.innerText || "").length < 60)
        .forEach(e => e.click());
    });
    await page.waitForTimeout(3000);
    const body = await page.evaluate(() => document.body.innerText);
    const imgs = await page.evaluate(() =>
      [...document.querySelectorAll("img")].map(i => i.src).filter(s => /harvest-photos/.test(s)));
    return summarise(rec, {
      harvestPhotoImages: imgs.length,
      sampleImage: imgs[0] || null,
      quantityMentions: (body.match(/[\d.]+ ?(kg|g|items?|bunch(es)?)\b/g) || []).slice(0, 30),
      unitNotRecorded: (body.match(/\d+ — unit not recorded/g) || []),
      runnerBeanBlock: (body.match(/Runner Bean[\s\S]{0,400}/) || [""])[0],
      totalLines: (body.match(/\d+ harvests?[^\n]*/g) || []).slice(0, 12),
    });
  },
};

/** Click "Harvest Now" in the Crops-tab forecast, optionally for a named crop. */
async function harvestNow(page, cropName) {
  const clicked = await page.evaluate((name) => {
    const btns = [...document.querySelectorAll("button")].filter(b => b.innerText.trim() === "Harvest Now");
    let target = btns[0];
    if (name) {
      target = btns.find(b => (b.closest("div")?.parentElement?.innerText || "").includes(name)) 
            || btns.find(b => (b.closest("div")?.innerText || "").includes(name));
    }
    if (!target) return false;
    target.click(); return true;
  }, cropName);
  if (!clicked) throw new Error(`"Harvest Now" not found${cropName ? ` for ${cropName}` : ""}`);
  await page.waitForTimeout(1500);
}

/** Open the modal and return its state, asserting it actually opened. */
async function modalStateAfter(page, button) {
  await openFromToday(page, button);
  const m = await modalState(page);
  if (!m) throw new Error(`modal did not open after "${button}"`);
  return m;
}

const fn = CASES[CASE];
if (!fn) {
  console.error("Unknown case. Available:\n  " + Object.keys(CASES).join("\n  "));
  process.exit(1);
}

const { result } = await withApp(async (ctx) => fn(ctx), { label: CASE });
report(`CASE ${CASE}`, result);
