/**
 * Brand typefaces — Newsreader (display) + Hanken Grotesk (body).
 *
 * These are the two faces vercro.com uses. The site's own computed font names
 * (__Newsreader_*, __Hanken_Grotesk_*) are next/font's hashed naming, so the
 * marketing site and the app now share one pipeline and one set of families.
 *
 * Loaded via next/font/google so the faces are downloaded at BUILD time and
 * self-hosted into out/_next/static/media. That matters more here than on a
 * normal web app: Capacitor bundles out/ into the iOS and Android binaries, so
 * a runtime CDN fetch would fail on a device with no connection.
 *
 * Both are requested as variable fonts (no `weight` array), which gives one
 * file per style covering the whole axis. index.js uses weights 400–900, so
 * static instances would mean shipping six files per family and would still
 * leave the browser synthesising anything not requested.
 *
 * next/font requires the loader call to be at module scope. Importing the
 * results from here is supported and keeps the family strings in one place.
 */
import { Newsreader, Hanken_Grotesk } from "next/font/google";

// Italic is loaded because index.js has 24 `fontStyle: "italic"` sites; without
// the real italic the browser would synthesise an oblique from the roman.
export const display = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const body = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
});

/**
 * Font-family strings for the inline style objects in pages/index.js.
 *
 * F.display replaces the previous generic `"serif"`, which resolved per platform
 * (Times on iOS/macOS, Noto Serif on Android) rather than to the Georgia the app
 * root declared. F.body replaces `"sans-serif"` and the two `"Georgia, serif"`
 * roots — body copy inherits the grotesk, matching the site's default font.
 */
export const F = {
  display: display.style.fontFamily,
  body:    body.style.fontFamily,
};
