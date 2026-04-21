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
  // Fallback: Capacitor Browser plugin (SFSafariViewController — accepted by Apple).
  // This ensures Google OAuth never opens the system Safari browser.
  window.vercroStartOAuth = function(oauthUrl) {
    // Primary: iOS webkit bridge → ASWebAuthenticationSession
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.startOAuth) {
      window.webkit.messageHandlers.startOAuth.postMessage({ url: oauthUrl });
      return true;
    }
    // Fallback: Capacitor Browser plugin → SFSafariViewController (in-app, Apple-compliant)
    if (window.Capacitor && window.Capacitor.isNative) {
      import("@capacitor/browser").then(function(m) {
        m.Browser.open({ url: oauthUrl, presentationStyle: "popover" }).then(function() {
          // Listen for the app resuming after the browser closes (OAuth redirect back)
          import("@capacitor/app").then(function(a) {
            a.App.addListener("appUrlOpen", function(data) {
              if (data.url && data.url.startsWith("com.vercro.app://")) {
                window.dispatchEvent(new CustomEvent("vercroProcessCallback", { detail: { url: data.url } }));
              }
            });
          });
        });
      });
      return true;
    }
    return false;
  };

  console.log("[Vercro] capacitor-bridge.js loaded");
})();
