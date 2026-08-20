/**
 * Generate every platform icon, splash and social asset from the canonical
 * masters in brand/*.svg.
 *
 *   node brand/build-icons.mjs           generate, then verify
 *   node brand/build-icons.mjs --verify  verify only, generate nothing
 *
 * Every raster is rendered from the SVG at its own final size. Nothing is ever
 * resized from another PNG: a 16px favicon needs different optical weight from a
 * 1024px store icon, and re-sampling a small PNG up is how icons go soft.
 *
 * The verifier at the bottom is the point of this file. It asserts exact pixel
 * dimensions, the absence of an alpha channel where Apple rejects one, the
 * presence of alpha where Android requires one, Android's 66/108 safe zone, the
 * PWA maskable safe circle, the frames inside favicon.ico, and that every icon
 * path in manifest.json resolves on disk.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const M = (n) => path.join(ROOT, "brand", n);
const P = (...p) => path.join(ROOT, ...p);

const GROUND = "#0E2A2E";   // approved app-icon ground
const SUPERSAMPLE = 2;      // render at 2x the target, then resize down once

/**
 * Rasterise an SVG master at a given pixel size.
 *
 * sharp's `density` is DPI against the SVG's own intrinsic size, so a fixed value
 * means a 1024pt master renders 34,000px square and blows the pixel limit while a
 * 96pt master renders soft. Derive it from the intrinsic width every time.
 */
const intrinsic = new Map();
async function renderSvg(src, px) {
  if (!intrinsic.has(src)) intrinsic.set(src, (await sharp(src).metadata()).width);
  const density = Math.min(2400, Math.max(72, (72 * px * SUPERSAMPLE) / intrinsic.get(src)));
  return sharp(src, { density });
}

const APP_ICON   = M("vercro-app-icon.svg");
const ADAPTIVE   = M("vercro-adaptive-foreground.svg");
const MARK_DARK  = M("vercro-mark-on-dark.svg");
const BADGE      = M("vercro-badge-mono.svg");
const OG         = M("vercro-og.svg");

const log = [];
const out = (f, note) => log.push(`  ${path.relative(ROOT, f).padEnd(58)} ${note}`);

