// capacitor-bridge.js
// Loaded via <script> tag — bypasses Next.js bundler entirely.
// Registers OAuth callback listener and exposes window.vercroStartOAuth.

(function() {
  // Listen for OAuth callback from Swift ASWebAuthenticationSession
  window.addEventListener("vercroOAuthCallback", async function(e) {
    var url = e.detail && e.detail.url;
    if (!url) return;
    // Signal to the React app that we have a callback URL to process
    window.__vercroOAuthCallbackUrl = url;
    window.dispatchEvent(new CustomEvent("vercroProcessCallback", { detail: { url: url } }));
  });

  window.addEventListener("vercroOAuthError", function(e) {
    window.dispatchEvent(new CustomEvent("vercroProcessError", {
      detail: { message: (e.detail && e.detail.message) || "Sign-in was cancelled." }
    }));
  });

  // Called by React to start native OAuth.
  // Primary path: iOS Swift bridge (ASWebAuthenticationSession via MainViewController.swift).
  // Fallback: Capacitor.Plugins.Browser (SFSafariViewController — in-app, Apple-compliant).
  // Uses Capacitor.Plugins directly — dynamic import() does not work in plain script tags.
  window.vercroStartOAuth = function(oauthUrl) {
    // Primary: iOS webkit bridge → ASWebAuthenticationSession
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.startOAuth) {
      window.webkit.messageHandlers.startOAuth.postMessage({ url: oauthUrl });
      return true;
    }

    // Fallback: Capacitor.Plugins.Browser → SFSafariViewController (in-app, Apple-compliant)
    if (window.Capacitor && window.Capacitor.isNative) {
      var Browser = window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
      var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (Browser && Browser.open) {
        // Register redirect listener before opening browser
        if (App && App.addListener) {
          App.addListener("appUrlOpen", function(data) {
            if (data.url && data.url.startsWith("com.vercro.app://")) {
              window.dispatchEvent(new CustomEvent("vercroProcessCallback", { detail: { url: data.url } }));
            }
          });
        }
        Browser.open({ url: oauthUrl, presentationStyle: "fullscreen" });
        return true;
      }
    }

    return false;
  };

  console.log("[Vercro] capacitor-bridge.js loaded");
})();
