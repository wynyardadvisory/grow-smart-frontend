/**
 * 3B3c — harvest acceptance driver.
 *
 * Drives the REAL product UI against production with a real QA session, and
 * records, per case:
 *
 *   UI action → API request/response → analytics event(s) → console/page errors
 *
 * Database state and read-back are reconciled separately against Supabase; this
 * file deliberately does not write to the database, because a case proven by a
 * direct INSERT proves nothing about the product.
 *
 * Analytics are captured at the NETWORK layer — the request PostHog actually
 * receives — not by hooking window.posthog.capture. The August attribution
 * regression was invisible precisely because the payload looked right in
 * source; only the emitted event tells the truth. Every run is also
 * re-confirmed against PostHog itself afterwards.
 *
 * Usage:  node e2e/harvest-acceptance.mjs <case-id> [--base <url>]
 */
import { chromium } from "playwright";
import { gunzipSync, inflateSync } from "zlib";
import fs from "fs";
import path from "path";
import { loadSession, saveSession, injectSession, readAuthEntriesFrom,
         sessionStatus, REAUTH_MESSAGE } from "./session.mjs";

export const BASE = process.env.VERCRO_BASE_URL || "https://app.vercro.com";
const OUT = path.join(process.cwd(), ".acceptance");

// Nothing token- or email-shaped may reach stdout or a report file.
export const scrub = (s) => String(s ?? "")
  .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "<jwt>")
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>");

// Pre-existing console noise, from the smoke gate's allowlist.
const IGNORE = [
  /Download the React DevTools/i, /\[Fast Refresh\]/i, /\[HMR\]/i,
  /PostHog/i, /validateDOMNesting/i,
  /Failed to load resource.*(favicon|og-image|manifest|icons|apple-touch)/i,
  /viewport meta tags should not be used/i,
];

/**
 * PostHog sends gzip-js compressed BINARY to /i/v0/e/, and sometimes plain JSON
 * or form-encoded base64. Decoding must start from the raw Buffer —
 * request.postData() coerces to a string and corrupts the gzip bytes, which is
 * why the first working run still decoded nothing.
 */
function decodePosthog(buf) {
  if (!buf || !buf.length) return null;
  const asText = () => buf.toString("utf8");
  const attempts = [
    () => JSON.parse(gunzipSync(buf).toString("utf8")),
    () => JSON.parse(inflateSync(buf).toString("utf8")),
    () => JSON.parse(asText()),
    () => {
      const t = asText();
      const m = /(?:^|&)data=([^&]*)/.exec(t);
      const raw = decodeURIComponent(m ? m[1] : t);
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    },
    () => JSON.parse(gunzipSync(Buffer.from(decodeURIComponent(asText()), "base64")).toString("utf8")),
  ];
  for (const a of attempts) { try { const v = a(); if (v) return v; } catch {} }
  return null;
}

function flattenPosthog(decoded) {
  if (!decoded) return [];
  const arr = Array.isArray(decoded) ? decoded
            : Array.isArray(decoded.batch) ? decoded.batch
            : [decoded];
  return arr.filter(e => e && e.event).map(e => ({
    event: e.event,
    properties: Object.fromEntries(
      Object.entries(e.properties || {}).filter(([k]) => !k.startsWith("$"))),
  }));
}