/** Square icon on the opaque ground. `alpha:false` strips the channel entirely. */
async function squareIcon(file, size, { alpha = true } = {}) {
  let img = (await renderSvg(APP_ICON, size)).resize(size, size);
  if (!alpha) img = img.flatten({ background: GROUND }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(file);
  out(file, `${size}x${size}${alpha ? "" : " · no alpha"}`);
}

/** Android legacy round icon — circular crop, transparent outside. */
async function roundIcon(file, size) {
  const base = await (await renderSvg(APP_ICON, size)).resize(size, size).png().toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  await sharp(base)
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  out(file, `${size}x${size} · circular`);
}

/** Android adaptive foreground — transparent, art inside the 66/108 safe zone. */
async function adaptiveForeground(file, size) {
  await (await renderSvg(ADAPTIVE, size)).resize(size, size)
    .png({ compressionLevel: 9 }).toFile(file);
  out(file, `${size}x${size} · transparent`);
}

/** Splash: the mark centred on the ground, sized off the shorter edge. */
async function splash(file, w, h, { alpha = true, markFrac = 0.20 } = {}) {
  const markH = Math.round(Math.min(w, h) * markFrac);
  const mark = await (await renderSvg(MARK_DARK, markH))
    .resize({ height: markH }).png().toBuffer();
  const { width: mw, height: mh } = await sharp(mark).metadata();
  let img = sharp({
    create: { width: w, height: h, channels: 4, background: GROUND },
  }).composite([{
    input: mark,
    left: Math.round((w - mw) / 2),
    top: Math.round((h - mh) / 2),
  }]);
  if (!alpha) img = img.flatten({ background: GROUND }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(file);
  out(file, `${w}x${h}${alpha ? "" : " · no alpha"} · mark ${markH}px`);
}

/** Multi-frame .ico. Vista-era PNG-in-ICO — every current browser reads it. */
async function favicon(file, sizes) {
  const pngs = [];
  for (const s of sizes) {
    pngs.push(await (await renderSvg(APP_ICON, s))
      .resize(s, s).png({ compressionLevel: 9 }).toBuffer());
  }
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0);
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  fs.writeFileSync(file, Buffer.concat([dir, ...entries, ...pngs]));
  out(file, `frames ${sizes.join(", ")}`);
}

// ── Generate ─────────────────────────────────────────────────────────────────
async function generate() {
  fs.mkdirSync(P("public", "icons"), { recursive: true });

  console.log("\nWEB / PWA");
  await favicon(P("public", "favicon.ico"), [16, 32, 48]);
  fs.copyFileSync(APP_ICON, P("public", "icon.svg"));
  out(P("public", "icon.svg"), "vector favicon");
  await squareIcon(P("public", "icons", "icon-192.png"), 192);
  await squareIcon(P("public", "icons", "icon-512.png"), 512);
  await squareIcon(P("public", "icons", "icon-maskable-192.png"), 192);
  await squareIcon(P("public", "icons", "icon-maskable-512.png"), 512);
  // Apple masks its own corners and rejects transparency here.
  await squareIcon(P("public", "icons", "apple-touch-icon.png"), 180, { alpha: false });
  await squareIcon(P("public", "icons", "apple-touch-icon-152.png"), 152, { alpha: false });
  await squareIcon(P("public", "icons", "apple-touch-icon-167.png"), 167, { alpha: false });
  // Android tints a notification badge through its alpha, so this must be a
  // white silhouette — a colour icon renders as a grey blob.
  await (await renderSvg(BADGE, 72)).resize(72, 72)
    .png({ compressionLevel: 9 }).toFile(P("public", "icons", "badge-72.png"));
  out(P("public", "icons", "badge-72.png"), "72x72 · monochrome, transparent");
  await (await renderSvg(OG, 1200)).resize(1200, 630)
    .png({ compressionLevel: 9 }).toFile(P("public", "og-image.png"));
  out(P("public", "og-image.png"), "1200x630");

  console.log("\niOS");
  // Single-size asset catalogue: Xcode derives every other size from this one.
  // App Store Connect rejects a build whose icon carries an alpha channel.
  await squareIcon(
    P("ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png"),
    1024, { alpha: false });
  for (const n of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    // Capacitor centre-crops this square to the device screen, so the mark stays
    // well inside the middle third.
    await splash(P("ios", "App", "App", "Assets.xcassets", "Splash.imageset", n),
      2732, 2732, { alpha: false, markFrac: 0.18 });
  }

  console.log("\nANDROID");
  const RES = P("android", "app", "src", "main", "res");
  const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  // Adaptive foregrounds are a 108dp canvas, NOT the launcher size — the files
  // that were here had simply been copied from ic_launcher.png at 48-192.
  const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [d, size] of Object.entries(LAUNCHER)) {
    await squareIcon(path.join(RES, `mipmap-${d}`, "ic_launcher.png"), size);
    await roundIcon(path.join(RES, `mipmap-${d}`, "ic_launcher_round.png"), size);
    await adaptiveForeground(path.join(RES, `mipmap-${d}`, "ic_launcher_foreground.png"), FOREGROUND[d]);
  }
  // Exact dimensions of the stock Capacitor splashes being replaced.
  const SPLASH = [
    ["drawable", 480, 320],
    ["drawable-port-mdpi", 320, 480], ["drawable-land-mdpi", 480, 320],
    ["drawable-port-hdpi", 480, 800], ["drawable-land-hdpi", 800, 480],
    ["drawable-port-xhdpi", 720, 1280], ["drawable-land-xhdpi", 1280, 720],
    ["drawable-port-xxhdpi", 960, 1600], ["drawable-land-xxhdpi", 1600, 960],
    ["drawable-port-xxxhdpi", 1280, 1920], ["drawable-land-xxxhdpi", 1920, 1280],
  ];
  for (const [dir, w, h] of SPLASH) {
    await splash(path.join(RES, dir, "splash.png"), w, h, { markFrac: 0.22 });
  }

  console.log(log.join("\n"));
}

// ── Verify ───────────────────────────────────────────────────────────────────
const checks = [];
const check = (ok, label, detail = "") =>
  checks.push({ ok, label, detail });

async function meta(f) { return await sharp(f).metadata(); }

async function expectSize(f, w, h) {
  if (!fs.existsSync(f)) return check(false, path.relative(ROOT, f), "MISSING");
  const m = await meta(f);
  check(m.width === w && m.height === h, path.relative(ROOT, f),
        `${m.width}x${m.height} (want ${w}x${h})`);
}

async function expectNoAlpha(f) {
  const m = await meta(f);
  check(m.channels === 3 && !m.hasAlpha, path.relative(ROOT, f),
        `channels=${m.channels} hasAlpha=${m.hasAlpha} — must be 3/false`);
}

async function expectAlpha(f) {
  const m = await meta(f);
  check(m.hasAlpha === true, path.relative(ROOT, f),
        `hasAlpha=${m.hasAlpha} — must be true`);
}

