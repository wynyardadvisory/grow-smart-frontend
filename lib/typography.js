/**
 * Typography roles.
 *
 * Before this existed, pages/index.js carried 172 distinct font signatures across
 * ~1,600 style objects — 31 sizes, 12 letter-spacing values, and 543 sites at
 * weight 700. These six tokens replace the role part of that: which face, how
 * heavy, how tracked. Spread one into a style object and it settles the role;
 * the call site keeps its own fontSize, colour and spacing.
 *
 *   <div style={{ ...T.eyebrow, fontSize: 11, color: C.stone, marginBottom: 10 }}>
 *
 * Deliberately absent: fontSize and lineHeight. Sizes stay where they are —
 * consolidating them is a separate, separately-reviewable change. lineHeight
 * arrives in slice 2B, added to these same objects so it lands everywhere at once.
 *
 * Every token names its family explicitly, including the body ones where the app
 * root already supplies it. That is on purpose: form controls do not inherit
 * font-family from an ancestor div (the UA stylesheet sets Arial on button, input,
 * select and textarea), which is how 94% of this app's controls ended up rendering
 * in Arial. globals.css now forces inheritance, and naming the family here means a
 * call site is never relying on it silently.
 */
import { F } from "./fonts";

export const T = {
  // ── Display — Newsreader ────────────────────────────────────────────────────
  // Headings only. Never on a control, never below 15px: a reading serif set bold
  // at 13px on a button was the clearest unconsidered signal left in the UI.
  // Weight splits by size because the brand's 400 is drawn for 24px+ marketing
  // type — at 15–18px in a dense list it stops separating from adjacent body copy.
  displayLg:  { fontFamily: F.display, fontWeight: 400, letterSpacing: "-0.01em" },
  displayMd:  { fontFamily: F.display, fontWeight: 500 },

  // ── Body — Hanken Grotesk ───────────────────────────────────────────────────
  body:       { fontFamily: F.body, fontWeight: 400 },
  bodyStrong: { fontFamily: F.body, fontWeight: 600 },

  // Identical to bodyStrong today. Kept separate because the two diverge in 2B —
  // a control label wants line-height 1, a paragraph wants ~1.5.
  control:    { fontFamily: F.body, fontWeight: 600 },

  // ── Uppercase section and form labels ───────────────────────────────────────
  // Replaces 25 hand-rolled variants. Tracking is em-based so it scales with
  // whatever size each call site uses, which fixed px never did. 0.16em rather
  // than the website's 0.22em: measured, 0.22em widens the longest real label
  // ("Make your plan more accurate") by 23% inside a ~372px content column.
  eyebrow:    { fontFamily: F.body, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" },
};
