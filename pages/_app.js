import "@/styles/globals.css";
import { useEffect } from "react";

const ONESIGNAL_APP_ID = "cb8ad061-a9f7-4e23-8661-85efb710a139";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        serviceWorkerPath: "/sw.js",  // use our own SW which imports OneSignal SDK
        notifyButton: { enable: false },
        welcomeNotification: { disable: true },
        autoResubscribe: true,
        promptOptions: {
          autoPrompt: false,
        },
      });
    });

    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  return <Component {...pageProps} />;
}