/**
 * Every opaque pixel must fall inside a circle of the given radius fraction.
 * Android guarantees only the central 66 of 108dp survives every launcher mask;
 * the PWA maskable spec guarantees only the central 80% circle.
 */
async function expectWithinSafeCircle(f, radiusFrac, label) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * radiusFrac;
  let worst = 0, offenders = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (data[i + 3] < 8) continue;                       // transparent
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > worst) worst = d;
      if (d > r) offenders++;
    }
  }
  check(offenders === 0, `${label}: ${path.relative(ROOT, f)}`,
        `furthest opaque pixel ${worst.toFixed(1)}px, safe radius ${r.toFixed(1)}px` +
        (offenders ? ` — ${offenders} px outside` : ""));
}

/** Same idea, but for a full-bleed icon: "art" is any pixel unlike the ground. */
async function expectArtWithinSafeCircle(f, radiusFrac, label) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const g = [0x0e, 0x2a, 0x2e];
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * radiusFrac;
  let worst = 0, offenders = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const diff = Math.abs(data[i] - g[0]) + Math.abs(data[i + 1] - g[1]) + Math.abs(data[i + 2] - g[2]);
      if (diff < 24) continue;                              // ground
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > worst) worst = d;
      if (d > r) offenders++;
    }
  }
  check(offenders === 0, `${label}: ${path.relative(ROOT, f)}`,
        `furthest art pixel ${worst.toFixed(1)}px, safe radius ${r.toFixed(1)}px` +
        (offenders ? ` — ${offenders} px outside` : ""));
}

function verifyIco(f, want) {
  const b = fs.readFileSync(f);
  const n = b.readUInt16LE(4);
  const frames = [];
  for (let i = 0; i < n; i++) {
    const o = 6 + 16 * i;
    frames.push(b.readUInt8(o) === 0 ? 256 : b.readUInt8(o));
  }
  const ok = want.every((s) => frames.includes(s));
  check(ok, "public/favicon.ico", `frames [${frames.join(", ")}] (want ${want.join(", ")})`);
}

