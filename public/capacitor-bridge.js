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

  // Called by React to start native OAuth
  window.vercroStartOAuth = function(oauthUrl) {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.startOAuth) {
      window.webkit.messageHandlers.startOAuth.postMessage({ url: oauthUrl });
      return true;
    }
    return false;
  };

  console.log("[Vercro] capacitor-bridge.js loaded");
})();
