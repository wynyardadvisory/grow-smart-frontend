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
 * Deliberately absent: fontSize. Sizes stay where they are — consolidating them
 * is a separate, separately-reviewable change.
 *
 * lineHeight is set per role. Ten call sites declare their own; because the token
 * spreads first, those keep winning, which is intended. inputStyle deliberately
 * does not use a token: at 1.5 a 14px field's line box grows 18px -> 21px and
 * every form field would gain ~3px of height.
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
  // Newsreader's own metrics produce line boxes at a ratio of exactly 1.0 at every
  // size this app uses, measured on the live page — so a heading that wrapped had
  // no leading at all and its descenders ran into the next line's ascenders. 1.15
  // and 1.25 fix that while staying tight enough to read as display type.
  displayLg:  { fontFamily: F.display, fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.15 },
  displayMd:  { fontFamily: F.display, fontWeight: 500, lineHeight: 1.25 },

  // ── Body — Hanken Grotesk ───────────────────────────────────────────────────
  // 1.5 matches the website's body setting. bodyStrong shares it because the two
  // sit inline with each other; different leading would comb a mixed paragraph.
  body:       { fontFamily: F.body, fontWeight: 400, lineHeight: 1.5 },
  bodyStrong: { fontFamily: F.body, fontWeight: 600, lineHeight: 1.5 },

  // Same weight as bodyStrong, different leading — that is the whole reason the two
  // are separate roles. 1.3 is not a design choice so much as a pin: Hanken's
  // `normal` resolves to 1.29–1.32 across the sizes in use, so this reproduces
  // current button geometry within 0.1px while making it independent of which font
  // file is resolved (during swap, or where fallback metrics differ). Measured on
  // production: line-height 1 here shrank buttons by up to 4px — "Harvest Now"
  // 32px -> 28px — on targets already below the 44px minimum.
  control:    { fontFamily: F.body, fontWeight: 600, lineHeight: 1.3 },

  // ── Uppercase section and form labels ───────────────────────────────────────
  // Replaces 25 hand-rolled variants. Tracking is em-based so it scales with
  // whatever size each call site uses, which fixed px never did. 0.16em rather
  // than the website's 0.22em: measured, 0.22em widens the longest real label
  // ("Make your plan more accurate") by 23% inside a ~372px content column.
  // Pinned at 1.3 for the same reason as control: these are single-line labels that
  // gain nothing from leading and only lose geometry if it changes.
  eyebrow:    { fontFamily: F.body, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", lineHeight: 1.3 },
};