function verifyManifest() {
  const mf = JSON.parse(fs.readFileSync(P("public", "manifest.json"), "utf8"));
  for (const icon of mf.icons) {
    const f = P("public", icon.src.replace(/^\//, ""));
    check(fs.existsSync(f), `manifest icon ${icon.src}`,
          fs.existsSync(f) ? "resolves" : "DOES NOT RESOLVE");
  }
  check(mf.theme_color === "#24555F", "manifest theme_color", mf.theme_color);
  check(mf.background_color === "#0E2A2E", "manifest background_color", mf.background_color);
  const purposes = mf.icons.map((i) => i.purpose).filter(Boolean);
  check(!purposes.some((p) => p.includes("any") && p.includes("maskable")),
        "manifest purposes", `no combined "any maskable" — [${purposes.join(" | ")}]`);
}

/** Nothing may still reference the stock Capacitor artwork or an old icon path. */
function verifyNoStaleReferences() {
  const files = [
    "public/manifest.json", "pages/_document.js", "public/sw.js",
    "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
    "android/app/src/main/res/values/ic_launcher_background.xml",
  ];
  for (const rel of files) {
    const f = P(rel);
    if (!fs.existsSync(f)) { check(false, rel, "MISSING"); continue; }
    const txt = fs.readFileSync(f, "utf8");
    const bad = [];
    if (/\/apple-touch-icon\.png/.test(txt) && !/\/icons\/apple-touch-icon\.png/.test(txt)) {
      bad.push("root-level /apple-touch-icon.png (does not exist)");
    }
    if (/#2F5D50/i.test(txt)) bad.push("pre-rebrand #2F5D50");
    if (/#FFFFFF/i.test(txt) && rel.endsWith("ic_launcher_background.xml")) {
      bad.push("white adaptive-icon background");
    }
    check(bad.length === 0, rel, bad.length ? bad.join("; ") : "clean");
  }
}

async function verify() {
  const RES = P("android", "app", "src", "main", "res");

  await expectSize(P("public", "icons", "icon-192.png"), 192, 192);
  await expectSize(P("public", "icons", "icon-512.png"), 512, 512);
  await expectSize(P("public", "icons", "icon-maskable-192.png"), 192, 192);
  await expectSize(P("public", "icons", "icon-maskable-512.png"), 512, 512);
  await expectSize(P("public", "icons", "apple-touch-icon.png"), 180, 180);
  await expectSize(P("public", "icons", "apple-touch-icon-152.png"), 152, 152);
  await expectSize(P("public", "icons", "apple-touch-icon-167.png"), 167, 167);
  await expectSize(P("public", "icons", "badge-72.png"), 72, 72);
  await expectSize(P("public", "og-image.png"), 1200, 630);

  await expectNoAlpha(P("public", "icons", "apple-touch-icon.png"));
  await expectNoAlpha(P("public", "icons", "apple-touch-icon-152.png"));
  await expectNoAlpha(P("public", "icons", "apple-touch-icon-167.png"));
  await expectAlpha(P("public", "icons", "badge-72.png"));
  await expectWithinSafeCircle(P("public", "icons", "badge-72.png"), 0.5, "badge fits its circle");
  await expectArtWithinSafeCircle(P("public", "icons", "icon-maskable-512.png"), 0.4, "PWA maskable safe circle");

  verifyIco(P("public", "favicon.ico"), [16, 32, 48]);
  check(fs.existsSync(P("public", "icon.svg")), "public/icon.svg", "vector favicon present");

  // components/Brand.js must hold the SAME geometry as the masters.
  //
  // Brand.js is a second implementation of one drawing — React and canvas for the
  // screen, SVG masters for every export. Nothing forced them to agree, and on
  // 20 Aug 2026 exactly that failure was found downstream: the marketing
  // renderers had each copied only the two leaf paths from Brand.js, shipping
  // store artwork with no amber dot and no stem. A copy nobody checks is a copy
  // that drifts. This makes divergence a build failure.
  {
    const master = fs.readFileSync(M("vercro-mark-on-light.svg"), "utf8");
    const brandJs = fs.readFileSync(P("components", "Brand.js"), "utf8");
    const wants = [
      [/cx="100"\s+cy="36"\s+r="34"/, /cx="100"\s+cy="36"\s+r="34"/, "amber dot geometry"],
      [/d="M100 212 L100 146"/,          /d="M100 212 L100 146"/,        "stem path"],
      [/M100 140 C 40 140 0 102 2 46/,   /M100 140 C 40 140 0 102 2 46/, "left leaf path"],
      [/M100 140 C 160 140 200 102 198 46/, /M100 140 C 160 140 200 102 198 46/, "right leaf path"],
    ];
    for (const [inMaster, inJs, what] of wants) {
      check(inMaster.test(master) && inJs.test(brandJs), `Brand.js ${what}`, "matches the master");
    }
    check(/strokeWidth="16"/.test(brandJs), "Brand.js stem weight", "16, matches the master");
  }

  const IOS_ICON = P("ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png");
  await expectSize(IOS_ICON, 1024, 1024);
  await expectNoAlpha(IOS_ICON);
  for (const n of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    const f = P("ios", "App", "App", "Assets.xcassets", "Splash.imageset", n);
    await expectSize(f, 2732, 2732);
    await expectNoAlpha(f);
  }

  const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [d, size] of Object.entries(LAUNCHER)) {
    await expectSize(path.join(RES, `mipmap-${d}`, "ic_launcher.png"), size, size);
    await expectSize(path.join(RES, `mipmap-${d}`, "ic_launcher_round.png"), size, size);
    await expectSize(path.join(RES, `mipmap-${d}`, "ic_launcher_foreground.png"), FOREGROUND[d], FOREGROUND[d]);
    await expectAlpha(path.join(RES, `mipmap-${d}`, "ic_launcher_foreground.png"));
  }
  // 66 of 108dp is the only region every launcher mask is guaranteed to show.
  await expectWithinSafeCircle(
    path.join(RES, "mipmap-xxxhdpi", "ic_launcher_foreground.png"), 33 / 108, "Android adaptive safe zone");

  for (const [dir, w, h] of [
    ["drawable", 480, 320],
    ["drawable-port-mdpi", 320, 480], ["drawable-land-mdpi", 480, 320],
    ["drawable-port-hdpi", 480, 800], ["drawable-land-hdpi", 800, 480],
    ["drawable-port-xhdpi", 720, 1280], ["drawable-land-xhdpi", 1280, 720],
    ["drawable-port-xxhdpi", 960, 1600], ["drawable-land-xxhdpi", 1600, 960],
    ["drawable-port-xxxhdpi", 1280, 1920], ["drawable-land-xxxhdpi", 1920, 1280],
  ]) {
    await expectSize(path.join(RES, dir, "splash.png"), w, h);
  }

  verifyManifest();
  verifyNoStaleReferences();

  const bad = checks.filter((c) => !c.ok);
  console.log("\nVERIFY");
  for (const c of checks) {
    console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.label.padEnd(62)} ${c.detail}`);
  }
  console.log(`\n  ${checks.length - bad.length}/${checks.length} passed`);
  if (bad.length) { process.exitCode = 1; }
}

const verifyOnly = process.argv.includes("--verify");
if (!verifyOnly) await generate();
await verify();
