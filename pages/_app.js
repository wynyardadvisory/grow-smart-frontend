import "@/styles/globals.css";
import Head from "next/head";
import posthog from "posthog-js";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { display, body } from "@/lib/fonts";
import { flushAnalytics } from "@/lib/analytics";
import * as Sentry from "@sentry/browser";

// ── V009 — frontend error reporting ───────────────────────────────────────────
//
// There was none. @sentry/node covers the API only, so a total frontend failure
// — including the V001 startup hang, which left users on a blank screen for
// 60s+ — produced no telemetry anywhere. That is why the most severe defect
// found in the August audit had never been reported by anyone.
//
// Initialised once, before React renders, so errors thrown during the very
// first render are captured. Gated on NEXT_PUBLIC_SENTRY_DSN: with no DSN this
// is completely inert and costs one env lookup, so shipping it cannot break a
// build or an environment that has not provisioned Sentry yet.
//
// PRIVACY — this is a consumer gardening app and telemetry must not become a
// second copy of user data:
//   • sendDefaultPii stays false, so IP and headers are not attached
//   • beforeSend strips the Supabase access token from any captured URL
//   • no email, session, postcode, garden or crop data is ever attached
//     anywhere in this file or in reportStartupIssue()
let sentryReady = false;
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN && !sentryReady) {
  sentryReady = true;
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_RELEASE || undefined,
    sendDefaultPii: false,
    // The Sentry org currently disallows project creation at our access level,
    // so the frontend DSN belongs to the same project as @sentry/node. Tagging
    // every event keeps the two surfaces separable: filter `surface:frontend`
    // in Sentry. Remove this once a dedicated frontend project exists.
    initialScope: { tags: { surface: "frontend" } },
    // Startup and crash reporting only. No performance tracing and no session
    // replay — both carry a bundle and privacy cost this does not need yet.
    tracesSampleRate: 0,
    beforeSend(event) {
      try {
        // Supabase puts the access token in the URL fragment on OAuth return.
        const scrub = (u) => (typeof u === "string" ? u.replace(/(access_token|refresh_token)=[^&#]*/g, "$1=[redacted]") : u);
        if (event.request?.url) event.request.url = scrub(event.request.url);
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(b =>
            b?.data?.url ? { ...b, data: { ...b.data, url: scrub(b.data.url) } } : b
          );
        }
        delete event.user; // never identify — PostHog already owns identity
      } catch { /* never let scrubbing break reporting */ }
      return event;
    },
  });
  // index.js reports startup failures through window.Sentry so it does not need
  // its own import, and stays a no-op when no DSN is configured.
  window.Sentry = Sentry;
}

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      defaults: "2026-01-30",
      // Cross-domain tracking: stitches sessions from vercro.com → app.vercro.com
      // so the acquisition funnel connects landing page views to signups.
      cross_subdomain_cookie: true,
      cookie_domain: ".vercro.com",
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") ph.debug();
        // CRITICAL: posthog-js does not attach itself to window by default.
        // Every window.posthog.capture(...) call in index.js — user_signed_up,
        // paywall_shown, paywall_upgrade_tapped, push_opt_in_accepted,
        // push_opt_in_dismissed — silently no-ops without this line, since each
        // call is guarded by `typeof window !== "undefined" && window.posthog`.
        // No error is thrown; the event simply never fires. Confirmed missing
        // and fixed in session 60 after all five new events showed zero data
        // in PostHog despite being correctly deployed.
        window.posthog = ph;

        // Register the platform super property (web / ios / android) and replay
        // anything captured before init resolved.
        //
        // Both matter because of React effect ordering: children's effects run
        // before parents', so GrowSmart's mount effects — which fire
        // session_started and the first screen_viewed — run BEFORE this
        // callback. lib/analytics.js queues those and flushAnalytics replays
        // them here, with platform already attached.
        flushAnalytics(ph);
      },
    });

    const handleRouteChange = () => posthog.capture("$pageview");
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, []);

  // Brand fonts are published as CSS custom properties rather than by wrapping
  // the app in a <div class={font.className}>. A wrapper element would sit
  // between <body> and the app root in index.js, which relies on min-height:100vh
  // plus sticky and fixed children — adding a block-level ancestor risks changing
  // that layout. A fragment adds no DOM node, so nothing about the tree changes.
  return (
    <>
      {/* The app had no <Head> at all: no title, no description, no Open Graph, no
          Twitter card. A link to app.vercro.com shared as a bare URL, and the tab
          showed the hostname. This lives in _app rather than in index.js because
          GrowSmart returns early for the loading gate, the auth screen and
          onboarding — metadata must not depend on which branch renders.

          Copy is prose, so the brand reads "Vercro" with no full stop. The amber
          period belongs to the visual wordmark only. */}
      <Head>
        <title>Vercro — Know exactly what to do in your garden, every day</title>
        <meta
          name="description"
          content="Vercro plans, tracks and tells you exactly what to do — every day. From seed to harvest, automatically."
        />

        <meta property="og:site_name" content="Vercro" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://app.vercro.com" />
        <meta property="og:title" content="Vercro — Know exactly what to do in your garden, every day" />
        <meta
          property="og:description"
          content="Personalised daily tasks, weather-aware advice, and crop guidance — built for home growers and allotment holders."
        />
        {/* Absolute: most scrapers do not resolve a relative og:image. */}
        <meta property="og:image" content="https://app.vercro.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Vercro — know exactly what to do in your garden, every day" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Vercro — Know exactly what to do in your garden, every day" />
        <meta
          name="twitter:description"
          content="Personalised daily tasks, weather-aware advice, and crop guidance — built for home growers and allotment holders."
        />
        <meta name="twitter:image" content="https://app.vercro.com/og-image.png" />
      </Head>
      <style jsx global>{`
        :root {
          --font-display: ${display.style.fontFamily};
          --font-body: ${body.style.fontFamily};
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}