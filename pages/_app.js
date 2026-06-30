import "@/styles/globals.css";
import posthog from "posthog-js";
import { useEffect } from "react";
import { useRouter } from "next/router";

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
      },
    });

    const handleRouteChange = () => posthog.capture("$pageview");
    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, []);

  return <Component {...pageProps} />;
}