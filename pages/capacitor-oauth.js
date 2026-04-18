// capacitor-oauth.js
// This module must be imported at the top level of index.js so Next.js
// includes it in the client bundle. Do not move this code inline into
// a component or conditional — it will be tree-shaken.

var _supabase = null;
var _onAuth = null;
var _onError = null;

export function initCapacitorOAuth(supabase, onAuth, onError) {
  _supabase = supabase;
  _onAuth = onAuth;
  _onError = onError;

  if (typeof window === "undefined") return;

  window.addEventListener("vercroOAuthCallback", async function(e) {
    var url = e.detail && e.detail.url;
    if (!url || !_supabase) return;
    try {
      var result = await _supabase.auth.exchangeCodeForSession(url);
      if (result.error) throw result.error;
      if (result.data && result.data.session && _onAuth) _onAuth(result.data.session);
    } catch(err) {
      if (_onError) _onError("Sign-in failed. Please try again.");
    }
  });

  window.addEventListener("vercroOAuthError", function(e) {
    if (_onError) _onError((e.detail && e.detail.message) || "Sign-in was cancelled.");
  });
}

export async function triggerNativeOAuth(provider, supabase) {
  var result = await supabase.auth.signInWithOAuth({
    provider: provider,
    options: {
      redirectTo: "com.vercro.app://auth/callback",
      skipBrowserRedirect: true,
    },
  });
  if (result.error) throw result.error;
  if (result.data && result.data.url) {
    // This postMessage call is the ONLY reason this file exists as a separate module.
    // Keeping it here prevents Next.js from tree-shaking it as "unreachable".
    window.webkit.messageHandlers.startOAuth.postMessage({ url: result.data.url });
  }
}