export async function withApp(fn, { label = "run" } = {}) {
  const session = loadSession();
  const status = sessionStatus(session);
  if (!status.ok) { console.error(REAUTH_MESSAGE); process.exit(2); }

  const browser = await chromium.launch({
    headless: process.env.HEADED !== "1",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  // posthog-js drops events client-side from user agents it considers bots, and
  // "HeadlessChrome" is on that list. Left alone, every acceptance run records
  // zero analytics — which is indistinguishable from the attribution defect
  // under test, and would have produced a false PASS on "no events fired" or a
  // false FAIL on the funnel. The UA is overridden so the product behaves as it
  // does for a real browser; nothing else about the run is disguised.
  const ctx = await browser.newContext({
    viewport: { width: 420, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
               "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });
  await injectSession(ctx, session);

  // posthog-js refuses to TRANSMIT from anything it judges to be a bot, and
  // Playwright sets navigator.webdriver = true. Diagnosed the hard way: an
  // in-page wrapper proved posthog.capture("harvest_photo_offered") WAS being
  // called on every run while nothing whatsoever reached PostHog. Left alone,
  // every case would record zero analytics — indistinguishable from the
  // attribution defect under test, and a guaranteed false result in one
  // direction or the other.
  //
  // This restores normal browser behaviour so the PRODUCT is observed as users
  // experience it. Nothing about the app, the account or the data is faked.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
  });

  const page = await ctx.newPage();

  const rec = { api: [], analytics: [], consoleErrors: [], pageErrors: [], label };

  page.on("pageerror", e => rec.pageErrors.push(scrub(String(e.message).split("\n")[0]).slice(0, 200)));
  page.on("console", m => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!IGNORE.some(re => re.test(t))) rec.consoleErrors.push(scrub(t).slice(0, 200));
  });

  // CONTEXT level, not page level: posthog-js can send from a service worker or
  // with fetch keepalive, and page.on("request") misses both. The first run
  // recorded zero analytics for exactly that reason — which is indistinguishable
  // from the attribution bug being tested, so it had to be ruled out.
  ctx.on("request", req => {
    const u = req.url();
    if (/posthog/.test(u)) {
      rec.analyticsRaw = rec.analyticsRaw || [];
      rec.analyticsRaw.push(u.split("?")[0]);
      let buf = null;
      try { buf = req.postDataBuffer(); } catch {}
      const evts = flattenPosthog(decodePosthog(buf));
      for (const e of evts) rec.analytics.push(e);
    }
  });

  page.on("response", async res => {
    const u = res.url();
    if (!/api\.vercro\.com/.test(u)) return;
    const req = res.request();
    const entry = { method: req.method(), url: u.replace("https://api.vercro.com", ""), status: res.status() };
    if (req.method() !== "GET") {
      try { entry.requestBody = JSON.parse(req.postData() || "null"); } catch { entry.requestBody = null; }
      // A base64 photo payload is enormous and not the thing under test.
      if (entry.requestBody?.base64) entry.requestBody.base64 = `<${entry.requestBody.base64.length} chars>`;
      try { entry.responseBody = await res.json(); } catch { entry.responseBody = null; }
    }
    rec.api.push(entry);
  });

  // Boot and reach authenticated Today.
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  let reached = false;
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    const t = await page.evaluate(() => document.body.innerText);
    if (/Application error|client-side exception|Minified React error/i.test(t)) break;
    if (/Good (morning|afternoon|evening)/i.test(t)) { reached = true; break; }
  }
  if (!reached) {
    const t = await page.evaluate(() => document.body.innerText);
    console.error("Did not reach authenticated Today.\n" + scrub(t).slice(0, 400));
    console.error(REAUTH_MESSAGE);
    await browser.close();
    process.exit(2);
  }

  let result;
  try {
    result = await fn({ page, ctx, rec });
    // PostHog batches on a ~3s timer. The first recon closed the browser inside
    // that window and recorded zero events, which looked exactly like the
    // attribution bug it was meant to detect. Flush, then give the requests
    // time to leave.
    await flushAnalytics(page);
    // A case summarises BEFORE this flush, so the last batch would be missing
    // from its report. Refresh the analytics view from the completed record.
    if (result && typeof result === "object" && "analytics" in result) {
      const harvest = rec.analytics.filter(e => e.event.startsWith("harvest"));
      result.analytics = harvest.map(e => ({ event: e.event, props: e.properties }));
      result.analyticsOrder = harvest.map(e => e.event);
      result.consoleErrors = rec.consoleErrors;
      result.pageErrors = rec.pageErrors;
    }
  } finally {
    // Re-persist the refreshed session so the file stays usable.
    try { saveSession(await readAuthEntriesFrom(page)); } catch {}
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${label}.json`),
      JSON.stringify({ ...rec, result }, null, 2));
    await browser.close();
  }
  return { rec, result };
}

/** Force PostHog to send, then wait for the requests to actually go out. */
export async function flushAnalytics(page, ms = 6000) {
  try {
    await page.evaluate(() => {
      const ph = window.posthog;
      if (!ph) return;
      if (typeof ph.flush === "function") ph.flush();
      else if (ph._requestQueue?.unload) ph._requestQueue.unload();
    });
  } catch {}
  await page.waitForTimeout(ms);
}

// ── UI helpers ──────────────────────────────────────────────────────────────

export const text = (page) => page.evaluate(() => document.body.innerText);

/** Click a button by its exact visible label. */
export async function clickButton(page, label, { timeout = 10000 } = {}) {
  const btn = page.locator(`button:text-is("${label}")`).first();
  await btn.waitFor({ state: "visible", timeout });
  await btn.click();
  await page.waitForTimeout(400);
}

export async function clickIfPresent(page, label) {
  const btn = page.locator(`button:text-is("${label}")`).first();
  if (await btn.count() && await btn.isVisible().catch(() => false)) {
    await btn.click(); await page.waitForTimeout(400); return true;
  }
  return false;
}

/**
 * Switch bottom-nav tab. The nav buttons are fixed-position and Playwright's
 * visibility check times out on them, so the click goes through the DOM.
 */
export async function navigateTab(page, name) {
  const ok = await page.evaluate((n) => {
    const b = [...document.querySelectorAll("button")]
      .find(x => x.innerText.trim().replace(/\s+/g, " ").endsWith(n));
    if (!b) return false;
    b.click(); return true;
  }, name);
  if (!ok) throw new Error(`nav tab "${name}" not found`);
  await page.waitForTimeout(3500);
}

/** Open the harvest modal from the TODAY card. */
export async function openHarvestFromToday(page, which = "Picked some") {
  await clickButton(page, which);
  await page.waitForTimeout(600);
}

/** Read the modal's visible state without depending on styling. */
export async function modalState(page) {
  return page.evaluate(() => {
    // The sheet is the CHILD of the fixed full-screen overlay. Picking "any div
    // whose text contains Log Harvest" returns the innermost one, which is the
    // heading alone — that is why the first recon reported a 2-word modal.
    const overlay = [...document.querySelectorAll("div")].find(d => {
      const cs = getComputedStyle(d);
      return cs.position === "fixed" && Number(cs.zIndex) >= 1000
        && /Log Harvest|Harvest logged|Partial harvest logged|Harvest undone/.test(d.innerText || "");
    });
    const el = overlay?.firstElementChild || overlay;
    if (!el) return null;
    const t = el.innerText;
    const buttons = [...el.querySelectorAll("button")].map(b => ({
      label: b.innerText.trim(), disabled: b.disabled,
    })).filter(b => b.label);
    return {
      text: t,
      words: t.split(/\s+/).filter(Boolean).length,
      buttons,
      hasQuantityInput: !!el.querySelector('input[type="number"]'),
      quantityStep: el.querySelector('input[type="number"]')?.getAttribute("step") || null,
      unitOptions: [...(el.querySelectorAll("select option") || [])].map(o => o.value),
      sliders: [...el.querySelectorAll('input[type="range"]')].map(r => r.value),
      sliderDisplay: (t.match(/Yield Volume\s*\n?\s*(\S+)/) || [])[1] || null,
    };
  });
}

export const analyticsFor = (rec, name) => rec.analytics.filter(e => e.event === name);
export const apiFor = (rec, method, re) =>
  rec.api.filter(a => a.method === method && re.test(a.url));

export function report(title, obj) {
  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
  console.log(JSON.stringify(obj, null, 2));
}
