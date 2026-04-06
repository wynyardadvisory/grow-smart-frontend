/**
 * GROW SMART — Main App
 * React PWA. Connects to the Grow Smart API.
 *
 * Set NEXT_PUBLIC_API_URL in your .env.local:
 *   NEXT_PUBLIC_API_URL=https://your-api.vercel.app
 *
 * Auth is handled by Supabase JS client.
 * All API calls send the Supabase JWT as Bearer token.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { Analytics } from "@vercel/analytics/react";
import { useRouter } from "next/router";

// ── Supabase client (frontend) ────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      storageKey: "vercro-auth",
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ── Pro feature flag ──────────────────────────────────────────────────────────
// Set NEXT_PUBLIC_PRO_ENABLED=true in Vercel env vars to show Pro UI to users.
// When false (default), all paywall triggers and upgrade prompts are hidden.
// Existing users see no change until you deliberately flip this flag.
const PRO_ENABLED = process.env.NEXT_PUBLIC_PRO_ENABLED === "true";

// ── Mark bypass ───────────────────────────────────────────────────────────────
// Mark's account always sees all Pro features regardless of PRO_ENABLED flag.
// No other account is affected. Everyone else sees exactly what they always saw.
const MARK_EMAIL = "mark@wynyardadvisory.co.uk";

// ── Design tokens ─────────────────────────────────────────────────────────────
// Seasonal palette — subtle shifts by time of year
const SEASON = (() => {
  const m = new Date().getMonth(); // 0-11
  if (m >= 2  && m <= 4)  return "spring";
  if (m >= 5  && m <= 7)  return "summer";
  if (m >= 8  && m <= 10) return "autumn";
  return "winter";
})();

const SEASON_ACCENT = {
  spring: { bg: "#F4F8F2", accent: "#7FB069", border: "#D4E8CE" },
  summer: { bg: "#FDF8F0", accent: "#D9A441", border: "#EDE0C8" },
  autumn: { bg: "#F8F4EE", accent: "#C8844C", border: "#E8D8C4" },
  winter: { bg: "#F2F4F6", accent: "#5B8FA8", border: "#D4DDE4" },
}[SEASON];

const C = {
  forest:    "#2F5D50",
  sage:      "#A8C1B5",
  offwhite:  SEASON_ACCENT.bg,
  stone:     "#6E6E6E",
  leaf:      "#6FAF63",
  amber:     "#D9A441",
  red:       "#C65A5A",
  border:    SEASON_ACCENT.border,
  cardBg:    "#FFFFFF",
  accent:    SEASON_ACCENT.accent,
};

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Pro subscription hook ────────────────────────────────────────────────────
// Fetches subscription status from the API. Returns { isPro, plan, loading, isMark }.
// Mark's account always gets isPro=true regardless of PRO_ENABLED or plan.
// All other users only get Pro if PRO_ENABLED=true AND their plan is pro.
function useProStatus() {
  const [isPro,    setIsPro]    = useState(() => {
    try { return localStorage.getItem("vercro_is_pro") === "true"; } catch(e) { return false; }
  });
  const [plan,     setPlan]     = useState("free");
  const [loading,  setLoading]  = useState(false);
  const [isMark,   setIsMark]   = useState(false);

  useEffect(() => {
    // Always fetch status — needed for Mark bypass even when PRO_ENABLED=false
    setLoading(true);
    Promise.all([
      apiFetch("/subscription/status").catch(() => null),
      supabase.auth.getSession().catch(() => ({ data: { session: null } })),
    ]).then(([statusData, sessionData]) => {
      const email = sessionData?.data?.session?.user?.email || "";
      const markBypass = email === MARK_EMAIL;
      setIsMark(markBypass);
      const pro = markBypass || statusData?.is_pro === true;
      setIsPro(pro);
      setPlan(markBypass ? "pro" : (statusData?.plan || "free"));
      try { localStorage.setItem("vercro_is_pro", pro ? "true" : "false"); } catch(e) {}
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  // isPro for general Pro UI: Mark account OR (PRO_ENABLED=true AND plan is pro)
  // isPro for diagnosis: Mark account OR actual plan is pro (regardless of PRO_ENABLED)
  // This means paid users never get blocked by the diagnosis limit even when Pro UI is hidden.
  const effectiveIsPro = isMark || (PRO_ENABLED && isPro);
  const isProForDiagnosis = isMark || isPro; // plan-based, ignores flag
  return { isPro: effectiveIsPro, isProForDiagnosis, plan, loading, isMark };
}

// ── Plant Check visibility hook ──────────────────────────────────────────────
// Returns true only for Mark's account OR when PRO_ENABLED=true.
// Everyone else (including demo) sees nothing until the flag is flipped.
function usePlantCheckEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (PRO_ENABLED) { setEnabled(true); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email === MARK_EMAIL) setEnabled(true);
    }).catch(() => {});
  }, []);

  return enabled;
}

// ── Nav redesign visibility hook ─────────────────────────────────────────────
// Returns true only for Mark's account OR when PRO_ENABLED=true.
// When false: nav is unchanged, Feeds tab stays, Plan tab hidden.
// When true: Plan tab replaces Feeds, Feeds moves inside Crops tab.
function useNavEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (PRO_ENABLED) { setEnabled(true); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email === MARK_EMAIL) setEnabled(true);
    }).catch(() => {});
  }, []);
  return enabled;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Supabase joins can return variety as a nested object {name, days_to_maturity_min}
// or as a plain string depending on the query. This always returns a safe string.
function varietyName(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return v.name || null;
  return null;
}
const inputStyle = {
  width: "100%", padding: "12px 14px",
  border: `1px solid ${C.border}`, borderRadius: 10,
  fontSize: 14, background: C.cardBg, color: "#222",
  outline: "none", boxSizing: "border-box",
  appearance: "none", fontFamily: "inherit",
};

const labelStyle = {
  fontSize: 12, fontWeight: 700, color: C.stone,
  letterSpacing: 1, textTransform: "uppercase",
  marginBottom: 6, display: "block",
};

function SectionLabel({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 8 }}>
      <div style={{ height: 2, width: 14, background: C.accent, borderRadius: 99 }} />
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: C.stone, textTransform: "uppercase" }}>{children}</div>
    </div>
  );
}

function Spinner() {
  return <div style={{ textAlign: "center", padding: 40, color: C.stone, fontSize: 14 }}>Loading…</div>;
}

function ErrorMsg({ msg }) {
  return <div style={{ background: "#fdf0f0", border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 16px", color: C.red, fontSize: 13, marginBottom: 16 }}>{msg}</div>;
}

// ── Auth screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [isSignUp, setIsSignUp]   = useState(false);
  const [isForgot, setIsForgot]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [sent, setSent]           = useState(false);

  const handleForgot = async () => {
    if (!email) { setError("Please enter your email address first"); return; }
    setLoading(true); setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://app.vercro.com",
      });
      if (error) throw error;
      setSent(true);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handle = async () => {
    setLoading(true); setError(null);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSent(true);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth(data.session);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true); setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: "https://app.vercro.com" },
      });
      if (error) throw error;
    } catch (e) { setError(e.message); setLoading(false); }
  };

  if (sent) return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🌱</div>
      <div style={{ fontFamily: "serif", fontSize: 20, fontWeight: 700 }}>Check your email</div>
      <div style={{ color: C.stone, marginTop: 8, fontSize: 14 }}>
        {isForgot
          ? <>We sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the link to set a new password.</>
          : <>We sent a confirmation link to <strong>{email}</strong></>
        }
      </div>
      <button onClick={() => { setSent(false); setIsForgot(false); }} style={{ marginTop: 20, background: "none", border: "none", color: C.forest, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
        Back to sign in
      </button>
    </div>
  );

  return (
    <div style={{ padding: "40px 24px", maxWidth: 400, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 36 }}>🌱</div>
        <div style={{ fontFamily: "serif", fontSize: 26, fontWeight: 700, color: C.forest, marginTop: 8 }}>Vercro</div>
        <div style={{ color: C.stone, fontSize: 13, marginTop: 4 }}>{isSignUp ? "Create your account" : "Sign in to your garden"}</div>
      </div>
      {error && <ErrorMsg msg={error} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Google */}
        <button onClick={handleGoogle} disabled={loading}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", color: "#1a1a1a" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          {loading ? "…" : "Continue with Google"}
        </button>
        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <span style={{ fontSize: 12, color: C.stone }}>or</span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>
        <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" /></div>
        <div><label style={labelStyle}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" /></div>
        <button onClick={handle} disabled={loading || !email || !password} style={{ background: (!email || !password) ? C.border : C.forest, color: (!email || !password) ? C.stone : "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
          {loading ? "…" : isSignUp ? "Create account" : "Sign in"}
        </button>
        <button onClick={() => setIsSignUp(!isSignUp)} style={{ background: "none", border: "none", color: C.forest, fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
          {isSignUp ? "Already have an account? Sign in" : "No account? Sign up"}
        </button>
        {!isSignUp && (
          <button onClick={handleForgot} disabled={loading} style={{ background: "none", border: "none", color: C.stone, fontSize: 12, cursor: "pointer", textDecoration: "underline", marginTop: -8 }}>
            Forgot your password?
          </button>
        )}
      </div>
    </div>
  );
}

// ── Profile Photo Greeting ───────────────────────────────────────────────────
// Small profile photo circle shown in the greeting block on Dashboard.

function ProfilePhotoGreeting({ photoUrl, onUploaded }) {
  const [url, setUrl] = useState(photoUrl);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const dim    = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(dim, 400); // max 400px, stay under Vercel limit
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, (bitmap.width - dim) / 2, (bitmap.height - dim) / 2, dim, dim, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1]; // 70% quality
      const result = await apiFetch("/photos/profile", { method: "POST", body: JSON.stringify({ base64, mime_type: "image/jpeg" }) });
      setUrl(result.photo_url);
      onUploaded(result.photo_url);
    } catch (err) { console.error(err); }
  };

  return (
    <div onClick={() => inputRef.current?.click()} style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid rgba(255,255,255,0.4)", cursor: "pointer", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {url
        ? <img src={url} alt="profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 20, opacity: 0.7 }}>👤</span>
      }
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

// ── Photo Circle ─────────────────────────────────────────────────────────────
// Tappable circular photo. Shows placeholder if no photo. Uploads on tap.

function PhotoCircle({ photoUrl, size, endpoint, onUploaded, placeholder = "📷" }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Crop to square + compress aggressively to stay under Vercel 4.5mb body limit
      const bitmap = await createImageBitmap(file);
      const dim    = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = Math.min(dim, 400); // max 400px
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap,
        (bitmap.width  - dim) / 2, (bitmap.height - dim) / 2, dim, dim,
        0, 0, canvas.width, canvas.height
      );
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1]; // 70% quality
      const result = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ base64, mime_type: "image/jpeg" }),
      });
      onUploaded(result.photo_url);
    } catch (err) { console.error("Photo upload failed:", err); }
    setUploading(false);
  };

  return (
    <div onClick={() => !uploading && inputRef.current?.click()}
      style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
               background: photoUrl ? "transparent" : "#e8efe9",
               border: `2px solid ${photoUrl ? C.sage : C.border}`,
               display: "flex", alignItems: "center", justifyContent: "center",
               cursor: "pointer", position: "relative" }}>
      {photoUrl
        ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.35, opacity: 0.5 }}>{uploading ? "⏳" : placeholder}</span>
      }
      {!uploading && (
        <div style={{ position: "absolute", bottom: 0, right: 0, width: size * 0.32, height: size * 0.32,
                      background: C.forest, borderRadius: "50%", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: size * 0.15, color: "#fff" }}>+</div>
      )}
      <input ref={inputRef} type="file" accept="image/*"
        onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

// ── Area Optimiser Sheet ───────────────────────────────────────────────────────
// Works for every area — empty or populated.
// Empty: "what to plant". Populated: "what to add / boost with".
// ─────────────────────────────────────────────────────────────────────────────

const BENEFIT_TAG_STYLE = {
  display: "inline-block",
  fontSize: 10,
  fontWeight: 600,
  color: C.forest,
  background: "#e8f5ee",
  borderRadius: 20,
  padding: "2px 7px",
  marginRight: 4,
  marginBottom: 4,
};

const CONFIDENCE_BADGE = {
  high:   { label: "Best fit",        bg: "#e8f5ee", color: C.forest },
  medium: { label: "Good option",     bg: "#fdf8ec", color: "#b45309" },
};

function AreaOptimiserSuggestionCard({ s, onAdd, isPrimary }) {
  const isCompanionType = s.type === "companion" || s.type === "beneficial";
  const accentColor     = isCompanionType ? "#7b5ea7" : C.forest;
  const bgColor         = isCompanionType ? "#faf5ff" : C.cardBg;
  const borderColor     = isCompanionType ? "#d4b8e8" : C.border;
  const conf            = CONFIDENCE_BADGE[s.confidence] || CONFIDENCE_BADGE.medium;

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 12,
      padding: "14px 16px",
      marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 24, flexShrink: 0 }}>{getCropEmoji(s.crop)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: "#1a1a1a" }}>{s.crop}</div>
            {s.variety && (
              <div style={{ fontSize: 12, color: accentColor, fontWeight: 600, marginTop: 1 }}>{s.variety}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, marginLeft: 8 }}>
          {isPrimary && (
            <span style={{ fontSize: 9, fontWeight: 700, color: accentColor, background: isCompanionType ? "#f0ebf8" : "#e8f5ee", borderRadius: 20, padding: "2px 7px", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {isCompanionType ? (s.type === "companion" ? "Companion" : "Beneficial") : "Top pick"}
            </span>
          )}
          <span style={{ fontSize: 9, fontWeight: 700, color: conf.color, background: conf.bg, borderRadius: 20, padding: "2px 7px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {conf.label}
          </span>
        </div>
      </div>

      {/* Reason */}
      <div style={{ fontSize: 13, color: "#1a1a1a", lineHeight: 1.45, marginBottom: 8 }}>{s.reason}</div>

      {/* Companion note — highlighted */}
      {s.companion_note && (
        <div style={{ fontSize: 12, color: accentColor, background: isCompanionType ? "#f0ebf8" : "#e8f5ee", borderRadius: 8, padding: "6px 10px", marginBottom: 8, lineHeight: 1.4 }}>
          🌿 {s.companion_note}
        </div>
      )}

      {/* Sow note */}
      {s.sow_note && (
        <div style={{ fontSize: 12, color: C.stone, marginBottom: 6, lineHeight: 1.4 }}>🗓 {s.sow_note}</div>
      )}

      {/* Placement note */}
      {s.placement_note && (
        <div style={{ fontSize: 12, color: C.stone, fontStyle: "italic", marginBottom: 8, lineHeight: 1.4 }}>📍 {s.placement_note}</div>
      )}

      {/* Benefit tags */}
      {s.benefit_tags?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {s.benefit_tags.map((tag, i) => (
            <span key={i} style={BENEFIT_TAG_STYLE}>{tag}</span>
          ))}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => onAdd(s)}
        style={{
          width: "100%",
          background: accentColor,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px",
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "serif",
          letterSpacing: 0.2,
        }}>
        + Add {s.crop} to this area
      </button>
    </div>
  );
}

function PlantingSuggestionsSheet({ area, hasCrops = false, onClose, onAddCrop }) {
  const [state,       setState]       = useState("loading"); // loading | generating | ready | error
  const [suggestions, setSuggestions] = useState([]);
  const [summary,     setSummary]     = useState(null);
  const [isEmptyArea, setIsEmptyArea] = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);

  useEffect(() => { loadOrGenerate(); }, []);

  const loadOrGenerate = async () => {
    setState("loading");
    try {
      const existing = await apiFetch("/areas/" + area.id + "/suggestions");
      if (existing?.suggestions?.length) {
        setSuggestions(existing.suggestions);
        setSummary(existing.summary || null);
        setIsEmptyArea(existing.is_empty_area || false);
        setGeneratedAt(existing.generated_at);
        setState("ready");
      } else {
        generate();
      }
    } catch (e) { setState("error"); }
  };

  const generate = async () => {
    setState("generating");
    try {
      const result = await apiFetch("/areas/" + area.id + "/suggestions/generate", { method: "POST" });
      setSuggestions(result.suggestions || []);
      setSummary(result.summary || null);
      setIsEmptyArea(result.is_empty_area || false);
      setGeneratedAt(result.generated_at);
      setState("ready");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  };

  // Primary crop is first suggestion of type crop/primary_crop
  // Companion/beneficial suggestions follow
  const primarySuggestion    = suggestions.find(s => s.type === "crop" || s.type === "primary_crop");
  const companionSuggestions = suggestions.filter(s => s.type === "companion" || s.type === "beneficial");

  const handleAdd = (s) => {
    onClose({ prefill: {
      name:         s.crop,
      variety:      s.variety,
      is_companion: s.type === "companion" || s.type === "beneficial",
    }});
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "24px 20px 44px", width: "100%", maxWidth: 440, margin: "0 auto", maxHeight: "88vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Boost this area</div>
            <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>{area.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.stone, padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Loading */}
        {state === "loading" && (
          <div style={{ textAlign: "center", padding: "48px 0" }}><Spinner /></div>
        )}

        {/* Generating */}
        {state === "generating" && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.stone }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Checking your garden...</div>
            <div style={{ fontSize: 12 }}>Looking at what's growing, the season, and what works together</div>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>Something went wrong. Try again?</div>
            <button onClick={generate} style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
              Try again
            </button>
          </div>
        )}

        {/* Ready */}
        {state === "ready" && (
          <>
            {/* Summary strip */}
            {summary && (
              <div style={{
                background: "#f0f7f4",
                border: `1px solid #c4ddd2`,
                borderRadius: 10,
                padding: "10px 14px",
                marginTop: 12,
                marginBottom: 18,
                fontSize: 13,
                color: "#1a1a1a",
                lineHeight: 1.45,
              }}>
                💡 {summary}
              </div>
            )}

            {/* No suggestions fallback */}
            {suggestions.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 20px", color: C.stone }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Nothing strong to suggest right now</div>
                <div style={{ fontSize: 13 }}>Check back as the season progresses — or add a crop first to get companion ideas.</div>
              </div>
            )}

            {/* Primary crop suggestion */}
            {primarySuggestion && (
              <>
                <SectionLabel>{isEmptyArea ? "Best crop to start with" : "Best crop to add"}</SectionLabel>
                <AreaOptimiserSuggestionCard s={primarySuggestion} onAdd={handleAdd} isPrimary={true} />
              </>
            )}

            {/* Companion / beneficial suggestions */}
            {companionSuggestions.length > 0 && (
              <>
                <SectionLabel>Companion suggestions</SectionLabel>
                {companionSuggestions.map((s, i) => (
                  <AreaOptimiserSuggestionCard key={i} s={s} onAdd={handleAdd} isPrimary={false} />
                ))}
              </>
            )}

            {/* Footer context */}
            {generatedAt && (
              <div style={{ fontSize: 11, color: C.stone, textAlign: "center", marginTop: 8 }}>
                Based on your garden · {new Date(generatedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}


// ── Crop emoji map ────────────────────────────────────────────────────────────
const CROP_EMOJI = {
  tomato: "🍅", tomatoes: "🍅",
  carrot: "🥕", carrots: "🥕",
  potato: "🥔", potatoes: "🥔",
  lettuce: "🥬", spinach: "🥬", kale: "🥬", chard: "🥬",
  courgette: "🥒", zucchini: "🥒", cucumber: "🥒",
  pear: "🍐", pears: "🍐",
  pea: "🫛", peas: "🫛", "mange tout": "🫛", mangetout: "🫛",
  bean: "🫘", beans: "🫘", "french bean": "🫘", "runner bean": "🫘",
  onion: "🧅", onions: "🧅", shallot: "🧅", leek: "🧅",
  garlic: "🧄",
  strawberry: "🍓", strawberries: "🍓",
  apple: "🍎", apples: "🍎",
  blueberry: "🫐", blueberries: "🫐",
  pumpkin: "🎃", squash: "🎃",
  corn: "🌽", sweetcorn: "🌽", "sweet corn": "🌽",
  pepper: "🫑", peppers: "🫑", chilli: "🌶️", chili: "🌶️",
  broccoli: "🥦", cauliflower: "🥦", cabbage: "🥦",
  "brussels sprout": "🥦", "brussels sprouts": "🥦",
  aubergine: "🍆", eggplant: "🍆",
  radish: "🫚", turnip: "🟣", swede: "🟤",
  beetroot: "🔴", beet: "🔴",
  herb: "🌿", basil: "🌿", parsley: "🌿", mint: "🌿", thyme: "🌿",
  rosemary: "🌿", chive: "🌿", chives: "🌿", coriander: "🌿",
};

function getCropEmoji(name) {
  if (!name) return "🌱";
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(CROP_EMOJI)) {
    if (lower.includes(key)) return emoji;
  }
  return "🌱";
}

// ── Share Harvest Card ────────────────────────────────────────────────────────
// Generates a 1080x1080 canvas image for sharing to WhatsApp, Instagram etc.

function ShareHarvestSheet({ item, harvestData, allHarvests, onClose }) {
  const [mode,       setMode]       = useState("single"); // "single" | "season"
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef(null);

  const scoreColor = (v) => v >= 8 ? "#6FAF63" : v >= 5 ? "#D9A441" : "#C65A5A";

  const generateCard = async () => {
    setGenerating(true);
    const canvas = document.createElement("canvas");
    canvas.width  = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");

    if (mode === "single") {
      await drawSingleCard(ctx, canvas);
    } else {
      await drawSeasonCard(ctx, canvas);
    }

    // Download
    const link = document.createElement("a");
    link.download = mode === "single"
      ? `vercro-harvest-${item.crop.toLowerCase().replace(/\s+/g,"-")}.png`
      : `vercro-season-${new Date().getFullYear()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setGenerating(false);
  };

  const drawSingleCard = async (ctx, canvas) => {
    const W = 1080, H = 1080;

    // Background — forest green gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#2F5D50");
    bg.addColorStop(1, "#1e3d33");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Decorative circles
    ctx.beginPath(); ctx.arc(W + 80, -80, 300, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fill();
    ctx.beginPath(); ctx.arc(-60, H + 60, 250, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,0.03)"; ctx.fill();

    // Crop photo (if available)
    if (harvestData?.photo_url) {
      try {
        const img = await loadImage(harvestData.photo_url);
        const size = 320;
        ctx.save();
        ctx.beginPath();
        ctx.arc(W/2, 320, size/2, 0, Math.PI*2);
        ctx.clip();
        ctx.drawImage(img, W/2 - size/2, 320 - size/2, size, size);
        ctx.restore();
        // Ring around photo
        ctx.beginPath(); ctx.arc(W/2, 320, size/2 + 4, 0, Math.PI*2);
        ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 6; ctx.stroke();
      } catch(e) {}
    }

    const hasPhoto = !!harvestData?.photo_url;
    const yStart   = hasPhoto ? 520 : 280;

    // Emoji
    ctx.font = hasPhoto ? "80px serif" : "120px serif";
    ctx.textAlign = "center";
    ctx.fillText(getCropEmoji(item.crop), W/2, yStart);

    // Crop name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 72px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(item.crop, W/2, yStart + (hasPhoto ? 90 : 120));

    // Variety
    if (item.variety) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "42px Georgia, serif";
      ctx.fillText(item.variety, W/2, yStart + (hasPhoto ? 145 : 178));
    }

    // Divider
    const divY = yStart + (item.variety ? (hasPhoto ? 175 : 215) : (hasPhoto ? 120 : 155));
    ctx.beginPath();
    ctx.moveTo(W/2 - 120, divY); ctx.lineTo(W/2 + 120, divY);
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2; ctx.stroke();

    // Stats row
    const statsY = divY + 60;
    const stats  = [
      harvestData?.quantity_value ? `${harvestData.quantity_value}${harvestData.quantity_unit}` : null,
      harvestData?.yield_score    ? `Yield ${harvestData.yield_score}/10`    : null,
      harvestData?.quality_score  ? `Quality ${harvestData.quality_score}/10` : null,
    ].filter(Boolean);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "38px DM Sans, sans-serif";
    ctx.textAlign = "center";
    const statsStr = stats.join("  ·  ");
    ctx.fillText(statsStr, W/2, statsY);

    // Date
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "34px DM Sans, sans-serif";
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    ctx.fillText(`Harvested ${dateStr}`, W/2, statsY + 55);

    // Area / location
    if (item.area_name) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "30px DM Sans, sans-serif";
      ctx.fillText(item.area_name, W/2, statsY + 105);
    }

    // Vercro branding
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 36px Georgia, serif";
    ctx.fillText("🌱 Grown with Vercro", W/2, H - 60);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "26px DM Sans, sans-serif";
    ctx.fillText("vercro.com", W/2, H - 20);
  };

  const drawSeasonCard = async (ctx, canvas) => {
    const W = 1080, H = 1080;
    const year = new Date().getFullYear();

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#2F5D50");
    bg.addColorStop(1, "#1e3d33");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Decorative circles
    ctx.beginPath(); ctx.arc(W + 80, -80, 300, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fill();

    // Title
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "36px DM Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${year} Garden Harvest`, W/2, 100);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 80px Georgia, serif";
    ctx.fillText("Season Summary", W/2, 190);

    // Build crop totals
    const byName = {};
    allHarvests.forEach(h => {
      if (!byName[h.crop_name]) byName[h.crop_name] = { name: h.crop_name, total: 0, unit: h.quantity_unit, count: 0 };
      if (h.quantity_value) byName[h.crop_name].total += parseFloat(h.quantity_value);
      byName[h.crop_name].count++;
    });
    const crops = Object.values(byName).sort((a,b) => b.total - a.total).slice(0, 6);

    // Crop rows
    let rowY = 280;
    crops.forEach((c, i) => {
      const rowBg = ctx.createLinearGradient(80, rowY-50, W-80, rowY+10);
      rowBg.addColorStop(0, "rgba(255,255,255,0.08)");
      rowBg.addColorStop(1, "rgba(255,255,255,0.04)");
      ctx.fillStyle = rowBg;
      ctx.beginPath();
      ctx.roundRect(80, rowY - 50, W - 160, 80, 16);
      ctx.fill();

      ctx.font = "48px serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff";
      ctx.fillText(getCropEmoji(c.name), 110, rowY + 8);

      ctx.font = "bold 40px Georgia, serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(c.name, 180, rowY + 8);

      if (c.total > 0) {
        ctx.font = "36px DM Sans, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.textAlign = "right";
        ctx.fillText(`${c.total}${c.unit || ""}`, W - 110, rowY + 8);
      }
      ctx.textAlign = "left";
      rowY += 110;
    });

    // Total
    const totalY = rowY + 20;
    ctx.beginPath();
    ctx.moveTo(80, totalY - 20); ctx.lineTo(W - 80, totalY - 20);
    ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(`${allHarvests.length} total harvests this season`, W/2, totalY + 40);

    // Vercro branding
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 36px Georgia, serif";
    ctx.fillText("🌱 Grown with Vercro", W/2, H - 60);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "26px DM Sans, sans-serif";
    ctx.fillText("vercro.com", W/2, H - 20);
  };

  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "24px 20px 44px", width: "100%", maxWidth: 440, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Share your harvest 🌱</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.stone }}>×</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { id: "single", label: `${getCropEmoji(item.crop)} This harvest` },
            { id: "season", label: "📊 Season summary" },
          ].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${mode === m.id ? C.forest : C.border}`, background: mode === m.id ? "#f0f5f3" : "transparent", color: mode === m.id ? C.forest : C.stone, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div style={{ background: `linear-gradient(135deg, #2F5D50, #1e3d33)`, borderRadius: 14, padding: "24px 20px", marginBottom: 20, color: "#fff", textAlign: "center" }}>
          {mode === "single" ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 8 }}>{getCropEmoji(item.crop)}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "serif", marginBottom: 4 }}>{item.crop}</div>
              {item.variety && <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>{item.variety}</div>}
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>
                {[harvestData?.quantity_value ? `${harvestData.quantity_value}${harvestData.quantity_unit}` : null, harvestData?.yield_score ? `Yield ${harvestData.yield_score}/10` : null].filter(Boolean).join(" · ")}
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>🌱 Grown with Vercro · vercro.com</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", marginBottom: 12 }}>{new Date().getFullYear()} Season Summary</div>
              {Object.entries(allHarvests.reduce((acc, h) => { acc[h.crop_name] = (acc[h.crop_name] || 0) + 1; return acc; }, {})).slice(0,4).map(([name, count]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, opacity: 0.9 }}>
                  <span>{getCropEmoji(name)} {name}</span>
                  <span>{count} harvest{count !== 1 ? "s" : ""}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 12 }}>🌱 Grown with Vercro · vercro.com</div>
            </>
          )}
        </div>

        <button onClick={generateCard} disabled={generating}
          style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "serif", opacity: generating ? 0.7 : 1 }}>
          {generating ? "Generating…" : "⬇ Save image to share"}
        </button>

        <div style={{ fontSize: 11, color: C.stone, textAlign: "center", marginTop: 10 }}>
          Saves as 1080×1080px — perfect for Instagram, WhatsApp and Facebook
        </div>
      </div>
    </div>
  );
}

// ── Harvest Forecast Card ─────────────────────────────────────────────────────

function HarvestForecastCard({ item, onHarvest, pending }) {
  const now    = Date.now();
  const start  = new Date(item.window_start).getTime();
  const end    = new Date(item.window_end).getTime();
  const weeksLeft = Math.max(0, Math.round((start - now) / (7*24*60*60*1000)));
  const isReady = weeksLeft === 0;

  const borderColor = C.forest;
  const bgColor     = C.cardBg;
  const barColor    = C.amber;

  // Committed optimal harvest date — 35% into the window
  const optimalDate = new Date(start + (end - start) * 0.35);
  const optimalStr  = optimalDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  // Progress bar — journey toward harvest window
  const journeyStart = start - 60 * 24 * 60 * 60 * 1000;
  const pct = Math.min(100, Math.max(0, Math.round(((now - journeyStart) / (end - journeyStart)) * 100)));

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}44`, borderLeft: `3px solid ${borderColor}`, borderRadius: 12, padding: "12px 14px", transition: "all 0.3s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{getCropEmoji(item.crop)}</span>
          <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "serif", color: "#1a1a1a" }}>{item.crop}</div>
        </div>
        {isReady
          ? <span style={{ fontSize: 10, fontWeight: 700, color: C.forest, background: "#e8f4e8", borderRadius: 20, padding: "2px 8px" }}>Ready now</span>
          : <span style={{ fontSize: 10, color: C.stone, background: C.offwhite, borderRadius: 20, padding: "2px 8px" }}>{weeksLeft}w away</span>
        }
      </div>
      {item.variety && <div style={{ fontSize: 11, color: C.stone, marginBottom: 4 }}>{item.variety}</div>}
      <div style={{ fontSize: 11, color: C.forest, fontWeight: 600, marginBottom: 8 }}>
        🎯 Aim to harvest around {optimalStr}
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ height: 5, background: C.border, borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: pct + "%", background: barColor, borderRadius: 99, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          <span style={{ fontSize: 10, color: C.stone }}>{new Date(item.window_start).toLocaleDateString("en-GB", { month: "short" })}</span>
          <span style={{ fontSize: 10, color: C.stone }}>{new Date(item.window_end).toLocaleDateString("en-GB", { month: "short" })}</span>
        </div>
      </div>
      <button onClick={() => !pending && onHarvest()}
        style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none", background: pending ? "#e0a070" : borderColor, color: "#fff", fontWeight: 700, fontSize: 12, cursor: pending ? "default" : "pointer", transition: "all 0.3s", opacity: pending ? 0.8 : 1 }}>
        {pending ? "Logging…" : "🌾 Harvest Now"}
      </button>
    </div>
  );
}


// ── Harvest Modal ─────────────────────────────────────────────────────────────

function HarvestModal({ item, onClose, onSaved, allHarvests = [] }) {
  const [yieldScore,   setYieldScore]   = useState(5);
  const [qualScore,    setQualScore]    = useState(5);
  const [quantity,     setQuantity]     = useState("");
  const [unit,         setUnit]         = useState("kg");
  const [notes,        setNotes]        = useState("");
  const [photo,        setPhoto]        = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(null); // harvest log entry id
  const [saveError,    setSaveError]    = useState(null);
  const [undone,       setUndone]       = useState(false);
  const [showShare,    setShowShare]    = useState(false);
  const [savedEntry,   setSavedEntry]   = useState(null); // full entry data for share card
  const [isFinal,      setIsFinal]      = useState(true); // true = final harvest, false = partial

  const trafficColor = (val) => {
    if (val <= 3) return C.red;
    if (val <= 6) return C.amber;
    return C.leaf;
  };

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const uploadPhoto = async (entryId) => {
    if (!photo) return;
    const reader = new FileReader();
    reader.readAsDataURL(photo);
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
      await apiFetch(`/harvest-log/${entryId}/photo`, {
        method: "POST",
        body: JSON.stringify({ base64, filename: photo.name, mime_type: photo.type }),
      });
    };
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const entry = await apiFetch("/harvest-log", {
        method: "POST",
        body: JSON.stringify({
          crop_instance_id: item.crop_instance_id || null,
          crop_name:        item.crop,
          variety:          item.variety || null,
          yield_score:      yieldScore,
          quality_score:    qualScore,
          quantity_value:   quantity ? parseFloat(quantity) : null,
          quantity_unit:    quantity ? unit : null,
          notes:            notes.trim() || null,
          partial:          !isFinal,
        }),
      });
      setSaved(entry.id);
      setSavedEntry({ ...entry, photo_url: photoPreview || null });
      if (photo) await uploadPhoto(entry.id);
      onSaved(item.crop_instance_id, isFinal);
    } catch (e) {
      console.error(e);
      setSaveError(e.message || "Something went wrong. Please try again.");
    }
    setSaving(false);
  };

  const undo = async () => {
    if (!saved) return;
    try {
      await apiFetch(`/harvest-log/${saved}`, { method: "DELETE" });
      setUndone(true);
      setTimeout(onClose, 1500);
    } catch (e) { console.error(e); }
  };

  return (
    <>
    {showShare && (
      <ShareHarvestSheet
        item={item}
        harvestData={savedEntry}
        allHarvests={allHarvests}
        onClose={() => { setShowShare(false); onClose(); }}
      />
    )}
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget && !saved) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 440, margin: "0 auto" }}>

        {undone ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: C.stone }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>↩️</div>
            <div style={{ fontWeight: 700, fontFamily: "serif" }}>Harvest undone</div>
          </div>
        ) : saved ? (
          <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{isFinal ? "🎉" : "🌾"}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>
              {isFinal ? "Harvest logged!" : "Partial harvest logged!"}
            </div>
            <div style={{ fontSize: 13, color: C.stone, marginBottom: 4 }}>{item.crop}{item.variety ? ` — ${item.variety}` : ""}</div>
            {!isFinal && (
              <div style={{ fontSize: 12, color: C.leaf, marginBottom: 16, fontWeight: 600 }}>
                ✓ Crop stays active — more harvests to come
              </div>
            )}
            {/* Share prompt — only for final harvests */}
            {isFinal && (
              <div style={{ background: "#f0f7f4", border: `1px solid ${C.sage}`, borderRadius: 12, padding: "14px", marginBottom: 16, textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a", marginBottom: 4 }}>Share your harvest? 🌱</div>
                <div style={{ fontSize: 12, color: C.stone, marginBottom: 12 }}>Save a card to share with your allotment group or on social media.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowShare(true)}
                    style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    Share harvest card
                  </button>
                  <button onClick={onClose}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    Skip
                  </button>
                </div>
              </div>
            )}
            {isFinal ? (
              <button onClick={undo} style={{ width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                Undo harvest
              </button>
            ) : (
              <button onClick={onClose} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Done
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>Log Harvest</div>
            <div style={{ fontSize: 13, color: C.stone, marginBottom: 16 }}>{item.crop}{item.variety ? ` — ${item.variety}` : ""}</div>

            {/* Final vs Partial toggle */}
            <div style={{ background: "#f5f5f0", borderRadius: 12, padding: 4, display: "flex", marginBottom: 20, gap: 4 }}>
              <button
                onClick={() => setIsFinal(true)}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 9, border: "none", background: isFinal ? "#fff" : "transparent", color: isFinal ? "#1a1a1a" : C.stone, fontWeight: isFinal ? 700 : 500, fontSize: 13, cursor: "pointer", boxShadow: isFinal ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s" }}>
                🧺 Final harvest
              </button>
              <button
                onClick={() => setIsFinal(false)}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 9, border: "none", background: !isFinal ? "#fff" : "transparent", color: !isFinal ? "#1a1a1a" : C.stone, fontWeight: !isFinal ? 700 : 500, fontSize: 13, cursor: "pointer", boxShadow: !isFinal ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.15s" }}>
                🔄 More to come
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.stone, marginBottom: 20, textAlign: "center" }}>
              {isFinal ? "Crop will be marked as done after saving." : "Crop stays active — you can log more harvests later."}
            </div>

            {/* Yield score */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Yield Volume</label>
                <span style={{ fontSize: 18, fontWeight: 800, color: trafficColor(yieldScore) }}>{yieldScore}</span>
              </div>
              <input type="range" min="1" max="10" value={yieldScore} onChange={e => setYieldScore(Number(e.target.value))}
                style={{ width: "100%", accentColor: trafficColor(yieldScore) }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.stone, marginTop: 2 }}>
                <span>Poor</span><span>Excellent</span>
              </div>
            </div>

            {/* Quality score */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Quality</label>
                <span style={{ fontSize: 18, fontWeight: 800, color: trafficColor(qualScore) }}>{qualScore}</span>
              </div>
              <input type="range" min="1" max="10" value={qualScore} onChange={e => setQualScore(Number(e.target.value))}
                style={{ width: "100%", accentColor: trafficColor(qualScore) }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.stone, marginTop: 2 }}>
                <span>Poor</span><span>Excellent</span>
              </div>
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: 16, display: "flex", gap: 10 }}>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Quantity (optional)</label>
                <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} style={inputStyle} placeholder="e.g. 2.5" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Unit</label>
                <select value={unit} onChange={e => setUnit(e.target.value)} style={inputStyle}>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="number">number</option>
                  <option value="bunch">bunch</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                style={{ ...inputStyle, height: 64, resize: "none" }} placeholder="Any notes about this harvest…" />
            </div>

            {/* Photo */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Photo (optional)</label>
              {photoPreview ? (
                <div style={{ position: "relative" }}>
                  <img src={photoPreview} alt="preview" style={{ width: "100%", borderRadius: 10, maxHeight: 160, objectFit: "cover" }} />
                  <button onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                    style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", color: "#fff", width: 24, height: 24, cursor: "pointer", fontSize: 14 }}>×</button>
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "14px", cursor: "pointer", color: C.stone, fontSize: 13 }}>
                  📷 Add a photo
                  <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                </label>
              )}
            </div>

            {saveError && (
              <div style={{ background: "#fff0f0", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: C.red }}>
                {saveError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={save} disabled={saving}
                style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving…" : "Save Harvest"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}


// =============================================================================
// BADGES & CHALLENGES
// =============================================================================

const BADGE_CATEGORIES = ["getting_started","progress","variety","harvest","seasonal","tasks","planning","sowing","photos","consistency"];
const CATEGORY_LABELS  = { getting_started:"Getting Started", progress:"Progress", variety:"Variety", harvest:"Harvest", seasonal:"Seasonal", tasks:"Tasks", planning:"Planning", sowing:"Sowing", photos:"Photos & Sharing", consistency:"Consistency" };

function useBadges() {
  const [badges, setBadges] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { const d = await apiFetch("/badges"); setBadges(d); }
    catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return { badges, loading, reload: load };
}

// ── Badge Celebration Sheet ───────────────────────────────────────────────────
function BadgeCelebrationSheet({ unlocks, onClose }) {
  const [idx, setIdx] = useState(0);
  if (!unlocks?.length) return null;
  const u = unlocks[idx];

  const handleNext = async () => {
    // Mark as shown
    try { await apiFetch("/badges/mark-shown", { method: "POST", body: JSON.stringify({ ids: [u.id] }) }); } catch(e) {}
    if (idx < unlocks.length - 1) setIdx(idx + 1);
    else onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:2000, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", padding:"32px 24px 48px", width:"100%", maxWidth:440, textAlign:"center" }}>
        {/* Sparkle animation */}
        <div style={{ fontSize:72, marginBottom:8, animation:"badgePop 0.4s ease-out" }}>{u.badge?.icon_key || "🏆"}</div>
        <div style={{ fontSize:13, fontWeight:700, color:C.forest, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>
          {u.badge?.type === "monthly" ? "Challenge Complete" : "Badge Unlocked"}
        </div>
        <div style={{ fontSize:24, fontWeight:700, fontFamily:"serif", color:"#1a1a1a", marginBottom:8 }}>{u.badge?.title}</div>
        <div style={{ fontSize:14, color:C.stone, marginBottom:u.badge?.celebration_copy ? 8 : 24, lineHeight:1.5 }}>{u.badge?.description}</div>
        {u.badge?.celebration_copy && (
          <div style={{ fontSize:15, color:C.forest, fontStyle:"italic", marginBottom:24 }}>{u.badge.celebration_copy}</div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={handleNext}
            style={{ background:C.forest, color:"#fff", border:"none", borderRadius:12, padding:"14px", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"serif" }}>
            {idx < unlocks.length - 1 ? "Next →" : "Continue"}
          </button>
        </div>
        {unlocks.length > 1 && (
          <div style={{ marginTop:12, fontSize:12, color:C.stone }}>{idx + 1} of {unlocks.length}</div>
        )}
      </div>
    </div>
  );
}

// ── Today Badge Buttons ───────────────────────────────────────────────────────
function TodayBadgeCard({ onViewBadges }) {
  const { badges, loading } = useBadges();
  if (loading || !badges) return null;

  const recentEarned = (badges.recent_unlocks || []).slice(0, 5);
  const nextBadge = (badges.badges || [])
    .filter(b => !b.is_completed)
    .sort((a, b) => (b.current_progress / b.threshold_value) - (a.current_progress / a.threshold_value))[0];
  const monthly = badges.monthly_challenge;
  const next = nextBadge || (monthly && !monthly.is_completed ? monthly : null);

  // Stacked emoji — overlapping like admin pill buttons content
  const stackedIcons = recentEarned.length > 0
    ? <span style={{ position:"relative", display:"inline-flex", alignItems:"center" }}>
        {recentEarned.map((u, i) => (
          <span key={i} style={{ position:"relative", marginLeft: i === 0 ? 0 : -6, fontSize:14, zIndex: recentEarned.length - i }}>
            {u.badge?.icon_key || "🏆"}
          </span>
        ))}
      </span>
    : <span style={{ fontSize:14, opacity:0.4 }}>🏆</span>;

  return (
    <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
      {/* Earned badges pill */}
      <button onClick={onViewBadges}
        style={{ padding:"8px 14px", borderRadius:20, border:`1px solid ${C.border}`, background:"transparent", color:C.stone, fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap" }}>
        {stackedIcons}
        <span>{recentEarned.length > 0 ? `${recentEarned.length} earned` : "No badges yet"}</span>
      </button>

      {/* Next badge pill */}
      {next && (
        <button onClick={onViewBadges}
          style={{ padding:"8px 14px", borderRadius:20, border:`1px solid ${C.border}`, background:"transparent", color:C.stone, fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap" }}>
          <span style={{ fontSize:14, filter:"grayscale(1)", opacity:0.5 }}>{next.icon_key || next.icon_key}</span>
          <span style={{ color:"#888" }}>{next.title || next.title}</span>
          <span style={{ color:C.stone, fontWeight:400 }}>
            {next.current_progress !== undefined
              ? `${next.current_progress} / ${next.threshold_value}`
              : `${next.progress} / ${next.threshold}`}
          </span>
        </button>
      )}
    </div>
  );
}

// ── Badge Card ────────────────────────────────────────────────────────────────
function BadgeCard({ badge }) {
  const pct = Math.min(100, Math.round((badge.current_progress / badge.threshold_value) * 100));
  const locked = !badge.is_completed && badge.current_progress === 0;

  return (
    <div style={{ background: locked ? "#f8f8f8" : C.cardBg, border:`1px solid ${locked ? "#e8e8e8" : C.border}`, borderRadius:12, padding:"14px", opacity: locked ? 0.7 : 1 }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom: badge.is_completed ? 4 : 10 }}>
        <span style={{ fontSize:28, filter: locked ? "grayscale(1)" : "none" }}>{badge.icon_key}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color: locked ? "#888" : "#1a1a1a" }}>{badge.title}</div>
          <div style={{ fontSize:11, color:C.stone, lineHeight:1.4, marginTop:2 }}>{badge.description}</div>
        </div>
        {badge.is_completed && <span style={{ fontSize:16 }}>✅</span>}
      </div>
      {badge.is_completed ? (
        <div style={{ fontSize:11, color:C.forest, fontWeight:600 }}>
          Earned {new Date(badge.completed_at).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
        </div>
      ) : (
        <>
          <div style={{ height:5, background:"#e8e8e8", borderRadius:99, overflow:"hidden", marginBottom:4 }}>
            <div style={{ height:"100%", width:pct+"%", background: pct > 0 ? C.forest : "#ccc", borderRadius:99, transition:"width 0.5s" }} />
          </div>
          <div style={{ fontSize:11, color:C.stone, textAlign:"right" }}>{badge.current_progress} / {badge.threshold_value}</div>
        </>
      )}
    </div>
  );
}

// ── Badges Page ───────────────────────────────────────────────────────────────
function BadgesPage() {
  const { badges, loading } = useBadges();
  const [activeSection, setActiveSection] = useState("active");

  if (loading) return <div style={{ padding:32, textAlign:"center" }}><Spinner /></div>;
  if (!badges) return <div style={{ padding:24, color:C.stone }}>Unable to load badges.</div>;

  const allBadges     = badges.badges || [];
  const monthly       = badges.monthly_challenge;
  const recentUnlocks = badges.recent_unlocks || [];
  const counters      = badges.counters || {};

  // Active: incomplete with progress, sorted by % complete desc
  const active = allBadges
    .filter(b => !b.is_completed)
    .sort((a, b) => (b.current_progress / b.threshold_value) - (a.current_progress / a.threshold_value))
    .slice(0, 5);

  // Earned: completed badges
  const earned = allBadges.filter(b => b.is_completed)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

  const SECTIONS = [
    { id:"active",     label:"Active" },
    { id:"collection", label:"Collection" },
    { id:"earned",     label:"Earned" },
  ];

  return (
    <div style={{ padding:"16px 16px 100px" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:700, fontFamily:"serif", color:"#1a1a1a" }}>Challenges & Badges</div>
        <div style={{ fontSize:13, color:C.stone, marginTop:2 }}>Track progress and unlock rewards for real garden activity.</div>
      </div>

      {/* Section tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            style={{ flex:1, padding:"9px", borderRadius:10, border:`2px solid ${activeSection === s.id ? C.forest : C.border}`, background: activeSection === s.id ? "#f0f5f3" : "transparent", color: activeSection === s.id ? C.forest : C.stone, fontWeight:700, fontSize:13, cursor:"pointer" }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Active section ── */}
      {activeSection === "active" && (
        <div>
          {/* Monthly challenge */}
          {monthly && (
            <div style={{ background:C.cardBg, border:`2px solid ${C.forest}`, borderRadius:12, padding:"16px", marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:24 }}>{monthly.icon_key}</span>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.forest, textTransform:"uppercase", letterSpacing:0.8 }}>Monthly Challenge</div>
                    <div style={{ fontSize:15, fontWeight:700, fontFamily:"serif", color:"#1a1a1a" }}>{monthly.title}</div>
                  </div>
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:monthly.is_completed ? C.forest : "#1a1a1a" }}>
                  {monthly.is_completed ? "✅ Done" : `${monthly.progress} / ${monthly.threshold}`}
                </span>
              </div>
              <div style={{ fontSize:13, color:C.stone, marginBottom:10 }}>{monthly.description}</div>
              {!monthly.is_completed && (
                <div style={{ height:8, background:C.border, borderRadius:99, overflow:"hidden" }}>
                  <div style={{ height:"100%", width: Math.min(100, Math.round(monthly.progress / monthly.threshold * 100)) + "%", background:C.forest, borderRadius:99, transition:"width 0.5s" }} />
                </div>
              )}
            </div>
          )}

          {/* Active milestones */}
          <div style={{ fontSize:13, fontWeight:700, color:C.stone, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>In Progress</div>
          {active.length === 0 ? (
            <div style={{ background:C.offwhite, borderRadius:12, padding:"20px", textAlign:"center" }}>
              <div style={{ fontSize:13, color:C.stone }}>No badges in progress yet.</div>
              <div style={{ fontSize:12, color:C.stone, marginTop:4 }}>Complete tasks, add crops and log harvests to get started.</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {active.map(b => <BadgeCard key={b.id} badge={b} />)}
            </div>
          )}

          {/* Streak card removed — replaced by real garden activity badges */}
        </div>
      )}

      {/* ── Collection section ── */}
      {activeSection === "collection" && (
        <div>
          {BADGE_CATEGORIES.map(cat => {
            const catBadges = allBadges.filter(b => b.category === cat);
            if (!catBadges.length) return null;
            return (
              <div key={cat} style={{ marginBottom:24 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.stone, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>{CATEGORY_LABELS[cat]}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {catBadges.map(b => <BadgeCard key={b.id} badge={b} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Earned section ── */}
      {activeSection === "earned" && (
        <div>
          {earned.length === 0 ? (
            <div style={{ background:C.offwhite, borderRadius:12, padding:"32px 20px", textAlign:"center" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🌱</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#1a1a1a", marginBottom:6 }}>Start growing your collection</div>
              <div style={{ fontSize:13, color:C.stone, lineHeight:1.5 }}>Complete tasks, add crops, log sowing and harvests to unlock your first badges.</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {earned.map(b => <BadgeCard key={b.id} badge={b} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Share Garden Sheet ───────────────────────────────────────────────────────
function ShareGardenSheet({ onClose }) {
  const [mode,        setMode]        = useState("recent");
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [photo,       setPhoto]       = useState(null);
  const [photoB64,    setPhotoB64]    = useState(null);
  const [title,       setTitle]       = useState("");
  const [generating,  setGenerating]  = useState(false);
  const [caption,     setCaption]     = useState("");
  const [captionCopied, setCaptionCopied] = useState(false);
  const [taskLabels,  setTaskLabels]  = useState(["", "", ""]); // user-editable overrides
  const photoInputRef   = useRef(null);
  const previewRef      = useRef(null);

  // Draw the card onto any canvas — shared by preview + export
  // 1080×1350 = Instagram 4:5 safe zone — shows in full on feed without cropping
  const drawCard = async (canvas) => {
    if (!data) return;
    const W = 1080, H = 1350;
    const PAD = 54;
    const ctx = canvas.getContext("2d");

    // ── Rich dark forest background ───────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0,   "#1e3d33");
    bgGrad.addColorStop(0.5, "#2F5D50");
    bgGrad.addColorStop(1,   "#1a3528");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Decorative depth circles
    ctx.beginPath(); ctx.arc(960, 140, 260, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(111,175,99,0.06)"; ctx.fill();
    ctx.beginPath(); ctx.arc(120, 1260, 280, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.025)"; ctx.fill();
    ctx.beginPath(); ctx.arc(880, 1000, 160, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(217,164,65,0.06)"; ctx.fill();

    // Dot accents top
    [80,160,240,840,920,1000].forEach(x => {
      ctx.beginPath(); ctx.arc(x, 150, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();
    });

    // ── Header row ────────────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(PAD, 70, 210, 52, 26);
    else ctx.rect(PAD, 70, 210, 52);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("🌱 Vercro", PAD + 105, 105);

    const monthName = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
    ctx.fillStyle = "rgba(111,175,99,0.2)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W - PAD - 230, 70, 230, 52, 26);
    else ctx.rect(W - PAD - 230, 70, 230, 52);
    ctx.fill();
    ctx.fillStyle = "#7FB069";
    ctx.font = "600 25px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(monthName, W - PAD - 115, 104);

    // ── Title ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px Georgia, serif";
    ctx.textAlign = "center";
    const words = title.split(" ");
    const titleLines = [];
    let cur = "";
    words.forEach(w => {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > W - PAD * 4) { titleLines.push(cur); cur = w; }
      else cur = test;
    });
    if (cur) titleLines.push(cur);
    titleLines.forEach((l, i) => ctx.fillText(l, W / 2, 200 + i * 68));

    let y = 200 + titleLines.length * 68 + 16;

    // ── Photo ─────────────────────────────────────────────────────────────────
    const photoH = 420;
    const photoY = y;

    if (photo) {
      try {
        const img = await new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i); i.onerror = rej; i.src = photo;
        });
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(PAD, photoY, W - PAD * 2, photoH, 24);
        else ctx.rect(PAD, photoY, W - PAD * 2, photoH);
        ctx.clip();
        const scale = Math.max((W - PAD * 2) / img.width, photoH / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        ctx.drawImage(img,
          PAD  + ((W - PAD * 2) - sw) / 2,
          photoY + (photoH - sh) / 2,
          sw, sh
        );
        // Vignette at bottom
        const vigGrad = ctx.createLinearGradient(0, photoY + photoH * 0.55, 0, photoY + photoH);
        vigGrad.addColorStop(0, "rgba(0,0,0,0)");
        vigGrad.addColorStop(1, "rgba(0,0,0,0.3)");
        ctx.fillStyle = vigGrad;
        ctx.fillRect(PAD, photoY, W - PAD * 2, photoH);
        ctx.restore();
      } catch(e) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(PAD, photoY, W - PAD * 2, photoH, 24);
        else ctx.rect(PAD, photoY, W - PAD * 2, photoH);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(PAD, photoY, W - PAD * 2, photoH, 24);
      else ctx.rect(PAD, photoY, W - PAD * 2, photoH);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.font = "30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Add a garden photo", W / 2, photoY + photoH / 2 + 12);
    }

    y = photoY + photoH + 32;

    // Divider
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
    y += 26;

    // ── Task rows ─────────────────────────────────────────────────────────────
    const seen = new Set();
    const deduped = (data.completed || []).filter(t => {
      const text = shortTask(t);
      if (seen.has(text)) return false;
      seen.add(text); return true;
    }).slice(0, 3);

    const rowH   = 70;
    const rowGap = 8;
    deduped.forEach((t, i) => {
      const rowY = y + i * (rowH + rowGap);
      // Use user's override label if set, otherwise generated suggestion
      const label = taskLabels[i]?.trim() || shortTask(t);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(PAD, rowY, W - PAD * 2, rowH, 16);
      else ctx.rect(PAD, rowY, W - PAD * 2, rowH);
      ctx.fill();

      // Check circle
      ctx.beginPath(); ctx.arc(PAD + 44, rowY + rowH / 2, 24, 0, Math.PI * 2);
      ctx.fillStyle = "#6FAF63"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("✓", PAD + 44, rowY + rowH / 2 + 8);

      // Task name — centred vertically in row
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 34px Georgia, serif"; ctx.textAlign = "left";
      ctx.fillText(label, PAD + 86, rowY + rowH / 2 + 12);

      // No subline — task label is user-editable and self-explanatory
    });

    y += deduped.length * (rowH + rowGap) + 24;

    // ── Stats bar ─────────────────────────────────────────────────────────────
    const statsH = 130;
    const statsGrad = ctx.createLinearGradient(0, y, 0, y + statsH);
    statsGrad.addColorStop(0, "rgba(111,175,99,0.22)");
    statsGrad.addColorStop(1, "rgba(111,175,99,0.08)");
    ctx.fillStyle = statsGrad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(PAD, y, W - PAD * 2, statsH, 20);
    else ctx.rect(PAD, y, W - PAD * 2, statsH);
    ctx.fill();
    ctx.strokeStyle = "rgba(111,175,99,0.3)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(PAD, y, W - PAD * 2, statsH, 20);
    else ctx.rect(PAD, y, W - PAD * 2, statsH);
    ctx.stroke();

    const statItems = [
      { num: data.stats?.crop_count || 0,      label: "crops growing" },
      { num: data.stats?.completed_count || 0, label: "tasks done"    },
      ...(data.stats?.harvest_count > 0 ? [{ num: data.stats.harvest_count, label: "harvests" }] : []),
    ];
    const statW = (W - PAD * 2) / statItems.length;
    statItems.forEach((s, i) => {
      const sx = PAD + i * statW + statW / 2;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 52px Georgia, serif";
      ctx.fillText(String(s.num), sx, y + 72);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "22px sans-serif";
      ctx.fillText(s.label, sx, y + 106);
      if (i < statItems.length - 1) {
        ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD + (i + 1) * statW, y + 18);
        ctx.lineTo(PAD + (i + 1) * statW, y + statsH - 18);
        ctx.stroke();
      }
    });

    y += statsH + 22;

    // ── Branding footer ───────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("vercro.com · grow smarter", W / 2, H - 30);
  };

  // Render preview canvas whenever data/photo/title changes
  const renderPreview = async () => {
    if (!previewRef.current || !data) return;
    const canvas = previewRef.current;
    await drawCard(canvas);
  };

  useEffect(() => { renderPreview(); }, [data, photo, title, taskLabels]);

  const load = async (m) => {
    setLoading(true);
    try {
      const d = await apiFetch(`/share/garden-data?mode=${m}`);
      setData(d);
      // Seed editable task labels with generated suggestions
      const seen2 = new Set();
      const seededLabels = (d.completed || [])
        .filter(t => { const tx = shortTask(t); if (seen2.has(tx)) return false; seen2.add(tx); return true; })
        .slice(0, 3)
        .map(t => shortTask(t));
      setTaskLabels([seededLabels[0] || "", seededLabels[1] || "", seededLabels[2] || ""]);
      // Set default title
      const name = d.profile?.name || "My";
      setTitle(m === "recent"
        ? `${name}'s Garden Update`
        : `${d.month_name} Garden Progress`
      );
      // Set suggested caption
      if (m === "recent") {
        const tasks = d.completed.slice(0, 2).map(t => t.action.toLowerCase()).join(" and ");
        setCaption(`A few jobs ticked off in the garden 🌱${tasks ? `

${tasks.charAt(0).toUpperCase() + tasks.slice(1)}.` : ""}

What's everyone working on at the moment?

#growyourown #vegetablegarden #kitchengarden`);
      } else {
        setCaption(`A look at what I've been getting done in the garden and what's coming up 🌿

Slow progress is still progress.

What's on your list this month?

#growyourown #gardenupdate #allotmentlife`);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(mode); }, []);

  const handleModeChange = (m) => {
    setMode(m);
    load(m);
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Keep full resolution — the canvas draws at 1080px so we need quality source pixels
    // Only downscale if truly massive (>4000px wide) to avoid memory issues
    const bitmap = await createImageBitmap(file);
    const maxDim = 4000;
    if (bitmap.width <= maxDim && bitmap.height <= maxDim) {
      // Use full resolution
      const canvas = document.createElement("canvas");
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const b64 = canvas.toDataURL("image/jpeg", 0.95);
      setPhoto(b64);
      setPhotoB64(b64.split(",")[1]);
    } else {
      // Only scale down if truly massive
      const scale = maxDim / Math.max(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(bitmap.width  * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL("image/jpeg", 0.95);
      setPhoto(b64);
      setPhotoB64(b64.split(",")[1]);
    }
  };

  // Human-readable achievement text for social share card
  const shortTask = (t) => {
    const crop = t.crop?.name || "";
    const c    = crop.toLowerCase();
    const action = (t.action || "").toLowerCase();
    const type   = (t.task_type || "").toLowerCase();

    // Sowing / planting
    if (action.includes("sow indoors") || action.includes("sow inside"))
      return crop ? `Sowed ${c} indoors` : "Sowed seeds indoors";
    if (action.includes("direct sow") || action.includes("sow outdoors") || action.includes("sow outside"))
      return crop ? `Direct sowed ${c}` : "Direct sowed seeds";
    if (action.includes("sow") && !action.includes("window"))
      return crop ? `Sowed ${c}` : "Sowed seeds";
    if (action.includes("plant out") || action.includes("planted out"))
      return crop ? `Planted out ${c}` : "Planted out";
    if (action.includes("transplant"))
      return crop ? `Transplanted ${c}` : "Transplanted";
    if (action.includes("chit") || action.includes("tuber"))
      return crop ? `Planted ${c}` : "Planted out";

    // Feeding
    if (action.includes("feed") || action.includes("fertili") || type === "feed")
      return crop ? `Fed ${c}` : "Fed plants";

    // Harvesting
    if (action.includes("harvest") || action.includes("pick") || action.includes("ready to harvest") || type === "harvest")
      return crop ? `Harvested ${c}` : "Harvested";

    // Watering
    if (action.includes("water"))
      return crop ? `Watered ${c}` : "Watered plants";

    // Pruning / cutting
    if (action.includes("prune") || action.includes("trim") || action.includes("cut back") || action.includes("deadhead"))
      return crop ? `Pruned ${c}` : "Pruned";

    // Pest / disease
    if (action.includes("pest") || action.includes("aphid") || action.includes("slug") || action.includes("inspect") || action.includes("treat"))
      return crop ? `Checked ${c} for pests` : "Checked for pests";

    // Protection / frost
    if (action.includes("protect") || action.includes("fleece") || action.includes("cover") || action.includes("frost"))
      return crop ? `Protected ${c} from frost` : "Covered plants";

    // Hardening off
    if (action.includes("harden"))
      return crop ? `Hardened off ${c}` : "Hardened off seedlings";

    // Thinning
    if (action.includes("thin"))
      return crop ? `Thinned ${c}` : "Thinned seedlings";

    // Weeding / mulching
    if (action.includes("weed"))  return "Weeded the bed";
    if (action.includes("mulch")) return crop ? `Mulched ${c}` : "Applied mulch";

    // Staking / supporting
    if (action.includes("stake") || action.includes("support") || action.includes("tie in") || action.includes("cane"))
      return crop ? `Staked ${c}` : "Added support";

    // Potting / repotting
    if (action.includes("pot on") || action.includes("repot"))
      return crop ? `Potted on ${c}` : "Potted on";

    // Runners / propagation
    if (action.includes("runner") || action.includes("propagat"))
      return crop ? `Propagated ${c}` : "Propagated plants";

    // Earthing up
    if (action.includes("earth up") || action.includes("earthing"))
      return crop ? `Earthed up ${c}` : "Earthed up";

    // Checking / inspecting
    if (action.includes("check") || action.includes("inspect") || action.includes("monitor") || type === "check")
      return crop ? `Checked on ${c}` : "Checked plants";

    // Task type fallbacks — use the type itself if no action match
    if (type === "sow")       return crop ? `Sowed ${c}` : "Sowed seeds";
    if (type === "transplant") return crop ? `Transplanted ${c}` : "Transplanted";
    if (type === "prune")     return crop ? `Pruned ${c}` : "Pruned";
    if (type === "mulch")     return crop ? `Mulched ${c}` : "Applied mulch";
    if (type === "weed")      return "Weeded the bed";
    if (type === "protect")   return crop ? `Protected ${c}` : "Covered plants";

    // Last resort — use the raw action text truncated if it's short enough, otherwise generic
    const rawAction = (t.action || "").trim();
    if (rawAction.length > 0 && rawAction.length <= 40) return rawAction;
    return crop ? `Worked on ${c}` : "Completed a task";
  };

  const generateCard = async () => {
    if (!data) return;
    setGenerating(true);
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1350;
    await drawCard(canvas);
    canvas.toBlob(async (blob) => {
      const file = new File([blob], "vercro-garden.png", { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: title, text: caption });
        } catch (e) {
          if (e.name !== "AbortError") downloadCanvas(canvas);
        }
      } else {
        downloadCanvas(canvas);
      }
      setGenerating(false);
    }, "image/png");
  };

  const downloadCanvas = (canvas) => {
    const link = document.createElement("a");
    link.download = "vercro-garden.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };


  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "24px 20px 48px", width: "100%", maxWidth: 440, margin: "0 auto", maxHeight: "92vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Share my garden 🌱</div>
            <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Generate a card to share with friends</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.stone }}>×</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["recent", "Recent"], ["month", "This month"]].map(([val, label]) => (
            <button key={val} onClick={() => handleModeChange(val)}
              style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${mode === val ? C.forest : C.border}`, background: mode === val ? "#f0f5f3" : "transparent", color: mode === val ? C.forest : C.stone, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>

        {loading ? <div style={{ textAlign: "center", padding: "32px 0" }}><Spinner /></div> : data && (
          <>
            {/* Card preview — actual canvas render, scaled down */}
            <div style={{ marginBottom: 16, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <canvas ref={previewRef} width={1080} height={1350}
                style={{ width: "100%", display: "block", borderRadius: 14 }} />
            </div>


            {/* Editable task labels */}
            {(() => {
              const seen3 = new Set();
              const tasks = (data.completed || [])
                .filter(t => { const tx = shortTask(t); if (seen3.has(tx)) return false; seen3.add(tx); return true; })
                .slice(0, 3);
              if (!tasks.length) return null;
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                    What you did <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: C.stone }}>(edit to personalise)</span>
                  </div>
                  {tasks.map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.leaf, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 700, flexShrink: 0 }}>✓</div>
                      <input
                        value={taskLabels[i] || ""}
                        onChange={e => {
                          const updated = [...taskLabels];
                          updated[i] = e.target.value;
                          setTaskLabels(updated);
                        }}
                        maxLength={50}
                        style={{ ...inputStyle, fontSize: 13, padding: "9px 12px" }}
                        placeholder={shortTask(t)}
                      />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Editable title */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Card title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} maxLength={60} />
            </div>

            {/* Photo picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Add a photo (optional)</label>
              {photo ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <img src={photo} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
                  <button onClick={() => setPhoto(null)}
                    style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.stone, fontSize: 13, cursor: "pointer" }}>
                    Remove photo
                  </button>
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "12px", cursor: "pointer", color: C.stone, fontSize: 13 }}>
                  📷 Add a garden photo
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                </label>
              )}
            </div>

            {/* Suggested caption */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Suggested caption</label>
              <textarea value={caption} onChange={e => setCaption(e.target.value)}
                style={{ ...inputStyle, height: 100, resize: "vertical", fontSize: 13 }} />
              <button onClick={() => { navigator.clipboard.writeText(caption); setCaptionCopied(true); setTimeout(() => setCaptionCopied(false), 2000); }}
                style={{ marginTop: 6, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, color: C.forest, cursor: "pointer", fontWeight: 600 }}>
                {captionCopied ? "✓ Copied!" : "Copy caption"}
              </button>
            </div>

            {/* Actions */}
            <button onClick={generateCard} disabled={generating}
              style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "serif", marginBottom: 10, opacity: generating ? 0.7 : 1 }}>
              {generating ? "Generating…" : "⬆ Share my garden"}
            </button>
            <div style={{ fontSize: 11, color: C.stone, textAlign: "center" }}>
              Generates a 1080×1350px card — Instagram, Facebook and WhatsApp safe (no cropping)
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Garden Status Card ───────────────────────────────────────────────────────
// ── Today Harvest Card — 3 states ────────────────────────────────────────────
function TodayHarvestCard({ recentHarvests, harvestForecast, harvestedIds, onLogHarvest, onViewAll }) {
  const scoreColor = (v) => v >= 7 ? C.leaf : v >= 4 ? C.amber : C.red;

  // Crops ready to harvest right now
  const today = todayISO();
  const readyNow = (harvestForecast || []).filter(h =>
    !harvestedIds.has(h.crop_instance_id) &&
    h.window_start <= today && h.window_end >= today
  );

  // Most recent harvest logged
  const lastHarvest = recentHarvests?.length > 0 ? recentHarvests[0] : null;
  const lastEntry   = lastHarvest?.entries?.[0] || null;

  // State 1 — crops ready right now → show CTA
  if (readyNow.length > 0) {
    return (
      <div style={{ background: `linear-gradient(135deg, #2d5a27 0%, #1e3d20 100%)`, borderRadius: 14, padding: "16px 18px", marginBottom: 20, color: "#fff" }}>
        <div style={{ fontSize: 11, opacity: 0.65, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Ready to harvest</div>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", marginBottom: 4 }}>
          🥕 {readyNow.length === 1 ? `${readyNow[0].crop_name} is ready` : `${readyNow.length} crops ready to harvest`}
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 14 }}>
          {readyNow.slice(0, 3).map(h => h.crop_name).join(", ")}{readyNow.length > 3 ? ` + ${readyNow.length - 3} more` : ""}
        </div>
        <button onClick={() => onLogHarvest(readyNow[0])}
          style={{ background: "#fff", color: "#2d5a27", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "serif" }}>
          🌾 Log harvest
        </button>
      </div>
    );
  }

  // State 2 — recent harvest logged → show latest
  if (lastHarvest && lastEntry) {
    const totalHarvests = recentHarvests.reduce((sum, c) => sum + c.harvest_count, 0);
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Latest harvest</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>
              {getCropEmoji(lastHarvest.crop_name)} {lastHarvest.crop_name}
              {lastHarvest.variety ? ` — ${lastHarvest.variety}` : ""}
            </div>
            <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>
              {new Date(lastEntry.harvested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {lastHarvest.harvest_count > 1 ? ` · ${lastHarvest.harvest_count} harvests this season` : ""}
              {totalHarvests > 1 ? ` · ${totalHarvests} total` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {lastEntry.yield_score && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor(lastEntry.yield_score) }}>{lastEntry.yield_score}</div>
                <div style={{ fontSize: 9, color: C.stone }}>Yield</div>
              </div>
            )}
            {lastEntry.quality && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor(lastEntry.quality) }}>{lastEntry.quality}</div>
                <div style={{ fontSize: 9, color: C.stone }}>Quality</div>
              </div>
            )}
          </div>
        </div>
        <button onClick={onViewAll}
          style={{ fontSize: 12, fontWeight: 600, color: C.forest, background: "none", border: `1px solid ${C.sage}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>
          View all harvests →
        </button>
      </div>
    );
  }

  // State 3 — nothing yet
  if (recentHarvests !== null && recentHarvests.length === 0) {
    return (
      <div style={{ background: "#f5f9f5", border: `1px solid ${C.sage}`, borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: C.forest, marginBottom: 4 }}>🌱 No harvests yet</div>
        <div style={{ fontSize: 12, color: C.stone }}>Your first harvest is coming — keep going!</div>
      </div>
    );
  }

  // Loading state — return nothing while fetching
  return null;
}

function GardenStatusCard({ data }) {
  if (!data) return null;

  const cropCount   = data.crop_count || 0;
  const completedThisWeek = data.tasks_completed_this_week || 0;

  // Next harvest — first item in harvest forecast sorted by window_start
  const nextHarvest = data.harvest_forecast?.length > 0
    ? [...data.harvest_forecast].sort((a, b) => new Date(a.window_start) - new Date(b.window_start))[0]
    : null;

  const optimalDate = nextHarvest
    ? new Date(new Date(nextHarvest.window_start).getTime() + (new Date(nextHarvest.window_end) - new Date(nextHarvest.window_start)) * 0.35)
    : null;

  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Garden Status</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Crops growing */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🌱</span>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>
            <strong style={{ color: C.forest }}>{cropCount}</strong> crop{cropCount !== 1 ? "s" : ""} growing
          </span>
        </div>
        {/* Next harvest */}
        {nextHarvest && optimalDate && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🌾</span>
            <span style={{ fontSize: 14, color: "#1a1a1a" }}>
              Next harvest: <strong style={{ color: C.forest }}>{nextHarvest.crop}</strong> — aiming for {optimalDate.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
            </span>
          </div>
        )}
        {/* Tasks completed this week */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>
            <strong style={{ color: C.forest }}>{completedThisWeek}</strong> task{completedThisWeek !== 1 ? "s" : ""} completed this week
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Coming Up Soon Card ───────────────────────────────────────────────────────
function ComingUpSoonCard({ data }) {
  const now = Date.now();
  const today = new Date().toISOString().split("T")[0];

  // Coming Up Soon — only show future tasks beyond this week (coming_up bucket)
  // This week's tasks are already in the main task list
  const comingUp = (data.tasks?.coming_up || []).filter(t => !t.completed_at);
  const seen = new Map();
  for (const t of comingUp.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))) {
    const key = t.crop?.name || t.rule_id || t.id;
    if (!seen.has(key)) seen.set(key, t);
  }
  const upcoming = [...seen.values()].slice(0, 3);

  if (!upcoming.length) return null;

  const relativeTime = (dateStr) => {
    const days = Math.ceil((new Date(dateStr) - now) / 86400000);
    if (days <= 1)  return "tomorrow";
    if (days <= 7)  return `in ${days} days`;
    if (days <= 14) return "next week";
    const weeks = Math.round(days / 7);
    return `in ${weeks} week${weeks !== 1 ? "s" : ""}`;
  };

  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>⏳</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1 }}>Coming Up Soon</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {upcoming.map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1 }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{getCropEmoji(t.crop?.name || "")}</span>
              <span style={{ fontSize: 13, color: "#1a1a1a", lineHeight: 1.4 }}>
                {t.action}{t.crop?.name ? ` ${t.crop.name.toLowerCase()}` : ""}
              </span>
            </div>
            <span style={{ fontSize: 12, color: C.stone, flexShrink: 0, fontStyle: "italic" }}>{relativeTime(t.due_date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

// =============================================================================
// NOTIFICATION DASHBOARD PROMPT
// =============================================================================
function NotificationDashboardPrompt({ onTabChange }) {
  const [state, setState] = useState("loading"); // loading | enabled | prompt | disabled
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        setState("unsupported"); return;
      }
      const perm = Notification.permission;
      if (perm === "granted") {
        // Check if actually registered
        try {
          const prefs = await apiFetch("/notifications/preferences");
          setState(prefs?.push_enabled ? "enabled" : "disabled");
        } catch { setState("enabled"); }
      } else if (perm === "denied") {
        setState("disabled");
      } else {
        setState("prompt"); // default — never asked
      }
    };
    check();
  }, []);

  const enable = async () => {
    try {
      const { publicKey } = await apiFetch("/notifications/vapid-key");
      if (!publicKey) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState("disabled"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await apiFetch("/notifications/register-token", {
        method: "POST",
        body: JSON.stringify({ subscription: sub.toJSON(), platform: "web" }),
      });
      await apiFetch("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({
          push_enabled: true,
          due_today_enabled: true,
          coming_up_enabled: true,
          weather_alerts_enabled: true,
          pest_alerts_enabled: true,
          crop_checks_enabled: true,
          weekly_summary_enabled: true,
          milestones_enabled: true,
          morning_time_local: "07:00",
          evening_time_local: "18:00",
        }),
      });
      setState("enabled");
    } catch(e) { console.error("[Push]", e); }
  };

  if (state === "loading" || state === "unsupported" || state === "enabled") return null;
  if (dismissed) return null;

  if (state === "prompt") {
    return (
      <div style={{ background: "#f0f7f4", border: `1px solid ${C.sage}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🔔</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.forest, fontFamily: "serif" }}>Get garden reminders</div>
          <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Frost alerts, task reminders and crop checks — when they matter</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={enable}
            style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Turn on
          </button>
          <button onClick={() => setDismissed(true)}
            style={{ background: "none", border: "none", color: C.stone, fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>
            ×
          </button>
        </div>
      </div>
    );
  }

  // disabled state — subtle pill
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      <button onClick={() => onTabChange("profile")}
        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, color: C.stone, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        <span>🔔</span> Notifications off · Turn on
      </button>
    </div>
  );
}

function Dashboard({ onTabChange, isDemo = false }) {
  const [data,         setData]        = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState(null);
  const [completed,      setCompleted]      = useState(new Set());
  const [undoQueue,      setUndoQueue]      = useState({});
  const [recentlyDone,        setRecentlyDone]        = useState([]);
  const [undone,              setUndone]              = useState([]);
  const [harvestedIds,        setHarvestedIds]        = useState(new Set());
  const [pendingHarvest,      setPendingHarvest]      = useState(null);
  const [allHarvestsForShare, setAllHarvestsForShare] = useState([]);
  const [recentHarvests,      setRecentHarvests]      = useState(null); // null = not loaded yet
  const [showShareGarden,    setShowShareGarden]    = useState(false);
  const [showPlantCheck,     setShowPlantCheck]     = useState(false);
  const [plantCheckPrefill,  setPlantCheckPrefill]  = useState(null); // { crop } or null
  const plantCheckEnabled = usePlantCheckEnabled();

  const loadAllHarvestsForShare = async () => {
    try {
      const d = await apiFetch("/harvest-log?year=" + new Date().getFullYear());
      setAllHarvestsForShare(d);
    } catch(e) {}
  };

  const loadRecentHarvests = async () => {
    try {
      const d = await apiFetch("/harvest-log/summary?year=" + new Date().getFullYear());
      setRecentHarvests(d);
    } catch(e) { setRecentHarvests([]); }
  };
  const [strugglingCrop,     setStrugglingCrop]     = useState(null);
  const [pendingUnlocks,     setPendingUnlocks]     = useState([]);
  const [showCelebration,    setShowCelebration]    = useState(false);
  const [showShareNudge,     setShowShareNudge]     = useState(false);
  const [showReferral,       setShowReferral]       = useState(false);
  const [showAllToday,       setShowAllToday]       = useState(false);
  const [showLogForCrop,     setShowLogForCrop]     = useState(null);
  const [showLogActivity,    setShowLogActivity]    = useState(false);
  const [blockedPeriods,     setBlockedPeriods]     = useState([]);
  const [showFirstRun,       setShowFirstRun]       = useState(() => {
    try { return localStorage.getItem("vercro_first_run_seen") !== "1"; } catch(e) { return false; }
  });
  const [timeAwayDismissed,  setTimeAwayDismissed]  = useState(() => {
    try { return localStorage.getItem("vercro_timeaway_dismissed") === "1"; } catch(e) { return false; }
  });
  const [showSessionComplete, setShowSessionComplete] = useState(false);
  const [sessionCompleteData, setSessionCompleteData] = useState(null); // { nextTask, completedCount }
  const sessionCompletedCountRef = useRef(0);
  const sessionModalShownRef = useRef(false); // prevents double-trigger in same session
  // engineRefreshing removed — dashboard now runs engine synchronously server-side

  const CACHE_KEY = "vercro_dashboard_v1";

  const load = useCallback(async (isBackground = false) => {
    // Show cached data instantly if available
    if (!isBackground) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data: cachedData, ts } = JSON.parse(cached);
          const age = Date.now() - ts;
          if (age < 5 * 60 * 1000) { // under 5 minutes — show immediately
            setData(cachedData);
            setLoading(false);
          }
        }
      } catch(e) {}
    }

    // Always fetch fresh in background
    try {
      const [d, bp] = await Promise.all([
        apiFetch("/dashboard"),
        apiFetch("/blocked-periods").catch(() => []),
      ]);
      setData(d);
      setBlockedPeriods(bp || []);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: d, ts: Date.now() })); } catch(e) {}
    } catch (e) {
      if (!isBackground) setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    checkPendingUnlocks();
    loadRecentHarvests();
  }, [load]);

  // No client-side retry needed — dashboard now runs engine synchronously when tasks are empty.
  // Engine runs server-side and response always contains fresh data.

  const checkPendingUnlocks = async () => {
    try {
      const unlocks = await apiFetch("/badges/pending-unlocks");
      if (unlocks?.length) { setPendingUnlocks(unlocks); setShowCelebration(true); }
    } catch(e) {}
  };

  const completeTask = async (task) => {
    setCompleted(prev => new Set([...prev, task.id]));
    setRecentlyDone(prev => [task, ...prev.filter(t => t.id !== task.id)]);
    setUndone(prev => prev.filter(t => t.id !== task.id));
    // Increment local week count immediately
    setData(prev => prev ? { ...prev, tasks_completed_this_week: (prev.tasks_completed_this_week || 0) + 1 } : prev);

    try {
      await apiFetch(`/tasks/${task.id}/complete`, { method: "POST" });
      // Nudge to share after 5th task — high-emotion moment
      const newCount = (data?.tasks_completed_this_week || 0) + 1;
      const totalKey = "vercro_total_completed";
      const total = parseInt(localStorage.getItem(totalKey) || "0") + 1;
      localStorage.setItem(totalKey, String(total));
      if (total === 5 && !localStorage.getItem("vercro_share_nudge_shown")) {
        setTimeout(() => setShowShareNudge(true), 800);
        localStorage.setItem("vercro_share_nudge_shown", "1");
      }

      // Session complete hook — show "what's next tomorrow" modal
      // Triggers when: user completes 2+ tasks in session OR no today tasks remain
      // modalShownRef guards against double-trigger (undo → re-complete, rapid taps)
      sessionCompletedCountRef.current += 1;
      const remainingAfterThis = grouped.today.filter(t => !completed.has(t.id) && t.id !== task.id).length;
      const sessionThreshold = sessionCompletedCountRef.current >= 2;
      const allTodayDone = remainingAfterThis === 0 && grouped.today.length > 0;

      if ((allTodayDone || sessionThreshold) && !showSessionComplete && !sessionModalShownRef.current) {
        sessionModalShownRef.current = true;

        // Find best "tomorrow" task — exclude low-value checks and vague perennial prompts
        const upcomingPool = [...(grouped.this_week || []), ...(grouped.coming_up || [])]
          .filter(t => {
            if (completed.has(t.id) || t.id === task.id) return false;
            // Exclude weak task types that would undermine the modal
            if (t.urgency === "low" && t.task_type === "check" && !t.crop?.name) return false;
            if (["perennial_flowering_upcoming", "perennial_harvest_upcoming", "null_crop_fallback"].includes(t.rule_id)) return false;
            return true;
          })
          .sort((a, b) => {
            // Prefer higher urgency and sooner due dates
            const urgencyRank = { high: 3, medium: 2, low: 1 };
            const uDiff = (urgencyRank[b.urgency] || 0) - (urgencyRank[a.urgency] || 0);
            if (uDiff !== 0) return uDiff;
            return (a.due_date || "").localeCompare(b.due_date || "");
          });
        const nextTask = upcomingPool[0] || null;

        setTimeout(() => {
          setSessionCompleteData({
            nextTask,
            completedCount: sessionCompletedCountRef.current,
          });
          setShowSessionComplete(true);
        }, 600);
      }
    } catch {
      setCompleted(prev => { const s = new Set(prev); s.delete(task.id); return s; });
      setRecentlyDone(prev => prev.filter(t => t.id !== task.id));
      setData(prev => prev ? { ...prev, tasks_completed_this_week: Math.max(0, (prev.tasks_completed_this_week || 1) - 1) } : prev);
      return;
    }

    // Undo window — 10 seconds
    const timeout = setTimeout(() => {
      setUndoQueue(prev => { const q = { ...prev }; delete q[task.id]; return q; });
    }, 10000);
    setUndoQueue(prev => ({ ...prev, [task.id]: timeout }));
  };

  const undoComplete = async (task) => {
    clearTimeout(undoQueue[task.id]);
    setUndoQueue(prev => { const q = { ...prev }; delete q[task.id]; return q; });

    // Remove from completed — this makes it active again
    setCompleted(prev => { const s = new Set(prev); s.delete(task.id); return s; });
    setRecentlyDone(prev => prev.filter(t => t.id !== task.id));
    setData(prev => prev ? { ...prev, tasks_completed_this_week: Math.max(0, (prev.tasks_completed_this_week || 1) - 1) } : prev);
    // Add to undone so it appears in active list even if not in data.tasks
    setUndone(prev => [task, ...prev.filter(t => t.id !== task.id)]);

    try {
      await apiFetch(`/tasks/${task.id}/uncomplete`, { method: "POST" });
    } catch {
      // Revert — mark as completed again
      setCompleted(prev => new Set([...prev, task.id]));
      setUndone(prev => prev.filter(t => t.id !== task.id));
      setRecentlyDone(prev => [task, ...prev.filter(t => t.id !== task.id)]);
    }
  };

  if (error && !data) return <ErrorMsg msg={error} />;
  if (loading && !data) return (
    <div style={{ padding: "60px 24px 80px", textAlign: "center" }}>
      <div style={{ fontSize: 44, marginBottom: 16 }}>🌱</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 8 }}>
        Looking at your garden
      </div>
      <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.6 }}>
        Checking what needs doing today…
      </div>
    </div>
  );
  if (!data) return null;

  const today   = todayISO();
  const weekEnd = weekEndISO();

  // Use server-deduped groups directly — server handles one-per-crop logic
  const serverToday    = data.tasks?.today     || [];
  const serverThisWeek = data.tasks?.this_week || [];
  const serverComingUp = data.tasks?.coming_up || [];
  const serverTasks    = data.tasks?.tasks     || [...serverToday, ...serverThisWeek, ...serverComingUp];

  // Merge any undone tasks back in
  const allTaskIds = new Set(serverTasks.map(t => t.id));
  const extraTasks = undone.filter(t => !allTaskIds.has(t.id));
  const allTasks   = [...serverTasks, ...extraTasks];

  const URGENCY_RANK = { high: 3, medium: 2, low: 1 };
  const dedupByCrop = (items) => {
    const seen = new Map();
    for (const t of [...items].sort((a,b) => {
      const uDiff = (URGENCY_RANK[b.urgency]||0) - (URGENCY_RANK[a.urgency]||0);
      return uDiff !== 0 ? uDiff : (a.due_date||"").localeCompare(b.due_date||"");
    })) {
      const key = t.crop?.name || t.rule_id || t.id;
      if (!seen.has(key)) seen.set(key, t);
    }
    return [...seen.values()].sort((a,b) => {
      const uDiff = (URGENCY_RANK[b.urgency]||0) - (URGENCY_RANK[a.urgency]||0);
      return uDiff !== 0 ? uDiff : (a.due_date||"").localeCompare(b.due_date||"");
    });
  };

  // Use server groups but apply frontend dedup too (catches undone tasks)
  const grouped = {
    today:     dedupByCrop([...serverToday,    ...extraTasks.filter(t => t.due_date <= today)]),
    this_week: dedupByCrop([...serverThisWeek, ...extraTasks.filter(t => t.due_date > today && t.due_date <= weekEnd)]),
    coming_up: serverComingUp, // already deduped server-side
  };

  const activeTodayCount = grouped.today.filter(t => !completed.has(t.id)).length;
  const totalToday       = grouped.today.length;
  const doneToday        = totalToday - activeTodayCount;
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  // ── Observation helper ───────────────────────────────────────────────────────
  const logObservation = async (cropId, type, symptomCode, severity = null) => {
    try {
      await apiFetch(`/crops/${cropId}/observe`, {
        method: "POST",
        body: JSON.stringify({ observation_type: type, symptom_code: symptomCode, severity }),
      });
      load(); // refresh dashboard after observation
    } catch(e) { console.error("[Observe]", e); }
  };

  // ── Derived data for new dashboard layout ────────────────────────────────────

  // Today's focus — single most important item
  const alerts         = (data.tasks?.alerts || []).filter(t => !completed.has(t.id));
  // Deduplicate tasks with identical action text — handles users with multiple instances
  // of the same crop (e.g. 2 x Lettuce generating 2 x feed tasks)
  const dedupeByAction = (tasks) => {
    const seen = new Set();
    return tasks.filter(t => {
      const key = (t.action?.trim().toLowerCase() || "") + "|"+  (t.crop?.name?.toLowerCase() || "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const todayTasks     = dedupeByAction(grouped.today.filter(t => !completed.has(t.id)));
  const thisWeekTasks  = dedupeByAction(grouped.this_week.filter(t => !completed.has(t.id)));
  const comingUpTasks  = dedupeByAction((grouped.coming_up || []).filter(t => !completed.has(t.id)));

  // Hero focus: critical alert > high task > medium task > first check
  const focusItem = (() => {
    const crit = alerts.find(a => a.urgency === "high" || a.urgency === "critical");
    if (crit) return { ...crit, _source: "alert" };
    const highTask = todayTasks.find(t => t.urgency === "high");
    if (highTask) return { ...highTask, _source: "task" };
    const medTask = todayTasks[0];
    if (medTask) return { ...medTask, _source: "task" };
    return null;
  })();

  // Remaining today tasks (exclude focus item)
  const remainingToday = todayTasks.filter(t => t.id !== focusItem?.id);

  // Crop checks — lifecycle prompts (non-alert, non-regular-task)
  const cropCheckTasks = allTasks.filter(t => {
    if (completed.has(t.id) || t.completed_at) return false;
    if (t.record_type === "alert") return false;
    try {
      const meta = typeof t.meta === "string" ? JSON.parse(t.meta) : (t.meta || {});
      return meta.lifecycle_check === true;
    } catch { return false; }
  });

  // Watch outs — risk alerts
  const watchOuts = alerts.slice(0, 3);

  // Coming up next — group by crop name
  const comingUpByCrop = (() => {
    const byName = new Map();
    const allUpcoming = [...thisWeekTasks, ...comingUpTasks];
    for (const t of allUpcoming) {
      const name = t.crop?.name || "General";
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(t);
    }
    return [...byName.entries()].map(([name, tasks]) => {
      // Deduplicate tasks with identical action text within the same crop group
      // This handles users with multiple instances of the same crop (e.g. 2 x Lettuce)
      const seen = new Set();
      const dedupedTasks = tasks
        .sort((a,b) => (a.due_date||"").localeCompare(b.due_date||""))
        .filter(t => {
          const key = t.action?.trim().toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return { name, emoji: getCropEmoji(name), tasks: dedupedTasks };
    }).sort((a,b) => (a.tasks[0]?.due_date||"").localeCompare(b.tasks[0]?.due_date||""));
  })();

  // Garden progress counts
  const cropCount      = data.crop_count || 0;
  const harvestCount   = (data.harvest_forecast || []).filter(h => {
    const today2 = todayISO();
    return h.window_start <= today2 && h.window_end >= today2;
  }).length;
  const needsInput     = (data.missing_data || []).length;
  const completedWeek  = data.tasks_completed_this_week || 0;

  // Relative time helper
  const relTime = (dateStr) => {
    if (!dateStr) return "";
    const days = Math.ceil((new Date(dateStr) - Date.now()) / 86400000);
    if (days <= 0)  return "today";
    if (days === 1) return "tomorrow";
    if (days <= 6)  return `in ${days} days`;
    if (days <= 13) return "next week";
    const weeks = Math.round(days / 7);
    return `in ${weeks} week${weeks !== 1 ? "s" : ""}`;
  };

  return (
    <div>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, #1e3d33 100%)`, color: "#fff", borderRadius: 16, padding: "20px 20px 16px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", lineHeight: 1.1 }}>{greeting}{data.user ? `, ${data.user}` : ""}</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Here&apos;s what&apos;s happening in your garden today</div>
            {data.weather ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, opacity: 0.85 }}>
                {data.weather.icon_code && <img src={`https://openweathermap.org/img/wn/${data.weather.icon_code}.png`} alt="" style={{ width: 24, height: 24 }} />}
                <span style={{ fontSize: 14, fontWeight: 600 }}>{data.weather.temp_c}°C</span>
                <span style={{ fontSize: 12, opacity: 0.8, textTransform: "capitalize" }}>{data.weather.condition}</span>
                {data.frost_risk !== "low" && (
                  <span style={{ fontSize: 11, background: data.frost_risk === "high" ? "#e74c3c" : "#f39c12", borderRadius: 20, padding: "1px 8px", fontWeight: 700 }}>
                    {data.frost_risk === "high" ? "❄️ Frost" : "❄️ Near frost"}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Set postcode in profile for weather</div>
            )}
          </div>
          <ProfilePhotoGreeting photoUrl={data.profile_photo} userId={data.user_id} onUploaded={url => setData(d => ({ ...d, profile_photo: url }))} />
        </div>
      </div>

      {/* ── FIRST RUN BANNER ──────────────────────────────────────────────────── */}
      {showFirstRun && (
        <div style={{ background: C.forest, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "serif", color: "#fff", marginBottom: 6 }}>
            Here's your garden plan for today 👇
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, marginBottom: 14 }}>
            We've set this up from the crops you added. You can add more anytime.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setShowFirstRun(false); try { localStorage.setItem("vercro_first_run_seen", "1"); } catch(e) {} }}
              style={{ background: "#fff", color: C.forest, border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "serif" }}>
              Got it
            </button>
            <button onClick={() => { setShowFirstRun(false); try { localStorage.setItem("vercro_first_run_seen", "1"); } catch(e) {} onTabChange("add"); }}
              style={{ background: "transparent", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              Add another crop
            </button>
          </div>
        </div>
      )}

      {/* ── NOTIFICATION PROMPT ────────────────────────────────────────────────── */}
      <NotificationDashboardPrompt onTabChange={onTabChange} />

      {/* ── TIME AWAY BANNER ─────────────────────────────────────────────────── */}
      <TimeAwayTodayBanner blockedPeriods={blockedPeriods} onTabChange={onTabChange} />

      {/* ── BADGES PILL ────────────────────────────────────────────────────── */}
      <TodayBadgeCard onViewBadges={() => onTabChange("badges")} />

      {/* ── 1. TODAY'S FOCUS ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Today&apos;s focus</div>

        {focusItem ? (
          <div style={{ background: C.cardBg, border: `2px solid ${focusItem.urgency === "high" ? C.red : focusItem._source === "alert" ? "#f39c12" : C.forest}`, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>{focusItem._source === "alert" ? "⚠️" : getCropEmoji(focusItem.crop?.name || "")}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>
                  {focusItem.crop?.name || "Garden task"}
                </div>
                <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.5, marginBottom: 12 }}>{focusItem.action}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => completeTask(focusItem)}
                    style={{ flex: 1, background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "serif" }}>
                    ✓ Mark done
                  </button>
                  <button onClick={() => apiFetch(`/tasks/${focusItem.id}/snooze`, { method: "POST", body: JSON.stringify({ days: 1 }) }).then(load)}
                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.stone, fontSize: 13, cursor: "pointer" }}>
                    Later
                  </button>
                </div>
                {focusItem.crop_instance_id && (
                  <button onClick={() => setShowLogForCrop({ id: focusItem.crop_instance_id, name: focusItem.crop?.name || "crop", task_type: focusItem.task_type })}
                    style={{ marginTop: 8, background: "none", border: "none", padding: 0, fontSize: 11, color: C.stone, cursor: "pointer", textDecoration: "underline" }}>
                    Did something different? Log it
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: "#f0f9f4", border: `1px solid ${C.sage}`, borderRadius: 14, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>🌿</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: C.forest, marginBottom: 2 }}>You&apos;re all caught up</div>
              <div style={{ fontSize: 12, color: C.stone }}>
                {thisWeekTasks.length > 0 ? `${thisWeekTasks.length} thing${thisWeekTasks.length !== 1 ? "s" : ""} coming up this week` : comingUpTasks.length > 0 ? `${comingUpTasks.length} task${comingUpTasks.length !== 1 ? "s" : ""} planned ahead` : "Nothing urgent — enjoy your garden"}
              </div>
            </div>
          </div>
        )}

        {/* Also today — grouped by crop/succession group, max 3 groups */}
        {remainingToday.length > 0 && (() => {
          const alsoGrouped = {};
          for (const t of remainingToday) {
            const isSuccession = !!t.crop?.succession_group_id;
            const key = isSuccession ? `sg:${t.crop.succession_group_id}` : (t.crop?.name || "General");
            if (!alsoGrouped[key]) alsoGrouped[key] = {
              crop: t.crop,
              isSuccession,
              displayName: isSuccession ? (t.crop?.name || "").replace(/\s*\(Sow \d+\)\s*$/, "").trim() : (t.crop?.name || "General"),
              tasks: [],
            };
            alsoGrouped[key].tasks.push(t);
          }
          const alsoGroups = Object.values(alsoGrouped).slice(0, 3);
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Also today</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {alsoGroups.map((group, gi) => (
                  <div key={gi} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 20 }}>{getCropEmoji(group.displayName || group.crop?.name || "")}</span>
                      <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "serif", color: "#1a1a1a" }}>{group.displayName || group.crop?.name || "General"}</span>
                      {group.isSuccession && (
                        <span style={{ fontSize: 10, background: C.forest + "18", color: C.forest, borderRadius: 20, padding: "2px 7px", fontWeight: 600 }}>Succession</span>
                      )}
                    </div>
                    {group.tasks.map((t, ti) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingTop: ti > 0 ? 7 : 0, borderTop: ti > 0 ? `1px solid ${C.border}` : "none", marginTop: ti > 0 ? 7 : 0 }}>
                        <span style={{ color: C.sage, flexShrink: 0, marginTop: 2, fontSize: 14 }}>›</span>
                        <span style={{ flex: 1, fontSize: 13, color: C.stone, lineHeight: 1.4 }}>{t.action}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 1 }}>
                          {t.crop_instance_id && (
                            <button onClick={() => setStrugglingCrop({ id: t.crop_instance_id, name: t.crop?.name })}
                              style={{ fontSize: 11, color: C.stone, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", whiteSpace: "nowrap" }}>
                              Having problems?
                            </button>
                          )}
                          <button onClick={() => completeTask(t)}
                            style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${C.border}`, background: "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: C.stone }}>
                            ✓
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* See all — expandable full due task list grouped by crop/succession */}
        {(() => {
          // Get keys already shown in Also Today — use same succession key logic
          const shownKeys = new Set();
          const tempGrouped = {};
          for (const t of remainingToday) {
            const key = t.crop?.succession_group_id ? `sg:${t.crop.succession_group_id}` : (t.crop?.name || "General");
            if (!tempGrouped[key]) tempGrouped[key] = true;
          }
          Object.keys(tempGrouped).slice(0, 3).forEach(k => shownKeys.add(k));

          // Overflow = tasks whose group key isn't in Also Today
          const todayOverflow = remainingToday.filter(t => {
            const key = t.crop?.succession_group_id ? `sg:${t.crop.succession_group_id}` : (t.crop?.name || "General");
            return !shownKeys.has(key) && !completed.has(t.id);
          });
          const allItems = [...todayOverflow];
          if (allItems.length === 0) return null;

          // Group by succession_group_id or crop name
          const grouped = {};
          for (const t of allItems) {
            const isSuccession = !!t.crop?.succession_group_id;
            const key = isSuccession ? `sg:${t.crop.succession_group_id}` : (t.crop?.name || "General");
            if (!grouped[key]) grouped[key] = {
              crop: t.crop,
              isSuccession,
              displayName: isSuccession ? (t.crop?.name || "").replace(/\s*\(Sow \d+\)\s*$/, "").trim() : (t.crop?.name || "General"),
              tasks: [],
            };
            grouped[key].tasks.push(t);
          }
          const cropGroups = Object.values(grouped);
          const totalCount = allItems.length;
          if (totalCount === 0) return null;

          return (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowAllToday(p => !p)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", color: C.forest }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                  See all ({totalCount})
                </span>
                <span style={{ fontSize: 16, transition: "transform 0.2s", display: "inline-block", transform: showAllToday ? "rotate(180deg)" : "rotate(0deg)" }}>⌄</span>
              </button>

                            {showAllToday && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {cropGroups.map((group, gi) => (
                    <div key={gi} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 20 }}>{getCropEmoji(group.displayName || group.crop?.name || "")}</span>
                        <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "serif", color: "#1a1a1a" }}>{group.displayName || group.crop?.name || "General"}</span>
                        {group.isSuccession && (
                          <span style={{ fontSize: 10, background: C.forest + "18", color: C.forest, borderRadius: 20, padding: "2px 7px", fontWeight: 600 }}>Succession</span>
                        )}
                      </div>
                      {group.tasks.map((t, ti) => (
                        <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingTop: ti > 0 ? 7 : 0, borderTop: ti > 0 ? `1px solid ${C.border}` : "none", marginTop: ti > 0 ? 7 : 0 }}>
                          <span style={{ color: C.sage, flexShrink: 0, marginTop: 2, fontSize: 14 }}>›</span>
                          <span style={{ flex: 1, fontSize: 13, color: C.stone, lineHeight: 1.4 }}>{t.action}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 1 }}>
                            {t.crop_instance_id && (
                              <button onClick={() => setStrugglingCrop({ id: t.crop_instance_id, name: t.crop?.name })}
                                style={{ fontSize: 11, color: C.stone, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", whiteSpace: "nowrap" }}>
                                Having problems?
                              </button>
                            )}
                            <button onClick={() => completeTask(t)}
                              style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${C.border}`, background: "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: C.stone }}>
                              ✓
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Recently done */}
        {recentlyDone.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {recentlyDone.map(t => (
              <div key={t.id} style={{ background: "#f5faf5", border: `1px solid ${C.sage}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, opacity: 0.7 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>✅</span>
                <div style={{ flex: 1, fontSize: 12, color: C.stone, textDecoration: "line-through" }}>{t.crop?.name ? `${t.crop.name} — ` : ""}{t.action}</div>
                {undoQueue[t.id] && (
                  <button onClick={() => undoComplete(t)}
                    style={{ fontSize: 11, color: C.forest, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TIME AWAY ENTRY POINTS ──────────────────────────────────────────── */}

      {/* Dense tasks nudge — shown when 5+ tasks due this week and no active blocked period */}
      {(() => {
        const upcomingCount = [...thisWeekTasks, ...todayTasks].length;
        const hasActivePeriod = blockedPeriods.some(p => {
          const t = new Date().toISOString().split("T")[0];
          return p.start_date <= t && p.end_date >= t;
        });
        if (upcomingCount < 5 || hasActivePeriod || timeAwayDismissed) return null;
        return (
          <div style={{ background: "#fff8ed", border: `1px solid ${C.amber}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🗓️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 2 }}>Busy week ahead</div>
              <div style={{ fontSize: 12, color: C.stone, lineHeight: 1.4, marginBottom: 8 }}>
                You have {upcomingCount} tasks coming up. Going anywhere? We can adjust your plan around it.
              </div>
              <button
                onClick={() => onTabChange("profile", { openTimeAway: true })}
                style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", marginRight: 8 }}>
                Plan time away →
              </button>
              <button
                onClick={() => { setTimeAwayDismissed(true); try { localStorage.setItem("vercro_timeaway_dismissed", "1"); } catch(e) {} }}
                style={{ background: "none", border: "none", fontSize: 12, color: C.stone, cursor: "pointer" }}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })()}

      {/* Persistent entry point — always visible, clears once user has added a blocked period */}
      {!timeAwayDismissed && blockedPeriods.length === 0 && (
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", marginBottom: 12, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, cursor: "pointer" }}
          onClick={() => onTabChange("profile", { openTimeAway: true })}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>✈️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Going away?</div>
              <div style={{ fontSize: 11, color: C.stone }}>We'll adjust your tasks around it automatically</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.forest, fontWeight: 700 }}>Set dates →</span>
            <button
              onClick={e => { e.stopPropagation(); setTimeAwayDismissed(true); try { localStorage.setItem("vercro_timeaway_dismissed", "1"); } catch(e) {} }}
              style={{ background: "none", border: "none", fontSize: 16, color: C.stone, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
          </div>
        </div>
      )}

      {/* ── 2. QUICK CROP CHECKS ───────────────────────────────────────────── */}
      <QuickCropCheck
        crops={data.crops || []}
        allTasks={allTasks}
        missingItems={[]}
        sectionLabel="Quick crop checks"
        onNavigateCrop={(cropId, field) => { if (onTabChange) onTabChange("crops", { editCropId: cropId, editCropField: field }); }}
        onDismiss={(updatedCrop) => {
          if (updatedCrop?.id) {
            setData(prev => ({ ...prev, crops: (prev.crops || []).map(c => c.id === updatedCrop.id ? { ...c, ...updatedCrop } : c) }));
          }
          load();
        }}
      />

      {/* ── 3. WATCH OUTS ──────────────────────────────────────────────────── */}
      {watchOuts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Watch outs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {watchOuts.map(t => {
              const urgColour = t.urgency === "high" ? "#e74c3c" : t.urgency === "medium" ? "#e67e22" : "#7f8c8d";
              const urgBg     = t.urgency === "high" ? "#fff5f5" : t.urgency === "medium" ? "#fff8f0" : "#f8f8f8";
              return (
                <div key={t.id} style={{ background: urgBg, border: `1px solid ${urgColour}33`, borderLeft: `3px solid ${urgColour}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>
                      {t.task_type === "protect" ? "🛡️" : t.task_type?.includes("pest") ? "🐛" : t.task_type?.includes("disease") ? "🔬" : "⚠️"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "serif", color: "#1a1a1a" }}>{t.crop?.name || "Watch out"}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: urgColour, background: urgColour + "22", borderRadius: 20, padding: "2px 8px", textTransform: "uppercase", flexShrink: 0, marginLeft: 8 }}>
                          {t.urgency === "high" ? "Act now" : t.urgency === "medium" ? "Inspect" : "Watch"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.stone, lineHeight: 1.4 }}>{t.action}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {t.crop?.name && (t.task_type?.includes("pest") || t.task_type?.includes("inspect") || t.task_type === "protect") ? (
                      <>
                        <button onClick={async () => {
                          if (t.crop_instance_id) await logObservation(t.crop_instance_id, "pest", "pest_found", "mild");
                          completeTask(t);
                        }} style={{ flex: 1, background: urgColour, color: "#fff", border: "none", borderRadius: 8, padding: "8px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          🐛 Found it
                        </button>
                        <button onClick={async () => {
                          if (t.crop_instance_id) await logObservation(t.crop_instance_id, "pest", "looks_healthy");
                          completeTask(t);
                        }} style={{ flex: 1, background: "none", border: `1px solid ${C.sage}`, borderRadius: 8, padding: "8px", color: C.forest, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          ✓ All clear
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => completeTask(t)}
                          style={{ flex: 1, background: urgColour, color: "#fff", border: "none", borderRadius: 8, padding: "8px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          ✓ Done
                        </button>
                        <button onClick={() => { setCompleted(prev => new Set([...prev, t.id])); apiFetch(`/tasks/${t.id}/complete`, { method: "POST" }); }}
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 14px", color: C.stone, fontSize: 12, cursor: "pointer" }}>
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. COMING UP NEXT ──────────────────────────────────────────────── */}
      {comingUpByCrop.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Coming up next</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {comingUpByCrop.slice(0, 5).map(({ name, emoji, tasks }) => (
              <div key={name} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{emoji}</span>
                  <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "serif", color: "#1a1a1a" }}>{name}</span>
                  <span style={{ fontSize: 12, color: C.forest, fontWeight: 600, marginLeft: "auto" }}>{relTime(tasks[0]?.due_date)}</span>
                </div>
                {tasks.slice(0, 3).map((t, i) => (
                  <div key={t.id} style={{ fontSize: 13, color: C.stone, lineHeight: 1.4, paddingTop: i > 0 ? 5 : 0, borderTop: i > 0 ? `1px solid ${C.border}` : "none", marginTop: i > 0 ? 5 : 0, display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span style={{ color: C.sage, flexShrink: 0, marginTop: 1 }}>›</span>
                    <span style={{ flex: 1 }}>{t.action}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. GARDEN PROGRESS ─────────────────────────────────────────────── */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Garden progress</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "Active crops",       value: cropCount,      emoji: "🌱" },
            { label: "In harvest window",  value: harvestCount,   emoji: "🌾" },
            { label: "Needs your input",   value: needsInput,     emoji: "📝", highlight: needsInput > 0 },
            { label: "Tasks done this week", value: completedWeek, emoji: "✅" },
          ].map(({ label, value, emoji, highlight }) => (
            <div key={label} style={{ background: highlight ? "#fff8ed" : C.offwhite, border: `1px solid ${highlight ? C.amber : C.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{emoji}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: highlight ? C.amber : C.forest, fontFamily: "serif", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: C.stone, marginTop: 2, lineHeight: 1.3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── HARVEST CARD ────────────────────────────────────────────────────── */}
      <TodayHarvestCard
        recentHarvests={recentHarvests}
        harvestForecast={data.harvest_forecast}
        harvestedIds={harvestedIds}
        onLogHarvest={(h) => setPendingHarvest(h)}
        onViewAll={() => onTabChange("profile")}
      />

      {/* ── 6. HARVEST FORECAST ────────────────────────────────────────────── */}
      {data.harvest_forecast?.filter(h => !harvestedIds.has(h.crop_instance_id)).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Harvest forecast</div>
          <CollapsibleHarvestForecast
            items={data.harvest_forecast.filter(h => !harvestedIds.has(h.crop_instance_id))}
            onHarvest={(h) => setPendingHarvest(h)}
            pending={pendingHarvest}
          />
        </div>
      )}

      {/* ── 7. HELP ME IMPROVE YOUR PLAN ───────────────────────────────────── */}
      {(data.missing_data || []).length > 0 && (
        <div style={{ background: "#fff8ed", border: `1px solid ${C.amber}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Help me improve your plan</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data.missing_data || []).slice(0, 3).map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>{getCropEmoji(item.name)}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{item.name}</span>
                  <span style={{ fontSize: 12, color: C.stone }}> — {item.missing.join(", ")}</span>
                </div>
                <button onClick={() => { if (onTabChange) onTabChange("crops", { editCropId: item.id, editCropField: item.missing[0]?.includes("variety") ? "variety" : "sow_date" }); }}
                  style={{ fontSize: 12, fontWeight: 700, color: C.amber, background: "none", border: `1px solid ${C.amber}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
                  Update →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TIPS ───────────────────────────────────────────────────────────── */}
      <TipsSection />

      {/* ── PLANT CHECK CARD — Mark only until PRO_ENABLED=true ──────────── */}
      {plantCheckEnabled && <div
        onClick={() => { setPlantCheckPrefill(null); setShowPlantCheck(true); }}
        style={{ background: "#f8faf6", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.forest, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🔍</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", fontFamily: "serif" }}>Plant Check</div>
          <div style={{ fontSize: 12, color: C.stone, marginTop: 1 }}>Take a photo — get an instant diagnosis</div>
        </div>
        <div style={{ fontSize: 18, color: C.stone }}>›</div>
      </div>}

      {/* ── SHARE ──────────────────────────────────────────────────────────── */}
      {showShareGarden && <ShareGardenSheet onClose={() => setShowShareGarden(false)} />}
      <button onClick={() => setShowShareGarden(true)}
        style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: C.forest, fontWeight: 700, fontSize: 13 }}>
        🌱 Share my garden
      </button>

      {/* Invite a friend button */}
      <button onClick={() => setShowReferral(true)}
        style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: C.stone, fontWeight: 600, fontSize: 13 }}>
        👋 Invite a gardening friend — it's free
      </button>

      {/* ── SHARE NUDGE MODAL ──────────────────────────────────────────────── */}
      {/* ── SESSION COMPLETE HOOK ─────────────────────────────────────────────── */}
      {showSessionComplete && sessionCompleteData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowSessionComplete(false)}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "28px 24px 44px", width: "100%", maxWidth: 480 }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>🌱</div>
              <div style={{ fontFamily: "serif", fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
                Nice work today
              </div>
              <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6 }}>
                {sessionCompleteData.completedCount >= 2
                  ? `You've taken care of ${sessionCompleteData.completedCount} jobs — your garden is in good shape.`
                  : "You've taken care of today's most important job."}
              </div>
            </div>

            {/* Tomorrow hook */}
            {sessionCompleteData.nextTask ? (
              <div style={{ background: "#f5f9f7", border: `1px solid ${C.sage}`, borderRadius: 14, padding: "16px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.forest, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  ⭐ Coming up next
                </div>
                <div style={{ fontSize: 14, color: "#1a1a1a", fontWeight: 600, lineHeight: 1.5, marginBottom: 4 }}>
                  {sessionCompleteData.nextTask.crop?.name
                    ? `${sessionCompleteData.nextTask.crop.name} — ${sessionCompleteData.nextTask.action}`
                    : sessionCompleteData.nextTask.action}
                </div>
                <div style={{ fontSize: 12, color: C.stone }}>
                  We'll remind you in the morning
                </div>
              </div>
            ) : (
              <div style={{ background: "#f5f9f7", border: `1px solid ${C.sage}`, borderRadius: 14, padding: "16px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.forest, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  ⭐ Tomorrow
                </div>
                <div style={{ fontSize: 14, color: "#1a1a1a", fontWeight: 600, lineHeight: 1.5, marginBottom: 4 }}>
                  Take a quick look at your garden
                </div>
                <div style={{ fontSize: 12, color: C.stone }}>
                  We'll check in with you in the morning
                </div>
              </div>
            )}

            {/* CTAs */}
            <button
              onClick={() => { setShowSessionComplete(false); sessionCompletedCountRef.current = 0; }}
              style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "serif", marginBottom: 10 }}>
              Done
            </button>
            <button
              onClick={() => { setShowSessionComplete(false); onTabChange("crops"); }}
              style={{ width: "100%", background: "none", border: "none", color: C.stone, fontSize: 13, cursor: "pointer", padding: "8px" }}>
              View my garden
            </button>
          </div>
        </div>
      )}

      {showShareNudge && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowShareNudge(false)}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 480 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
              <div style={{ fontFamily: "serif", fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>5 tasks done!</div>
              <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6 }}>
                You're making real progress. Share your garden with friends — it takes 30 seconds and looks great on Instagram.
              </div>
            </div>
            <button onClick={() => { setShowShareNudge(false); setShowShareGarden(true); }}
              style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "serif", marginBottom: 10 }}>
              🌱 Share my garden
            </button>
            <button onClick={() => setShowShareNudge(false)}
              style={{ width: "100%", background: "none", border: "none", color: C.stone, fontSize: 13, cursor: "pointer", padding: "8px" }}>
              Maybe later
            </button>
          </div>
        </div>
      )}

      {/* ── REFERRAL SHEET ─────────────────────────────────────────────────── */}
      {showReferral && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowReferral(false)}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "28px 24px 48px", width: "100%", maxWidth: 480 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>👋</div>
              <div style={{ fontFamily: "serif", fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>Invite a friend</div>
              <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6 }}>
                Know a gardener who'd love this? Send them the link — Vercro is completely free to use.
              </div>
            </div>

            <div style={{ background: C.offwhite, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, fontSize: 13, color: C.forest, fontWeight: 600, wordBreak: "break-all" }}>
                https://vercro.com
              </div>
              <button onClick={() => { navigator.clipboard.writeText("https://vercro.com"); }}
                style={{ flexShrink: 0, background: C.forest, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Copy
              </button>
            </div>

            <button onClick={() => {
              if (navigator.share) {
                navigator.share({ title: "Vercro — know exactly what to do in your garden", text: "I've been using Vercro to plan my garden — it tells you exactly what to do each day based on your crops and the weather. Free to use:", url: "https://vercro.com" });
              } else {
                navigator.clipboard.writeText("https://vercro.com");
              }
            }}
              style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "serif", marginBottom: 10 }}>
              📤 Share link
            </button>

            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <a href={`https://wa.me/?text=${encodeURIComponent("I've been using Vercro to keep on top of my garden — it tells you exactly what to do each day. Free to use: https://vercro.com")}`}
                target="_blank" rel="noreferrer"
                style={{ flex: 1, background: "#25D366", color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "block" }}>
                💬 WhatsApp
              </a>
              <a href={`mailto:?subject=You'd love this gardening app&body=${encodeURIComponent("Hey! I've been using Vercro to keep on top of my garden — it tells you exactly what tasks to do each day based on your crops and the weather. Completely free: https://vercro.com")}`}
                style={{ flex: 1, background: C.offwhite, color: C.forest, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "block" }}>
                ✉️ Email
              </a>
            </div>

            <button onClick={() => setShowReferral(false)}
              style={{ width: "100%", background: "none", border: "none", color: C.stone, fontSize: 13, cursor: "pointer", padding: "8px" }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Struggling plant confirmation sheet */}
      {strugglingCrop && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}
          onClick={e => { if (e.target === e.currentTarget) setStrugglingCrop(null); }}>
          <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 440, margin: "0 auto" }}>
            <div style={{ fontSize: 32, marginBottom: 12, textAlign: "center" }}>🌿</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 8, textAlign: "center" }}>
              Is your {strugglingCrop.name} struggling?
            </div>
            <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6, marginBottom: 24, textAlign: "center" }}>
              We'll adjust your care plan to focus on getting it back to health — reducing pressure and adding targeted checks.
            </div>
            <div style={{ background: C.offwhite, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>What we'll do:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {["Pause non-essential tasks for this crop", "Add a daily health check prompt", "Flag it for your attention", "Resume normal care once it recovers"].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: C.forest, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: C.stone }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={async () => {
              await logObservation(strugglingCrop.id, "other", "plant_struggling");
              setStrugglingCrop(null);
            }} style={{ width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "serif", marginBottom: 10 }}>
              Yes, it&apos;s struggling
            </button>
            <button onClick={() => setStrugglingCrop(null)}
              style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px", fontWeight: 600, fontSize: 14, cursor: "pointer", color: C.stone }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCelebration && pendingUnlocks.length > 0 && (
        <BadgeCelebrationSheet
          unlocks={pendingUnlocks}
          onClose={() => { setShowCelebration(false); setPendingUnlocks([]); }}
        />
      )}

      {pendingHarvest && (
        <HarvestModal
          item={pendingHarvest}
          onClose={() => setPendingHarvest(null)}
          onSaved={(id, isFinal) => { if (isFinal) setHarvestedIds(s => new Set([...s, id])); loadAllHarvestsForShare(); loadRecentHarvests(); }}
          allHarvests={allHarvestsForShare}
        />
      )}

      {showLogForCrop && (
        <LogActionSheet
          scope={{ type: "crop", id: showLogForCrop.id, name: showLogForCrop.name }}
          conflictTaskType={showLogForCrop.task_type}
          onClose={() => setShowLogForCrop(null)}
          onLogged={() => { setShowLogForCrop(null); load(true); }}
        />
      )}

      {showLogActivity && (
        <LogActionSheet
          scope={null}
          onClose={() => setShowLogActivity(false)}
          onLogged={() => { setShowLogActivity(false); load(true); }}
        />
      )}

      {/* ── PLANT CHECK MODAL ─────────────────────────────────────────────── */}
      {plantCheckEnabled && showPlantCheck && (
        <PlantCheck
          entry="today"
          prefillCrop={plantCheckPrefill}
          onClose={() => { setShowPlantCheck(false); setPlantCheckPrefill(null); }}
          onDone={() => { setShowPlantCheck(false); setPlantCheckPrefill(null); load(true); }}
        />
      )}

      {/* Standalone log activity button — always visible at bottom of Today */}
      <div style={{ padding: "12px 0 4px" }}>
        <button onClick={() => setShowLogActivity(true)}
          style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 16px", fontSize: 13, color: C.stone, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>📋</span> Log activity
        </button>
      </div>

      {allTasks.filter(t => !completed.has(t.id)).length === 0 && recentlyDone.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: C.stone }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 6 }}>
            You're all caught up
          </div>
          <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.5 }}>
            Your garden is in good shape — check back tomorrow.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quick Crop Check ─────────────────────────────────────────────────────────
// Replaces "Needs your input". Two prompt types:
// 1. Missing data (sow date, area)
// 2. Lifecycle confirmations (predicted stage arrived — confirm yes/no)

const STAGE_SEQUENCE = ["seed","seedling","vegetative","flowering","fruiting","harvesting"];

// Predict which stage a crop should be at based on days since sown
// stage_delay_days is added when user taps "Not yet" — shifts all predictions forward
function predictNextStage(crop) {
  if (!crop.sown_date || !crop.crop_def?.days_to_maturity_max) return null;
  const delay    = crop.stage_delay_days || 0;
  const daysSown = Math.floor((Date.now() - new Date(crop.sown_date)) / 86400000) - delay;
  const total    = crop.crop_def.days_to_maturity_max;
  const pctGrown = daysSown / total;

  // Rough stage thresholds as % of total maturity
  const thresholds = [
    { stage: "seedling",   pct: 0.08, maxPct: 0.25 },
    { stage: "vegetative", pct: 0.20, maxPct: 0.55 },
    { stage: "flowering",  pct: 0.50, maxPct: 0.75 },
    { stage: "fruiting",   pct: 0.70, maxPct: 0.92 },
    { stage: "harvesting", pct: 0.90, maxPct: 1.50 },
  ];
  const currentStageIdx = STAGE_SEQUENCE.indexOf(crop.stage || "seed");

  for (const t of thresholds) {
    const stageIdx = STAGE_SEQUENCE.indexOf(t.stage);
    // Skip stages the crop has already confirmed or is clearly past
    if (stageIdx <= currentStageIdx) continue;
    // Skip if the crop is well past this stage's window (maxPct)
    if (pctGrown > t.maxPct) continue;
    // Only prompt if we've reached this stage's threshold
    if (pctGrown >= t.pct) return t.stage;
  }
  return null;
}

const STAGE_QUESTIONS = {
  seedling:   { emoji: "🌱", q: "Have your seedlings emerged?" },
  vegetative: { emoji: "🟢", q: "Are your plants growing strongly now?" },
  flowering:  { emoji: "🌼", q: "Are your plants flowering yet?" },
  fruiting:   { emoji: "🍅", q: "Has fruit started to set?" },
  harvesting: { emoji: "🔵", q: "Is this crop ready to start harvesting?" },
};

function QuickCropCheck({ crops, allTasks = [], missingItems, onDismiss, onNavigateCrop, sectionLabel }) {
  const [open,       setOpen]       = useState(false);
  const [actioning,  setActioning]  = useState(null);
  const [dismissed,  setDismissed]  = useState(new Set());

  // Build lifecycle prompts from crops — exclude planned/unsown crops
  const lifecyclePrompts = crops
    .filter(crop => {
      if (crop.status === "planned" || !crop.sown_date) return false;
      if (dismissed.has(crop.id + "_lifecycle")) return false;
      if (crop.stage_check_snoozed_until && new Date(crop.stage_check_snoozed_until) > new Date()) return false;
      return !!predictNextStage(crop);
    })
    .map(crop => ({
      type:        "lifecycle",
      crop,
      nextStage:   predictNextStage(crop),
    }));

  // Build perennial lifecycle prompts from tasks with lifecycle_check meta
  const perennialPrompts = (crops || [])
    .filter(crop => crop.crop_def?.is_perennial && !dismissed.has(crop.id + "_perennial"))
    .flatMap(crop => {
      // Find open check tasks for this crop with lifecycle_check in meta
      const checkTasks = (allTasks || []).filter(t => {
        if (t.crop_instance_id !== crop.id) return false;
        if (t.completed_at) return false;
        if (t.task_type !== "check" && t.task_type !== "harvest") return false;
        try {
          const meta = typeof t.meta === "string" ? JSON.parse(t.meta) : (t.meta || {});
          return meta.lifecycle_check === true;
        } catch { return false; }
      });
      return checkTasks.map(t => ({ type: "perennial_lifecycle", crop, task: t }));
    })
    .filter((p, i, arr) => arr.findIndex(x => x.crop.id === p.crop.id) === i); // one per crop

  // Build sow method prompts — planned crops where sow_method is "either" and establishment_method not set
  const sowMethodPrompts = (crops || [])
    .filter(crop =>
      crop.status === "planned" &&
      !crop.establishment_method &&
      !dismissed.has(crop.id + "_sowmethod") &&
      crop.crop_def?.sow_method === "either"
    )
    .map(crop => ({ type: "sowmethod", crop }));

  // Build missing data prompts — exclude planned crops (they have no sow date by design)
  const missingPrompts = (missingItems || [])
    .filter(item => !dismissed.has(item.id + "_missing") && item.status !== "planned")
    .map(item => ({ type: "missing", item }));

  // Priority order: sow method first, then missing sow date, then lifecycle, then other missing
  const sowDateMissing = missingPrompts.filter(p => p.item.missing.some(m => m.includes("sow")));
  const otherMissing   = missingPrompts.filter(p => !p.item.missing.some(m => m.includes("sow")));
  const allPrompts     = [...sowMethodPrompts, ...sowDateMissing, ...lifecyclePrompts, ...perennialPrompts, ...otherMissing].slice(0, 3);

  if (allPrompts.length === 0) return null;
  // Render with optional section label

  const handleLifecycle = async (crop, nextStage, confirmed) => {
    setActioning(crop.id);
    setDismissed(prev => new Set([...prev, crop.id + "_lifecycle"]));
    try {
      // Log observation — feeds back into engine
      const symptomCode = confirmed
        ? `${nextStage}_confirmed`
        : `${nextStage}_not_yet`;
      await apiFetch(`/crops/${crop.id}/observe`, {
        method: "POST",
        body: JSON.stringify({
          observation_type: "growth",
          symptom_code:     symptomCode,
          notes:            confirmed ? `Stage ${nextStage} confirmed by user` : `Stage ${nextStage} not yet reached`,
        }),
      });
      // Also update the stage via confirm-stage
      const result = await apiFetch(`/crops/${crop.id}/confirm-stage`, {
        method: "POST",
        body: JSON.stringify({ stage: nextStage, confirmed }),
      });
      if (onDismiss) onDismiss(result?.crop);
    } catch (e) {
      console.error(e);
      setDismissed(prev => { const s = new Set(prev); s.delete(crop.id + "_lifecycle"); return s; });
    }
    setActioning(null);
  };

  const handleMissingDismiss = (itemId) => {
    setDismissed(prev => new Set([...prev, itemId + "_missing"]));
  };

  const handleSowMethod = async (crop, method) => {
    setActioning(crop.id);
    setDismissed(prev => new Set([...prev, crop.id + "_sowmethod"]));
    try {
      await apiFetch(`/crops/${crop.id}`, {
        method: "PUT",
        body: JSON.stringify({ establishment_method: method }),
      });
      if (onDismiss) onDismiss();
    } catch (e) {
      console.error(e);
      setDismissed(prev => { const s = new Set(prev); s.delete(crop.id + "_sowmethod"); return s; });
    }
    setActioning(null);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {sectionLabel && (
        <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>{sectionLabel}</div>
      )}
      <div onClick={() => setOpen(v => !v)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0f7f4", border: `1px solid ${C.sage}`, borderRadius: open ? "12px 12px 0 0" : 12, padding: "12px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🌱</span>
          <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: C.forest }}>Crop checks</span>
          <span style={{ fontSize: 11, color: C.forest, background: "#d8eee6", borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>{allPrompts.length}</span>
        </div>
        <span style={{ fontSize: 12, color: C.stone }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ background: "#f0f7f4", border: `1px solid ${C.sage}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {allPrompts.map((prompt, i) => {
            if (prompt.type === "lifecycle") {
              const { crop, nextStage } = prompt;
              const q = STAGE_QUESTIONS[nextStage];
              const isActioning = actioning === crop.id;
              return (
                <div key={crop.id} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>{q?.emoji || "🌱"}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: "#1a1a1a" }}>{crop.name}</div>
                      {crop.variety && <div style={{ fontSize: 11, color: C.stone }}>{typeof crop.variety === "object" ? crop.variety.name : crop.variety}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: C.stone, marginBottom: 12, lineHeight: 1.4 }}>{q?.q || `Has this crop reached the ${nextStage} stage?`}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleLifecycle(crop, nextStage, true)} disabled={isActioning}
                      style={{ flex: 2, padding: "9px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: isActioning ? 0.6 : 1 }}>
                      {isActioning ? "Saving…" : "Yes ✓"}
                    </button>
                    <button onClick={() => handleLifecycle(crop, nextStage, false)} disabled={isActioning}
                      style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: isActioning ? 0.6 : 1 }}>
                      Not yet
                    </button>
                  </div>
                </div>
              );
            }
            // Sow method prompt
            if (prompt.type === "sowmethod") {
              const { crop } = prompt;
              const isActioning = actioning === crop.id;
              return (
                <div key={crop.id + "_sowmethod"} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>{getCropEmoji(crop.name)}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: "#1a1a1a" }}>{crop.name}</div>
                      {crop.variety && <div style={{ fontSize: 11, color: C.stone }}>{typeof crop.variety === "object" ? crop.variety.name : crop.variety}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: C.stone, marginBottom: 12, lineHeight: 1.4 }}>
                    Are you planning to sow this indoors first, or direct outdoors?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleSowMethod(crop, "indoors")} disabled={isActioning}
                      style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.offwhite, color: "#1a1a1a", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: isActioning ? 0.6 : 1 }}>
                      🪟 Indoors
                    </button>
                    <button onClick={() => handleSowMethod(crop, "direct_sow")} disabled={isActioning}
                      style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.offwhite, color: "#1a1a1a", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: isActioning ? 0.6 : 1 }}>
                      🌱 Outdoors
                    </button>
                  </div>
                </div>
              );
            }

            // Perennial lifecycle check
            if (prompt.type === "perennial_lifecycle") {
              const { crop, task } = prompt;
              return (
                <div key={crop.id} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>{getCropEmoji(crop.name)}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: "#1a1a1a" }}>{crop.name}</div>
                      <div style={{ fontSize: 11, color: C.stone }}>Perennial check</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: C.stone, marginBottom: 12, lineHeight: 1.4 }}>{task.action}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={async () => {
                      setDismissed(prev => new Set([...prev, crop.id + "_perennial"]));
                      await apiFetch(`/tasks/${task.id}/complete`, { method: "POST" });
                      if (onDismiss) onDismiss();
                    }} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      ✓ Done
                    </button>
                    <button onClick={() => setDismissed(prev => new Set([...prev, crop.id + "_perennial"]))}
                      style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                      Later
                    </button>
                  </div>
                </div>
              );
            }

            // Missing data prompt
            const { item } = prompt;
            const missingVariety = item.missing.some(m => m.includes("variety"));
            const missingSowDate = item.missing.some(m => m.includes("sow"));
            return (
              <div key={item.id} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{missingVariety ? "🌿" : "📅"}</span>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: "#1a1a1a" }}>{item.name}</div>
                </div>
                <div style={{ fontSize: 13, color: C.stone, marginBottom: 12 }}>
                  Missing: {item.missing.join(", ")} — add it for more accurate tasks
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {onNavigateCrop && (
                    <button onClick={() => { handleMissingDismiss(item.id); onNavigateCrop(item.id, missingVariety ? "variety" : "sow_date"); }}
                      style={{ flex: 2, padding: "9px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      {missingVariety ? "Add variety →" : "Add sow date →"}
                    </button>
                  )}
                  <button onClick={() => handleMissingDismiss(item.id)}
                    style={{ flex: 1, padding: "9px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    Later
                  </button>
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: C.stone, fontStyle: "italic", textAlign: "center" }}>Better data = more accurate tasks and predictions</div>
        </div>
      )}
    </div>
  );
}

// ── Tips inner — shows 1 tip with show more ──────────────────────────────────
function TipsInner({ tips }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tips : tips.slice(0, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {visible.map((tip, i) => (
        <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", background: C.offwhite, borderRadius: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>{tip.emoji || "🌱"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#222", marginBottom: 2 }}>{tip.title}</div>
            <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.5 }}>{tip.tip}</div>
          </div>
        </div>
      ))}
      {tips.length > 1 && (
        <button onClick={() => setShowAll(v => !v)}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px", fontSize: 12, color: C.forest, fontWeight: 600, cursor: "pointer" }}>
          {showAll ? "▲ Show less" : `+ ${tips.length - 1} more tip${tips.length - 1 !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}

// ── Tips section ──────────────────────────────────────────────────────────────
function TipsSection() {
  const [open,    setOpen]    = useState(false);
  const [tips,    setTips]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  const load = async () => {
    if (loaded) { setOpen(v => !v); return; }
    setOpen(true);
    setLoading(true);
    try {
      const d = await apiFetch("/tips");
      setTips(d.tips || []);
    } catch {}
    setLoading(false);
    setLoaded(true);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div onClick={load}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: open ? "12px 12px 0 0" : 12, padding: "12px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: "#222" }}>Garden tips</span>
          <span style={{ fontSize: 11, color: C.stone, background: C.offwhite, borderRadius: 20, padding: "2px 8px" }}>This week</span>
        </div>
        <span style={{ fontSize: 12, color: C.stone }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "12px 16px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: C.stone, fontSize: 13 }}>Generating tips for your garden...</div>
          ) : tips.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: C.stone, fontSize: 13 }}>No tips yet — add some crops to get personalised advice.</div>
          ) : (
            <TipsInner tips={tips} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Collapsible harvest forecast ──────────────────────────────────────────────
function CollapsibleHarvestForecast({ items, onHarvest, pending }) {
  const [showAll, setShowAll] = useState(false);
  const INITIAL_SHOW = 4;

  // Sort by window_start soonest first
  const sorted = [...items].sort((a, b) => new Date(a.window_start) - new Date(b.window_start));
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_SHOW);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "12px 12px 0 0", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🌾</span>
          <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: "#222" }}>Harvest forecast</span>
          <span style={{ fontSize: 11, color: C.forest, background: "#e8f4e8", borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>{items.length} crop{items.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {visible.map((h, i) => (
            <HarvestForecastCard key={i} item={h} pending={!!pending && pending === h} onHarvest={() => onHarvest(h)} />
          ))}
        </div>
        {items.length > INITIAL_SHOW && (
          <button onClick={() => setShowAll(v => !v)}
            style={{ width: "100%", marginTop: 10, padding: "8px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.forest, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            {showAll ? "▲ Show less" : `+ ${items.length - INITIAL_SHOW} more`}
          </button>
        )}
      </div>
    </div>
  );
}


function TaskCard({ task, completed, onComplete, showUndo, onUndo, isUpcoming = false }) {
  const [animating, setAnimating] = useState(false);
  const [expanded,  setExpanded]  = useState(false);

  // ── Timing colour ──────────────────────────────────────────────────────────
  const timing = task.timing_status || "peak";
  const timingColor = timing === "early" ? "#D9A441"   // amber — early
                    : timing === "late"  ? "#C65A5A"   // red — past peak
                    : "#6FAF63";                        // green — peak
  const timingLabel = timing === "early" ? "Early in window"
                    : timing === "late"  ? "Past peak"
                    : "Peak time";
  const timingBg    = timing === "early" ? "#fff8ed"
                    : timing === "late"  ? "#fff0f0"
                    : "#f0f7ee";

  const urgencyColor = task.urgency === "high" ? C.red : task.urgency === "medium" ? C.amber : C.leaf;
  const isEstimated  = task.date_confidence === "estimated";

  // ── Window label ───────────────────────────────────────────────────────────
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let windowLabel = null;
  if (task.due_window_start && task.due_window_end) {
    const ws = new Date(task.due_window_start);
    const we = new Date(task.due_window_end);
    const wsM = MONTHS[ws.getMonth()];
    const weM = MONTHS[we.getMonth()];
    windowLabel = wsM === weM ? wsM : `${wsM}–${weM}`;

    // Days until window closes
    const daysLeft = Math.ceil((we.getTime() - Date.now()) / 86400000);
    if (daysLeft > 0 && daysLeft <= 14) {
      windowLabel += ` · ${daysLeft}d left`;
    } else if (daysLeft <= 0) {
      windowLabel += " · closing";
    }
  }

  // ── Why text from meta ─────────────────────────────────────────────────────
  let whyText = null;
  try {
    const meta = typeof task.meta === "string" ? JSON.parse(task.meta) : task.meta;
    if (meta?.why) whyText = meta.why;
  } catch {}

  const handleComplete = () => {
    if (completed || animating) return;
    setAnimating(true);
    setTimeout(() => { setAnimating(false); onComplete(task); }, 350);
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          background: completed ? "#f0f4f2" : C.cardBg,
          border: `1px solid ${completed ? C.border : timingColor + "55"}`,
          borderLeft: `3px solid ${completed ? C.sage : timingColor}`,
          borderRadius: 12,
          padding: "13px 14px",
          opacity: animating ? 0 : completed ? 0.55 : 1,
          transform: animating ? "translateX(30px)" : "translateX(0)",
          transition: "opacity 0.35s ease, transform 0.35s ease",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Timing dot */}
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: timingColor, flexShrink: 0, marginTop: 2 }} />

          <div style={{ flex: 1, minWidth: 0 }} onClick={() => !completed && setExpanded(e => !e)} role="button">
            <div style={{ fontWeight: 700, fontSize: 14, color: completed ? C.stone : "#222", textDecoration: completed ? "line-through" : "none", fontFamily: "serif" }}>
              {task.crop?.name ? getCropEmoji(task.crop.name) + " " + task.crop.name : "General"}
              {task.crop?.variety && <span style={{ fontWeight: 400, color: C.stone, fontSize: 13 }}> · {task.crop.variety}</span>}
            </div>
            <div style={{ fontSize: 13, color: C.stone, marginTop: 2, lineHeight: 1.4 }}>{task.action}</div>

            {/* Upcoming date label — uses effective_due_date if adjusted */}
            {isUpcoming && (task.effective_due_date || task.due_date) && (
              <div style={{ fontSize: 11, color: task.adjustment_type ? "#b45309" : C.forest, fontWeight: 600, marginTop: 4 }}>
                📅 Due {new Date(task.effective_due_date || task.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                {task.adjustment_type === "moved_earlier" && " · brought forward"}
                {task.adjustment_type === "moved_later"   && " · moved back"}
              </div>
            )}

            {/* Pills row */}
            <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap", alignItems: "center" }}>
              {/* Timing pill */}
              {!completed && (
                <span style={{ background: timingBg, borderRadius: 20, fontSize: 10, padding: "2px 8px", color: timingColor, fontWeight: 700, border: `1px solid ${timingColor}44` }}>
                  {timingLabel}
                </span>
              )}
              {/* Window pill */}
              {windowLabel && !completed && (
                <span style={{ background: C.offwhite, borderRadius: 20, fontSize: 10, padding: "2px 8px", color: C.stone }}>
                  📅 {windowLabel}
                </span>
              )}
              {/* Area pill */}
              {task.area?.name && (
                <span style={{ background: C.offwhite, borderRadius: 20, fontSize: 10, padding: "2px 8px", color: C.forest }}>
                  {task.area.name}
                </span>
              )}
              {isEstimated && (
                <span style={{ background: "#fff8ed", border: `1px solid ${C.amber}`, borderRadius: 20, fontSize: 10, padding: "2px 8px", color: C.amber }}>
                  ~estimated
                </span>
              )}
              {/* Time away adjustment badge */}
              {task.adjustment_type === "moved_earlier" && !completed && (
                <span style={{ background: "#e8f5ee", border: "1px solid #86c9a0", borderRadius: 20, fontSize: 10, padding: "2px 8px", color: C.forest, fontWeight: 600 }}>
                  ⬆ Moved earlier
                </span>
              )}
              {task.adjustment_type === "moved_later" && !completed && (
                <span style={{ background: "#fff8ed", border: `1px solid ${C.amber}`, borderRadius: 20, fontSize: 10, padding: "2px 8px", color: "#b45309", fontWeight: 600 }}>
                  ⬇ Moved later
                </span>
              )}
              {task.adjustment_type === "at_risk" && !completed && (
                <span style={{ background: "#fff0f0", border: "1px solid #fca5a5", borderRadius: 20, fontSize: 10, padding: "2px 8px", color: C.red, fontWeight: 600 }}>
                  ⚠ At risk
                </span>
              )}
              {/* Expand why */}
              {whyText && !completed && (
                <span onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                  style={{ background: C.offwhite, borderRadius: 20, fontSize: 10, padding: "2px 8px", color: C.forest, cursor: "pointer", fontWeight: 600 }}>
                  {expanded ? "▲ less" : "▼ why?"}
                </span>
              )}
              {showUndo && onUndo && (
                <button onClick={e => { e.stopPropagation(); onUndo(task); }}
                  style={{ background: C.offwhite, border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 10, padding: "2px 10px", color: C.forest, cursor: "pointer", fontWeight: 600 }}>
                  Undo
                </button>
              )}
            </div>

            {/* Expanded why text */}
            {expanded && whyText && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#f0f7f4", borderRadius: 8, fontSize: 12, color: C.forest, lineHeight: 1.5, borderLeft: `2px solid ${C.sage}` }}>
                💡 {whyText}
              </div>
            )}
          </div>

          {/* Complete button */}
          <div onClick={isUpcoming ? undefined : handleComplete} style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${isUpcoming ? C.border : animating || completed ? C.leaf : C.border}`, background: isUpcoming ? C.offwhite : animating || completed ? C.leaf : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s", cursor: isUpcoming ? "default" : completed ? "default" : "pointer" }}>
            {(animating || completed) && <span style={{ color: "#fff", fontSize: 13 }}>✓</span>}
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Garden view ───────────────────────────────────────────────────────────────
function GardenView({ onNavigateAdd }) {
  const GARDEN_CACHE = "vercro_garden_v1";
  const _cachedGarden = (() => { try { const c = localStorage.getItem(GARDEN_CACHE); if (c) { const { locs, cropsData, ts } = JSON.parse(c); if (Date.now() - ts < 5 * 60 * 1000) return { locs, cropsData }; } } catch(e) {} return null; })();
  const [locations, setLocations] = useState(_cachedGarden?.locs || []);
  const [crops,     setCrops]     = useState(_cachedGarden?.cropsData || []);
  const [loading,   setLoading]   = useState(!_cachedGarden);
  const [error,     setError]     = useState(null);

  // Add area form state
  const [showAddArea,     setShowAddArea]     = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newArea,         setNewArea]         = useState({ name: "", type: "raised_bed", location_id: "", width_m: "", length_m: "", soil_ph: "", soil_temperature_c: "" });
  const [newLocation,     setNewLocation]     = useState({ name: "", postcode: "", width_m: "", length_m: "" });
  const [saving,          setSaving]          = useState(false);
  const [deleteLocationTarget, setDeleteLocationTarget] = useState(null);
  const [deletingLocation,     setDeletingLocation]     = useState(false);
  const [logScope,             setLogScope]             = useState(null);
  const [editingLocation,      setEditingLocation]      = useState(null);
  const [editLocationForm,     setEditLocationForm]     = useState({ name: "", postcode: "", width_m: "", length_m: "" });

  const load = useCallback(async () => {
    // Fetch fresh
    try {
      const [locs, cropsData] = await Promise.all([apiFetch("/locations"), apiFetch("/crops")]);
      setLocations(locs); setCrops(cropsData);
      try { localStorage.setItem(GARDEN_CACHE, JSON.stringify({ locs, cropsData, ts: Date.now() })); } catch(e) {}
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveArea = async () => {
    if (!newArea.name || !newArea.location_id) return;
    setSaving(true);
    try {
      await apiFetch("/areas", { method: "POST", body: JSON.stringify(newArea) });
      setNewArea({ name: "", type: "raised_bed", location_id: "", width_m: "", length_m: "", soil_ph: "", soil_temperature_c: "" });
      setShowAddArea(false);
      try { localStorage.removeItem("vercro_garden_v1"); } catch(e) {}
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const saveLocation = async () => {
    if (!newLocation.name) return;
    setSaving(true);
    try {
      await apiFetch("/locations", { method: "POST", body: JSON.stringify(newLocation) });
      setNewLocation({ name: "", postcode: "", width_m: "", length_m: "" });
      setShowAddLocation(false);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const [editingArea,    setEditingArea]    = useState(null);
  const [editAreaForm,   setEditAreaForm]   = useState({ name: "", type: "", width_m: "", length_m: "", soil_ph: "", soil_temperature_c: "" });
  const [confirmArea,    setConfirmArea]    = useState(null);
  const [suggestArea,    setSuggestArea]    = useState(null);
  const [timelineCrop,   setTimelineCrop]   = useState(null);
  const [collapsedLocs,  setCollapsedLocs]  = useState({});

  const saveEditArea = async (areaId) => {
    setSaving(true);
    try {
      await apiFetch(`/areas/${areaId}`, {
        method: "PUT",
        body: JSON.stringify(editAreaForm),
      });
      setEditingArea(null);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const saveEditLocation = async (locId) => {
    setSaving(true);
    try {
      await apiFetch(`/locations/${locId}`, {
        method: "PUT",
        body: JSON.stringify(editLocationForm),
      });
      setEditingLocation(null);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteArea = async (areaId) => {
    setSaving(true);
    try {
      await apiFetch(`/areas/${areaId}`, { method: "DELETE" });
      setConfirmArea(null);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };
  const cropsByArea = crops.reduce((acc, c) => {
    if (!acc[c.area_id]) acc[c.area_id] = [];
    acc[c.area_id].push(c);
    return acc;
  }, {});

  if (loading) return <Spinner />;
  if (error)   return <ErrorMsg msg={error} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>My Garden</div>
          <div style={{ fontSize: 13, color: C.stone, marginTop: 2 }}>{locations.length} location{locations.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={() => { setShowAddLocation(!showAddLocation); setShowAddArea(false); }}
          style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          + Location
        </button>
      </div>

      {/* Delete location confirmation modal */}
      {deleteLocationTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteLocationTarget(null); }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 44px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 14 }}>⚠️</div>
            <div style={{ fontSize: 19, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", textAlign: "center", marginBottom: 6 }}>
              Delete "{deleteLocationTarget.name}"?
            </div>
            <div style={{ fontSize: 14, color: C.stone, textAlign: "center", lineHeight: 1.6 }}>
              This will permanently delete this location and everything inside it.
            </div>
            <div style={{ background: "#fff8f0", border: `1px solid ${C.amber}`, borderRadius: 10, padding: "12px 14px", margin: "14px 0" }}>
              {[
                { icon: "🪣", text: `${deleteLocationTarget.areas?.length || 0} growing area${(deleteLocationTarget.areas?.length || 0) !== 1 ? "s" : ""} will be deleted` },
                { icon: "🌱", text: "All crops in this location and their tasks will be deleted" },
                { icon: "📋", text: "All task history for these crops will be lost" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#8a5c00", marginBottom: i < 2 ? 6 : 0, lineHeight: 1.4 }}>
                  <span style={{ flexShrink: 0 }}>{r.icon}</span>
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.stone, textAlign: "center", marginBottom: 18 }}>This cannot be undone.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button disabled={deletingLocation}
                onClick={async () => {
                  setDeletingLocation(true);
                  try {
                    await apiFetch(`/locations/${deleteLocationTarget.id}`, { method: "DELETE" });
                    setLocations(ls => ls.filter(l => l.id !== deleteLocationTarget.id));
                    setDeleteLocationTarget(null);
                  } catch(e) { alert("Failed to delete location: " + e.message); }
                  setDeletingLocation(false);
                }}
                style={{ background: C.red, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
                {deletingLocation ? "Deleting…" : "Yes, delete this location"}
              </button>
              <button onClick={() => setDeleteLocationTarget(null)}
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, fontSize: 14, color: "#666", cursor: "pointer" }}>
                Cancel — keep it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add location form */}
      {showAddLocation && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.forest}`, borderRadius: 12, padding: "16px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", marginBottom: 12 }}>New location</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div><label style={labelStyle}>Name</label>
              <input value={newLocation.name} onChange={e => setNewLocation(l => ({ ...l, name: e.target.value }))} style={inputStyle} placeholder="e.g. Allotment plot 7" /></div>
            <div><label style={labelStyle}>Postcode</label>
              <input value={newLocation.postcode} onChange={e => setNewLocation(l => ({ ...l, postcode: e.target.value.toUpperCase() }))} style={inputStyle} placeholder="e.g. TS22" />
              <div style={{ fontSize: 11, color: C.stone, marginTop: 4 }}>First part only — e.g. <strong>TS22</strong>, not TS22 5BQ</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: -4 }}>Size <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional, useful for future planning</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label style={labelStyle}>Width (m)</label>
                <input value={newLocation.width_m} onChange={e => setNewLocation(l => ({ ...l, width_m: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 10" /></div>
              <div><label style={labelStyle}>Length (m)</label>
                <input value={newLocation.length_m} onChange={e => setNewLocation(l => ({ ...l, length_m: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 5" /></div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveLocation} disabled={saving || !newLocation.name}
                style={{ flex: 1, background: !newLocation.name ? C.border : C.forest, color: !newLocation.name ? C.stone : "#fff", border: "none", borderRadius: 8, padding: 12, fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
                {saving ? "Saving…" : "Save location"}
              </button>
              <button onClick={() => setShowAddLocation(false)}
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 14px", color: C.stone, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {locations.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 20px", color: C.stone, fontSize: 14 }}>
          No locations yet. Use the + Location button above.
        </div>
      )}

      {logScope && (
        <LogActionSheet
          scope={logScope}
          onClose={() => setLogScope(null)}
          onLogged={() => { setLogScope(null); load(); }}
        />
      )}

      {suggestArea && (
        <PlantingSuggestionsSheet
          area={suggestArea}
          hasCrops={(cropsByArea[suggestArea?.id] || []).filter(c => c.status !== 'planned').length > 0}
          onClose={(result) => {
            setSuggestArea(null);
            if (result?.prefill && onNavigateAdd) {
              // User tapped a crop card — navigate to Add Crop pre-filled
              onNavigateAdd({ ...result.prefill, area_id: suggestArea.id });
            } else {
              load();
            }
          }}
          onAddCrop={() => { setSuggestArea(null); load(); }}
        />
      )}

      {locations.map(loc => (
        <div key={loc.id} style={{ marginBottom: 28 }}>
          {/* Location header — tap name to collapse */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flex: 1 }}
              onClick={() => setCollapsedLocs(c => ({ ...c, [loc.id]: !c[loc.id] }))}>
              <PhotoCircle photoUrl={loc.photo_url} size={44} endpoint={"/photos/location/" + loc.id}
                onUploaded={url => setLocations(ls => ls.map(l => l.id === loc.id ? { ...l, photo_url: url } : l))} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "serif", color: C.forest }}>{loc.name}</div>
                {(loc.width_m || loc.length_m) && (
                  <div style={{ fontSize: 11, color: C.stone, marginTop: 1 }}>
                    {loc.width_m && loc.length_m ? `${loc.width_m}m × ${loc.length_m}m` : loc.width_m ? `Width ${loc.width_m}m` : `Length ${loc.length_m}m`}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: C.stone, marginLeft: 4 }}>{collapsedLocs[loc.id] ? "▶" : "▼"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {!collapsedLocs[loc.id] && (
                <>
                  <button onClick={e => { e.stopPropagation(); setShowAddArea(loc.id); setShowAddLocation(false); setNewArea(a => ({ ...a, location_id: loc.id })); }}
                    style={{ background: C.offwhite, border: `1px solid ${C.border}`, color: C.forest, borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    + Add area
                  </button>
                  <button onClick={e => { e.stopPropagation(); setLogScope({ type: "location", id: loc.id, name: loc.name }); }}
                    style={{ background: C.offwhite, border: `1px solid ${C.border}`, color: C.stone, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    📋 Log
                  </button>
                  <button onClick={e => { e.stopPropagation(); setEditingLocation(loc.id); setEditLocationForm({ name: loc.name || "", postcode: loc.postcode || "", width_m: loc.width_m ?? "", length_m: loc.length_m ?? "" }); }}
                    style={{ background: "none", border: `1px solid ${C.border}`, color: C.stone, borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>
                    Edit
                  </button>
                </>
              )}
              <button onClick={e => { e.stopPropagation(); setDeleteLocationTarget(loc); }}
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.red, fontSize: 13, flexShrink: 0 }}>
                ✕
              </button>
            </div>
          </div>

          {/* Edit location inline form */}
          {editingLocation === loc.id && (
            <div style={{ background: C.cardBg, border: `1px solid ${C.forest}`, borderRadius: 12, padding: "14px", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "serif", marginBottom: 10 }}>Edit location</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><label style={labelStyle}>Name</label>
                  <input value={editLocationForm.name} onChange={e => setEditLocationForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} /></div>
                <div><label style={labelStyle}>Postcode</label>
                  <input value={editLocationForm.postcode} onChange={e => setEditLocationForm(f => ({ ...f, postcode: e.target.value.toUpperCase() }))} style={inputStyle} />
                  <div style={{ fontSize: 11, color: C.stone, marginTop: 4 }}>First part only — e.g. <strong>TS22</strong></div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: -4 }}>Size <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={labelStyle}>Width (m)</label>
                    <input value={editLocationForm.width_m} onChange={e => setEditLocationForm(f => ({ ...f, width_m: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 10" /></div>
                  <div><label style={labelStyle}>Length (m)</label>
                    <input value={editLocationForm.length_m} onChange={e => setEditLocationForm(f => ({ ...f, length_m: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 5" /></div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => saveEditLocation(loc.id)} disabled={saving || !editLocationForm.name}
                    style={{ flex: 1, background: C.forest, color: "#fff", border: "none", borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "serif" }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditingLocation(null)}
                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 14px", color: C.stone, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {!collapsedLocs[loc.id] && (<div>

          {/* Add area form for this location */}
          {showAddArea === loc.id && (
            <div style={{ background: C.cardBg, border: `1px solid ${C.forest}`, borderRadius: 12, padding: "14px", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "serif", marginBottom: 10 }}>New growing area</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div><label style={labelStyle}>Name</label>
                  <input value={newArea.name} onChange={e => setNewArea(a => ({ ...a, name: e.target.value }))} style={inputStyle} placeholder="e.g. Raised bed 2, Greenhouse" /></div>
                <div><label style={labelStyle}>Type</label>
                  <select value={newArea.type} onChange={e => setNewArea(a => ({ ...a, type: e.target.value }))} style={inputStyle}>
                    <option value="raised_bed">Raised bed</option>
                    <option value="open_ground">Open ground</option>
                    <option value="greenhouse">Greenhouse</option>
                    <option value="polytunnel">Polytunnel</option>
                    <option value="container">Container / pots</option>
                  </select></div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: -4 }}>Size <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional, supports future planning</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={labelStyle}>Width (m)</label>
                    <input value={newArea.width_m} onChange={e => setNewArea(a => ({ ...a, width_m: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 2.4" /></div>
                  <div><label style={labelStyle}>Length (m)</label>
                    <input value={newArea.length_m} onChange={e => setNewArea(a => ({ ...a, length_m: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 1.2" /></div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: -4 }}>Soil <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional, improves recommendations</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={labelStyle}>Soil pH</label>
                    <input value={newArea.soil_ph} onChange={e => setNewArea(a => ({ ...a, soil_ph: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 6.5" /></div>
                  <div><label style={labelStyle}>Soil temp (°C)</label>
                    <input value={newArea.soil_temperature_c} onChange={e => setNewArea(a => ({ ...a, soil_temperature_c: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 12" /></div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveArea} disabled={saving || !newArea.name}
                    style={{ flex: 1, background: !newArea.name ? C.border : C.forest, color: !newArea.name ? C.stone : "#fff", border: "none", borderRadius: 8, padding: 12, fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
                    {saving ? "Saving…" : "Save area"}
                  </button>
                  <button onClick={() => setShowAddArea(false)}
                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 14px", color: C.stone, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Areas */}
          {(loc.growing_areas || []).map(area => {
            const areaCrops = cropsByArea[area.id] || [];
            return (
              <div key={area.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>

                {/* Confirm delete */}
                {confirmArea === area.id && (
                  <div style={{ background: "#fff5f5", border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 8 }}>Remove {area.name}? {areaCrops.length > 0 ? `This will also remove ${areaCrops.length} crop${areaCrops.length > 1 ? "s" : ""} in it.` : ""}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => deleteArea(area.id)} disabled={saving}
                        style={{ flex: 1, background: C.red, color: "#fff", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        {saving ? "Removing…" : "Yes, remove"}
                      </button>
                      <button onClick={() => setConfirmArea(null)}
                        style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 0", color: C.stone, cursor: "pointer", fontSize: 12 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {editingArea === area.id ? (
                  /* Edit form */
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "serif", color: "#1a1a1a" }}>Edit area</div>
                    <div>
                      <label style={labelStyle}>Name</label>
                      <input value={editAreaForm.name} onChange={e => setEditAreaForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Type</label>
                      <select value={editAreaForm.type} onChange={e => setEditAreaForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                        <option value="raised_bed">Raised bed</option>
                        <option value="open_ground">Open ground</option>
                        <option value="greenhouse">Greenhouse</option>
                        <option value="polytunnel">Polytunnel</option>
                        <option value="container">Container / pots</option>
                      </select>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: -4 }}>Size <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional</span></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div><label style={labelStyle}>Width (m)</label>
                        <input value={editAreaForm.width_m} onChange={e => setEditAreaForm(f => ({ ...f, width_m: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 2.4" /></div>
                      <div><label style={labelStyle}>Length (m)</label>
                        <input value={editAreaForm.length_m} onChange={e => setEditAreaForm(f => ({ ...f, length_m: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 1.2" /></div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: -4 }}>Soil <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— optional</span></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div><label style={labelStyle}>Soil pH</label>
                        <input value={editAreaForm.soil_ph} onChange={e => setEditAreaForm(f => ({ ...f, soil_ph: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 6.5" /></div>
                      <div><label style={labelStyle}>Soil temp (°C)</label>
                        <input value={editAreaForm.soil_temperature_c} onChange={e => setEditAreaForm(f => ({ ...f, soil_temperature_c: e.target.value }))} style={inputStyle} inputMode="decimal" placeholder="e.g. 12" /></div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => saveEditArea(area.id)} disabled={saving || !editAreaForm.name}
                        style={{ flex: 1, background: C.forest, color: "#fff", border: "none", borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "serif" }}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditingArea(null)}
                        style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 14px", color: C.stone, cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: areaCrops.length > 0 ? 10 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <PhotoCircle photoUrl={area.photo_url} size={36} endpoint={"/photos/area/" + area.id}
                          onUploaded={url => setLocations(ls => ls.map(l => ({ ...l, growing_areas: (l.growing_areas || []).map(a => a.id === area.id ? { ...a, photo_url: url } : a) })))} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{area.name}</div>
                          <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>
                            {[
                              area.type.replace(/_/g, " "),
                              area.width_m && area.length_m ? `${area.width_m}m × ${area.length_m}m` : area.width_m ? `${area.width_m}m wide` : area.length_m ? `${area.length_m}m long` : null,
                              area.soil_ph != null ? `pH ${area.soil_ph}` : null,
                              area.soil_temperature_c != null ? `${area.soil_temperature_c}°C` : null,
                            ].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ background: C.offwhite, borderRadius: 8, padding: "3px 10px", fontSize: 11, color: C.forest, fontWeight: 600 }}>
                          {areaCrops.length} crop{areaCrops.length !== 1 ? "s" : ""}
                        </span>
                        <button onClick={() => onNavigateAdd({ area_id: area.id })}
                          style={{ background: "none", border: `1px solid ${C.forest}`, borderRadius: 8, padding: "3px 10px", fontSize: 11, color: C.forest, fontWeight: 600, cursor: "pointer" }}>
                          + Add
                        </button>
                        <button onClick={() => setLogScope({ type: "area", id: area.id, name: area.name })}
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 10px", fontSize: 11, color: C.stone, cursor: "pointer" }}>
                          📋 Log
                        </button>
                        <button onClick={() => { setEditingArea(area.id); setEditAreaForm({ name: area.name, type: area.type, width_m: area.width_m ?? "", length_m: area.length_m ?? "", soil_ph: area.soil_ph ?? "", soil_temperature_c: area.soil_temperature_c ?? "" }); }}
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 10px", fontSize: 11, color: C.stone, cursor: "pointer" }}>
                          Edit
                        </button>
                        <button onClick={() => setConfirmArea(area.id)}
                          style={{ background: "none", border: `1px solid ${C.red}22`, borderRadius: 8, padding: "3px 8px", fontSize: 11, color: C.red, cursor: "pointer" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                    {areaCrops.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {areaCrops.map(c => {
                          const isPlanned  = c.status === "planned";
                          const isIndoors  = c.status === "sown_indoors";
                          const chipBg     = isPlanned ? "#fff8ed" : isIndoors ? "#f0f4ff" : C.offwhite;
                          const chipBorder = isPlanned ? C.amber : isIndoors ? "#7b9ef7" : C.border;
                          const chipColor  = isPlanned ? C.amber  : isIndoors ? "#2d4fc0" : "#1a1a1a";
                          const statusIcon = isPlanned ? "🗓 " : isIndoors ? "🪟 " : "";
                          return (
                            <span key={c.id} onClick={() => setTimelineCrop(c)}
                              style={{ background: chipBg, border: `1px solid ${chipBorder}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 500, color: chipColor, cursor: "pointer" }}>
                              {statusIcon}{c.name}{varietyName(c.variety) ? ` · ${varietyName(c.variety)}` : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {areaCrops.length === 0 && (
                      <div style={{ fontSize: 12, color: C.stone, fontStyle: "italic", marginTop: 4 }}>Empty</div>
                    )}
                    <button onClick={() => setSuggestArea(area)}
                      style={{ marginTop: 8, width: "100%", padding: "9px", borderRadius: 10, border: "1px solid " + C.forest, background: "transparent", color: C.forest, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      🌱 Boost this area
                    </button>
                  </>
                )}
              </div>
            );
          })}
          </div>)}
        </div>
      ))}
    {timelineCrop && <CropTimelineSheet crop={timelineCrop} onClose={() => { setTimelineCrop(null); load(); }} onCropUpdated={async () => { await load(); }} />}
    </div>
  );
}

// ── Crops list ────────────────────────────────────────────────────────────────
// ── Crop Growth Diary ────────────────────────────────────────────────────────

function CropGrowthDiary({ crop, onClose }) {
  const [photos,   setPhotos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [uploading,setUploading]= useState(false);
  const [caption,  setCaption]  = useState("");
  const [lightbox, setLightbox] = useState(null); // photo url to show full screen

  useEffect(() => { loadPhotos(); }, []);

  const loadPhotos = async () => {
    try {
      const data = await apiFetch(`/crops/${crop.id}/photos`);
      setPhotos(data);
    } catch (e) {}
    setLoading(false);
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const bitmap = await createImageBitmap(file);
      const maxDim = 1200;
      const scale  = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(bitmap.width  * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
      await apiFetch(`/crops/${crop.id}/photos`, {
        method: "POST",
        body: JSON.stringify({ base64, caption: caption.trim() || null }),
      });
      setCaption("");
      await loadPhotos();
    } catch (e) { console.error(e); }
    setUploading(false);
  };

  const deletePhoto = async (photoId) => {
    if (!confirm("Remove this photo?")) return;
    try {
      await apiFetch(`/crops/${crop.id}/photos/${photoId}`, { method: "DELETE" });
      setPhotos(p => p.filter(x => x.id !== photoId));
    } catch (e) {}
  };

  return (
    <>
    {/* Lightbox */}
    {lightbox && (
      <div onClick={() => setLightbox(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, objectFit: "contain" }} />
        <button onClick={() => setLightbox(null)}
          style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: 24, width: 40, height: 40, borderRadius: "50%", cursor: "pointer" }}>×</button>
      </div>
    )}

    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "24px 20px 48px", width: "100%", maxWidth: 440, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>
              {getCropEmoji(crop.name)} {crop.name} — Growth Diary
            </div>
            <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>{photos.length} photo{photos.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.stone }}>×</button>
        </div>

        {/* Add photo */}
        <div style={{ marginBottom: 20 }}>
          <input value={caption} onChange={e => setCaption(e.target.value)}
            placeholder="Add a caption (optional)" style={{ ...inputStyle, marginBottom: 8 }} />
          <label htmlFor="crop-diary-photo"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: uploading ? C.offwhite : C.forest, color: uploading ? C.stone : "#fff", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14, cursor: uploading ? "default" : "pointer", fontFamily: "serif" }}>
            {uploading ? "Uploading…" : "📷 Add photo"}
          </label>
          <input id="crop-diary-photo" type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} disabled={uploading} />
        </div>

        {/* Photos grid */}
        {loading ? <Spinner /> : photos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: C.stone }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 14 }}>No photos yet — document your crop's progress!</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {photos.map(p => (
              <div key={p.id} style={{ position: "relative" }}>
                <img src={p.photo_url} alt={p.caption || ""} onClick={() => setLightbox(p.photo_url)}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, cursor: "pointer", display: "block" }} />
                <button onClick={() => deletePhoto(p.id)}
                  style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", width: 22, height: 22, borderRadius: "50%", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                {p.caption && (
                  <div style={{ fontSize: 11, color: C.stone, marginTop: 4, lineHeight: 1.3 }}>{p.caption}</div>
                )}
                <div style={{ fontSize: 10, color: C.stone, marginTop: 2 }}>
                  {new Date(p.taken_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ── Crop Timeline Sheet ───────────────────────────────────────────────────────

function CropTimelineSheet({ crop, onClose, onCropUpdated }) {
  const [timeline,      setTimeline]      = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [adjusting,     setAdjusting]     = useState(false);
  const [adjustMode,    setAdjustMode]    = useState("stage");
  const [selected,      setSelected]      = useState(null);
  const [dateInput,     setDateInput]     = useState("");
  const [daysInput,     setDaysInput]     = useState("");
  const [confirmed,     setConfirmed]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [showLogAction, setShowLogAction] = useState(false);

  useEffect(() => {
    apiFetch(`/crops/${crop.id}`)
      .then(d => { setTimeline(d.timeline); setLoading(false); })
      .catch(() => setLoading(false));
  }, [crop.id]);

  const STAGES = [
    { key: "seed",       label: "Seed",      emoji: "🌰", symptom: null },
    { key: "seedling",   label: "Seedling",  emoji: "🌱", symptom: "seedling_emerged" },
    { key: "vegetative", label: "Veg",       emoji: "🍃", symptom: "vegetative_confirmed" },
    { key: "flowering",  label: "Flower",    emoji: "🌸", symptom: "flowering_confirmed" },
    { key: "fruiting",   label: "Fruiting",  emoji: "🍅", symptom: "fruit_set_confirmed" },
    { key: "harvesting", label: "Harvest",   emoji: "🧺", symptom: "harvest_started" },
  ];

  const stageActions = {
    seed:       ["Keep at 20-25°C for germination", "Keep compost moist but not soggy", "Expect shoots in 7-14 days"],
    seedling:   ["Pot on when first true leaves appear", "Keep on a warm sunny windowsill", "Water from below to avoid damping off"],
    vegetative: ["Pot on to final container if needed", "Begin fortnightly balanced feed", "Ensure good light and airflow"],
    flowering:  ["Tap stems gently to aid pollination", "Switch to high potash feed", "Remove lower leaves for airflow"],
    fruiting:   ["Feed weekly with high potash", "Water consistently to avoid blossom end rot", "Check regularly for pests and blight"],
    harvesting: ["Pick when fully coloured and slightly soft", "Harvest regularly to encourage more fruit", "Pick before first frost — green fruit ripens indoors"],
  };

  const calcOffsetFromHarvestDate = (targetDateStr) => {
    const rawSowDate = crop.sown_date || crop.transplanted_date;
    if (!rawSowDate) return 0;
    const dtm = crop.crop_def?.days_to_maturity_max || crop.crop_def?.days_to_maturity_min || 90;
    const targetMs = new Date(targetDateStr).getTime();
    const rawSowMs = new Date(rawSowDate).getTime();
    return Math.round((targetMs - rawSowMs) / 86400000) - dtm;
  };

  const confirmStage = async (stageKey) => {
    const stage = STAGES.find(s => s.key === stageKey);
    setSaving(true);
    try {
      let timelineOffsetDays = 0;
      const sowDateRaw = crop.sown_date || crop.transplanted_date;
      if (sowDateRaw) {
        const dtm = crop.crop_def?.days_to_maturity_max || crop.crop_def?.days_to_maturity_min || 90;
        const STAGE_PCT = { seed: 0, seedling: 0.08, vegetative: 0.25, flowering: 0.55, fruiting: 0.70, harvesting: 0.90 };
        const realDaysSown = Math.floor((Date.now() - new Date(sowDateRaw).getTime()) / 86400000);
        timelineOffsetDays = realDaysSown - Math.round((STAGE_PCT[stageKey] || 0) * dtm);
      }
      await apiFetch(`/crops/${crop.id}/observe`, {
        method: "POST",
        body: JSON.stringify({ observation_type: "stage", symptom_code: stage?.symptom || null, confirmed_stage: stageKey, timeline_offset_days: timelineOffsetDays }),
      });
      const updated = await apiFetch(`/crops/${crop.id}`);
      if (updated?.timeline) setTimeline(updated.timeline);
      setConfirmed(true);
      if (onCropUpdated) await onCropUpdated();
      setTimeout(() => onClose(), 2500);
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const confirmHarvestDate = async () => {
    if (!dateInput) return;
    setSaving(true);
    try {
      const timelineOffsetDays = calcOffsetFromHarvestDate(dateInput);
      await apiFetch(`/crops/${crop.id}/observe`, {
        method: "POST",
        body: JSON.stringify({ observation_type: "timeline", timeline_offset_days: timelineOffsetDays }),
      });
      const updated = await apiFetch(`/crops/${crop.id}`);
      if (updated?.timeline) setTimeline(updated.timeline);
      setConfirmed(true);
      if (onCropUpdated) await onCropUpdated();
      setTimeout(() => onClose(), 2500);
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const confirmDaysOffset = async () => {
    const days = parseInt(daysInput, 10);
    if (isNaN(days)) return;
    setSaving(true);
    try {
      await apiFetch(`/crops/${crop.id}/observe`, {
        method: "POST",
        body: JSON.stringify({ observation_type: "timeline", timeline_offset_days: days }),
      });
      const updated = await apiFetch(`/crops/${crop.id}`);
      if (updated?.timeline) setTimeline(updated.timeline);
      setConfirmed(true);
      if (onCropUpdated) await onCropUpdated();
      setTimeout(() => onClose(), 2500);
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const resetOffset = async () => {
    setSaving(true);
    try {
      await apiFetch(`/crops/${crop.id}/observe`, {
        method: "POST",
        body: JSON.stringify({ observation_type: "timeline", timeline_offset_days: 0 }),
      });
      const updated = await apiFetch(`/crops/${crop.id}`);
      if (updated?.timeline) setTimeline(updated.timeline);
      setConfirmed(true);
      if (onCropUpdated) await onCropUpdated();
      setTimeout(() => onClose(), 2500);
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const currentStageKey = timeline?.nodes?.find(n => n.status === "current")?.key
    || timeline?.nodes?.find(n => n.status === "upcoming")?.key
    || "seed";

  const sowDate      = crop.sown_date || crop.transplanted_date;
  const harvestNode  = timeline?.nodes?.find(n => n.key === "harvesting" || n.key === "harvest");
  const stageIdx     = STAGES.findIndex(s => s.key === currentStageKey);
  const progressPct  = timeline?.progress_pct ?? Math.round(((stageIdx + 0.5) / STAGES.length) * 100);
  const currentOffset = crop.timeline_offset_days || 0;
  const daysSown = sowDate ? Math.floor((Date.now() - new Date(sowDate).getTime()) / 86400000) : null;
  const journeyNodes = timeline?.nodes?.filter(n => n.status === "completed" || n.status === "current") || [];

  const openAdjustMode = (mode) => {
    setAdjustMode(mode);
    setAdjusting(true);
    setSelected(null);
    if (mode === "date" && timeline?.harvest_date_iso) setDateInput(timeline.harvest_date_iso);
    if (mode === "days") setDaysInput(String(currentOffset));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "94vh", overflowY: "auto" }}>

        <div style={{ background: C.forest, padding: "16px 18px 18px", position: "relative", borderRadius: "20px 20px 0 0" }}>
          <button onClick={onClose}
            style={{ position: "absolute", top: 12, right: 14, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
            x
          </button>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>
            {crop.name}{crop.variety ? ` — ${typeof crop.variety === "object" ? crop.variety.name : crop.variety}` : ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.leaf, flexShrink: 0 }} />
            <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", fontFamily: "serif" }}>
              {STAGES.find(s => s.key === currentStageKey)?.label || "Growing"} now
            </div>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            {harvestNode?.formatted_date ? `Harvest expected ${harvestNode.formatted_date}` : "Tracking your crop's journey"}
            {currentOffset !== 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                adjusted {currentOffset > 0 ? "+" + currentOffset : currentOffset}d
              </span>
            )}
          </div>
        </div>

        {loading && <div style={{ textAlign: "center", padding: "40px 0" }}><Spinner /></div>}

        {!loading && confirmed && (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 26 }}>checkmark</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 8 }}>Timeline updated</div>
            <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.6, marginBottom: harvestNode ? 16 : 24 }}>Your task plan and harvest forecast have been updated.</div>
            {harvestNode?.formatted_date && (
              <div style={{ background: "#EAF3DE", borderRadius: 10, padding: "12px 16px", marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: "#3B6D11", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Harvest now expected</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#3B6D11" }}>{harvestNode.formatted_date}</div>
              </div>
            )}
            <button onClick={onClose}
              style={{ width: "100%", background: C.forest, border: "none", borderRadius: 12, padding: 14, fontSize: 14, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
              Done
            </button>
          </div>
        )}

        {!loading && !confirmed && timeline && (() => {
          const actions = stageActions[currentStageKey] || [];
          return (
            <div style={{ padding: "16px 16px 40px" }}>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: C.stone }}>{sowDate ? new Date(sowDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Sow date unknown"}</span>
                  <span style={{ fontSize: 10, color: C.stone }}>{harvestNode?.formatted_date || "Harvest"}</span>
                </div>
                <div style={{ position: "relative", height: 8, background: C.offwhite, borderRadius: 99, border: "1px solid " + C.border }}>
                  <div style={{ position: "absolute", left: 0, width: progressPct + "%", height: "100%", background: C.forest, borderRadius: 99 }} />
                  <div style={{ position: "absolute", left: progressPct + "%", top: "50%", transform: "translate(-50%,-50%)", width: 18, height: 18, background: C.forest, border: "3px solid #fff", borderRadius: "50%", boxShadow: "0 0 0 2px " + C.forest }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: C.stone }}>Sown</span>
                  <span style={{ fontSize: 10, color: C.stone }}>Harvest</span>
                </div>
              </div>

              {adjusting ? (
                <div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                    {[
                      { key: "stage", label: "By stage" },
                      { key: "date",  label: "By harvest date" },
                      { key: "days",  label: "By days" },
                    ].map(tab => (
                      <button key={tab.key} onClick={() => {
                        setAdjustMode(tab.key);
                        setSelected(null);
                        if (tab.key === "date" && timeline?.harvest_date_iso) setDateInput(timeline.harvest_date_iso);
                        if (tab.key === "days") setDaysInput(String(currentOffset));
                      }}
                        style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid " + (adjustMode === tab.key ? C.forest : C.border), background: adjustMode === tab.key ? C.forest : "transparent", color: adjustMode === tab.key ? "#fff" : C.stone, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {adjustMode === "stage" && (
                    <div>
                      <div style={{ fontSize: 12, color: C.stone, marginBottom: 4 }}>Tap the stage your plant is actually at:</div>
                      <div style={{ fontSize: 11, color: C.stone, marginBottom: 12, fontStyle: "italic" }}>Running behind? Move it back. Further ahead? Move it forward.</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", border: "1px solid " + C.border, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                        {STAGES.map((s, i) => {
                          const idx = STAGES.findIndex(st => st.key === currentStageKey);
                          const isCurr = i === idx;
                          const isPast = i < idx;
                          return (
                            <div key={s.key}
                              style={{ padding: "10px 3px", textAlign: "center", borderRight: i < 5 ? "1px solid " + C.border : "none", background: isCurr ? C.forest : selected === s.key ? "#EAF3DE" : "transparent", cursor: !isCurr ? "pointer" : "default", opacity: isCurr ? 0.35 : 1, outline: selected === s.key ? "2px solid " + C.forest : "none" }}
                              onClick={!isCurr ? () => setSelected(s.key) : undefined}>
                              <div style={{ fontSize: 16, marginBottom: 2 }}>{s.emoji}</div>
                              <div style={{ fontSize: 9, color: isCurr ? "rgba(255,255,255,0.95)" : C.stone, fontWeight: isCurr ? 700 : 400, lineHeight: 1.2 }}>{s.label}</div>
                              <div style={{ fontSize: 9, color: isCurr ? "rgba(255,255,255,0.6)" : C.stone, marginTop: 1 }}>
                                {isCurr ? "Now" : isPast ? "behind" : "ahead"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { if (selected) confirmStage(selected); }} disabled={!selected || saving}
                          style={{ flex: 1, background: selected ? C.forest : C.border, border: "none", borderRadius: 12, padding: 12, fontSize: 13, color: "#fff", fontWeight: 700, cursor: selected ? "pointer" : "default", fontFamily: "serif" }}>
                          {saving ? "Saving..." : "Confirm stage"}
                        </button>
                        <button onClick={() => { setAdjusting(false); setSelected(null); }}
                          style={{ flex: 1, background: "none", border: "1px solid " + C.border, borderRadius: 12, padding: 12, fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {adjustMode === "date" && (
                    <div>
                      <div style={{ fontSize: 12, color: C.stone, marginBottom: 4 }}>When do you expect to harvest?</div>
                      <div style={{ fontSize: 11, color: C.stone, marginBottom: 12, fontStyle: "italic" }}>We will work backwards to adjust your timeline.</div>
                      <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 12 }} />
                      {dateInput && (
                        <div style={{ background: "#EAF3DE", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#2D5016" }}>
                          {(() => {
                            const newOffset = calcOffsetFromHarvestDate(dateInput);
                            if (newOffset === 0) return "No change from original schedule";
                            if (newOffset > 0) return newOffset + " days behind original schedule";
                            return Math.abs(newOffset) + " days ahead of original schedule";
                          })()}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={confirmHarvestDate} disabled={!dateInput || saving}
                          style={{ flex: 1, background: dateInput ? C.forest : C.border, border: "none", borderRadius: 12, padding: 12, fontSize: 13, color: "#fff", fontWeight: 700, cursor: dateInput ? "pointer" : "default", fontFamily: "serif" }}>
                          {saving ? "Saving..." : "Update harvest date"}
                        </button>
                        <button onClick={() => setAdjusting(false)}
                          style={{ flex: 1, background: "none", border: "1px solid " + C.border, borderRadius: 12, padding: 12, fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {adjustMode === "days" && (
                    <div>
                      <div style={{ fontSize: 12, color: C.stone, marginBottom: 4 }}>How many days off schedule?</div>
                      <div style={{ fontSize: 11, color: C.stone, marginBottom: 12, fontStyle: "italic" }}>Positive = behind schedule. Negative = ahead.</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <button onClick={() => setDaysInput(d => String((parseInt(d, 10) || 0) - 7))}
                          style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid " + C.border, background: C.offwhite, fontSize: 18, cursor: "pointer", fontWeight: 700, color: C.forest, flexShrink: 0 }}>-</button>
                        <input type="number" value={daysInput} onChange={e => setDaysInput(e.target.value)}
                          style={{ ...inputStyle, textAlign: "center", flex: 1 }} inputMode="numeric" />
                        <button onClick={() => setDaysInput(d => String((parseInt(d, 10) || 0) + 7))}
                          style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid " + C.border, background: C.offwhite, fontSize: 18, cursor: "pointer", fontWeight: 700, color: C.forest, flexShrink: 0 }}>+</button>
                      </div>
                      <div style={{ fontSize: 11, color: C.stone, marginBottom: 12, textAlign: "center" }}>
                        {parseInt(daysInput, 10) === 0 ? "No adjustment" : parseInt(daysInput, 10) > 0 ? daysInput + " days behind — harvest later" : Math.abs(parseInt(daysInput, 10)) + " days ahead — harvest sooner"}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={confirmDaysOffset} disabled={saving}
                          style={{ flex: 1, background: C.forest, border: "none", borderRadius: 12, padding: 12, fontSize: 13, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
                          {saving ? "Saving..." : "Apply adjustment"}
                        </button>
                        <button onClick={() => setAdjusting(false)}
                          style={{ flex: 1, background: "none", border: "1px solid " + C.border, borderRadius: 12, padding: 12, fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {currentOffset !== 0 && (
                    <button onClick={resetOffset} disabled={saving}
                      style={{ width: "100%", marginTop: 10, background: "none", border: "1px solid " + C.border, borderRadius: 12, padding: "9px 12px", fontSize: 12, color: C.stone, cursor: "pointer" }}>
                      Reset to original schedule
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", border: "1px solid " + C.border, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                    {STAGES.map((s, i) => {
                      const idx = STAGES.findIndex(st => st.key === currentStageKey);
                      const isCurr = i === idx;
                      const isFuture = i > idx;
                      return (
                        <div key={s.key} style={{ padding: "10px 3px", textAlign: "center", borderRight: i < 5 ? "1px solid " + C.border : "none", background: isCurr ? C.forest : "transparent", opacity: isFuture ? 0.35 : 1 }}>
                          <div style={{ fontSize: 16, marginBottom: 2 }}>{s.emoji}</div>
                          <div style={{ fontSize: 9, color: isCurr ? "rgba(255,255,255,0.95)" : C.stone, fontWeight: isCurr ? 700 : 400, lineHeight: 1.2 }}>{s.label}</div>
                          <div style={{ fontSize: 9, color: isCurr ? "rgba(255,255,255,0.6)" : C.stone, marginTop: 1 }}>{isCurr ? "Now" : i < idx ? "Done" : ""}</div>
                        </div>
                      );
                    })}
                  </div>

                  {actions.length > 0 && (
                    <div style={{ background: "#EAF3DE", borderRadius: 12, padding: "13px 14px", marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#3B6D11", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>What to do right now</div>
                      {actions.map((a, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: i < actions.length - 1 ? 6 : 0 }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#3B6D11", flexShrink: 0, marginTop: 5 }} />
                          <div style={{ fontSize: 12, color: "#27500A", lineHeight: 1.4 }}>{a}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                    <div style={{ background: C.offwhite, borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Next milestone</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{STAGES[stageIdx + 1]?.label || "Harvest"}</div>
                      <div style={{ fontSize: 11, color: C.stone }}>{harvestNode?.formatted_date ? "By " + harvestNode.formatted_date : "Coming up"}</div>
                    </div>
                    <div style={{ background: C.offwhite, borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>Growing for</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{daysSown !== null ? daysSown + " days" : "—"}</div>
                      <div style={{ fontSize: 11, color: C.stone }}>{sowDate ? "since " + new Date(sowDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "add a sow date"}</div>
                    </div>
                  </div>

                  {journeyNodes.length > 0 && (
                    <div style={{ border: "1px solid " + C.border, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Your journey so far</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {journeyNodes.map((n, i) => (
                          <div key={n.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", background: n.status === "current" ? C.leaf : C.forest, flexShrink: 0 }} />
                            <div style={{ fontSize: 12, color: C.stone }}>
                              {n.label}
                              {n.formatted_date && <span style={{ color: "#1a1a1a", fontWeight: 600, marginLeft: 6 }}>{n.formatted_date}</span>}
                              {n.status === "current" && <span style={{ color: C.leaf, fontWeight: 600, marginLeft: 6 }}>now</span>}
                            </div>
                          </div>
                        ))}
                        {harvestNode && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid " + C.border, flexShrink: 0 }} />
                            <div style={{ fontSize: 12, color: C.stone }}>Harvest expected<span style={{ color: C.stone, fontWeight: 600, marginLeft: 6 }}>{harvestNode.formatted_date}</span></div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid " + C.border, paddingTop: 14 }}>
                    <div style={{ fontSize: 10, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Is this timeline right for your plant?</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => confirmStage(currentStageKey)} disabled={saving}
                        style={{ flex: 1, background: C.forest, border: "none", borderRadius: 12, padding: 12, fontSize: 13, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
                        {saving ? "Saving..." : "Yes — looks right"}
                      </button>
                      <button onClick={() => openAdjustMode("stage")}
                        style={{ flex: 1, background: "none", border: "1px solid " + C.border, borderRadius: 12, padding: 12, fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>
                        No — adjust
                      </button>
                    </div>
                    <button onClick={() => setShowLogAction(true)}
                      style={{ width: "100%", marginTop: 10, background: "none", border: "1px solid " + C.border, borderRadius: 12, padding: "10px 12px", fontSize: 13, color: C.stone, cursor: "pointer", textAlign: "center" }}>
                      + Log something you did
                    </button>
                  </div>
                </div>
              )}

            </div>
          );
        })()}

        {!loading && !confirmed && !timeline && (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>plant</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 8 }}>Timeline not available</div>
            <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.6 }}>Add a sow date to unlock your crop growth timeline.</div>
          </div>
        )}

        {showLogAction && (
          <LogActionSheet
            scope={{ type: "crop", id: crop.id, name: crop.name }}
            onClose={() => setShowLogAction(false)}
            onLogged={() => { setShowLogAction(false); if (onCropUpdated) onCropUpdated(); }}
          />
        )}

      </div>
    </div>
  );
}

// ── Log activity sheet ────────────────────────────────────────────────────────
// Reusable bottom sheet for logging manual garden activity.
// Props:
//   scope      — { type: 'crop'|'area'|'location', id, name } | null
//                null = Today entry point, user chooses scope from their locations/areas
//   onClose    — called on dismiss
//   onLogged   — called after successful save (triggers parent refresh)
//   conflictTaskType — optional string, hides conflicting action buttons (e.g. "feed")
function LogActionSheet({ scope, onClose, onLogged, conflictTaskType,
  // Legacy prop support — old callers pass { crop } object
  crop }) {

  // Normalise legacy crop prop
  const resolvedScope = scope || (crop ? { type: "crop", id: crop.id, name: crop.name } : null);
  const resolvedConflict = conflictTaskType || crop?.task_type || null;

  const [saving,      setSaving]      = useState(false);
  const [done,        setDone]        = useState(null);
  const [otherLabel,  setOtherLabel]  = useState("");
  const [notes,       setNotes]       = useState("");
  const [showOther,   setShowOther]   = useState(false);
  const [dateChoice,  setDateChoice]  = useState("today"); // "today"|"yesterday"|"custom"
  const [customDate,  setCustomDate]  = useState(() => new Date().toISOString().split("T")[0]);

  const todayISO     = new Date().toISOString().split("T")[0];
  const yesterdayISO = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const performedAt = dateChoice === "today"     ? new Date().toISOString()
                    : dateChoice === "yesterday" ? new Date(yesterdayISO + "T12:00:00").toISOString()
                    : new Date(customDate + "T12:00:00").toISOString();

  // Actions vary by scope type — feed is crop-only
  const ALL_ACTIONS = [
    { type: "watered",        emoji: "💧", label: "Watered",         desc: "Update watering schedule",         scopes: ["crop","area","location"], conflicts: ["water"] },
    { type: "fed",            emoji: "🌿", label: "Fed",             desc: "Reset feeding schedule from today", scopes: ["crop"],                   conflicts: ["feed"] },
    { type: "pruned_mulched", emoji: "✂️",  label: "Pruned / mulched", desc: "Log pruning or mulching",          scopes: ["crop","area","location"], conflicts: ["prune","mulch"] },
    { type: "weeded",         emoji: "🌱", label: "Weeded",          desc: "Log weeding",                       scopes: ["crop","area","location"], conflicts: [] },
    { type: "other",          emoji: "📝", label: "Other",           desc: "Record something else",             scopes: ["crop","area","location"], conflicts: [] },
  ];

  const scopeType = resolvedScope?.type || "crop";
  const ACTIONS = ALL_ACTIONS
    .filter(a => a.scopes.includes(scopeType))
    .filter(a => !a.conflicts.includes(resolvedConflict));

  const logAction = async (actionType) => {
    if (saving) return;
    if (actionType === "other" && !otherLabel.trim()) return;
    setSaving(true);
    try {
      let result;
      if (scopeType === "crop") {
        // Use existing crop endpoint for crop scope (backward compat)
        result = await apiFetch(`/crops/${resolvedScope.id}/log-action`, {
          method: "POST",
          body: JSON.stringify({
            action_type:  actionType,
            notes:        notes || null,
            custom_label: actionType === "other" ? otherLabel.trim() : null,
            performed_at: performedAt,
          }),
        });
      } else {
        // Use generic endpoint for area/location scope
        result = await apiFetch("/activity/log", {
          method: "POST",
          body: JSON.stringify({
            activity_type: actionType,
            scope_type:    scopeType,
            scope_id:      resolvedScope.id,
            notes:         notes || null,
            custom_label:  actionType === "other" ? otherLabel.trim() : null,
            performed_at:  performedAt,
          }),
        });
      }
      const hint = result?.next_action_hint || null;
      setDone({ action_type: actionType, hint });
      setTimeout(() => onLogged(), 2000);
    } catch(e) {
      console.error("[LogAction] failed:", e);
      setSaving(false);
      // Show error inline so user knows it failed
      setDone({ action_type: actionType, hint: "Something went wrong — please try again", error: true });
      setTimeout(() => { setDone(null); }, 3000);
    }
  };

  const scopeLabel = resolvedScope?.name || "garden";
  const actionDefs = { watered: "💧", fed: "🌿", pruned_mulched: "✂️", weeded: "🌱", other: "📝" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", padding: "20px 20px 36px", maxHeight: "90vh", overflowY: "auto" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{actionDefs[done.action_type] || "✓"}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 6 }}>Logged</div>
            {done.hint && <div style={{ fontSize: 13, color: C.stone }}>{done.hint}</div>}
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Log activity</div>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.stone }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: C.stone, marginBottom: 16 }}>
              {scopeType === "crop"     && `For: ${scopeLabel}`}
              {scopeType === "area"     && `Area: ${scopeLabel}`}
              {scopeType === "location" && `Location: ${scopeLabel}`}
            </div>

            {/* Date selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {[["today","Today"],["yesterday","Yesterday"],["custom","Choose date"]].map(([val, lbl]) => (
                <button key={val} onClick={() => setDateChoice(val)}
                  style={{ flex: 1, padding: "7px 4px", fontSize: 12, fontWeight: dateChoice === val ? 700 : 400,
                    background: dateChoice === val ? C.forest : C.offwhite,
                    color: dateChoice === val ? "#fff" : C.stone,
                    border: `1px solid ${dateChoice === val ? C.forest : C.border}`,
                    borderRadius: 8, cursor: "pointer" }}>
                  {lbl}
                </button>
              ))}
            </div>
            {dateChoice === "custom" && (
              <input type="date" value={customDate} max={todayISO}
                onChange={e => setCustomDate(e.target.value)}
                style={{ ...inputStyle, marginBottom: 14 }} />
            )}

            {/* Activity buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {ACTIONS.map(a => (
                <button key={a.type}
                  onClick={() => { if (a.type === "other") { setShowOther(true); return; } logAction(a.type); }}
                  disabled={saving}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: C.offwhite, border: `1px solid ${C.border}`, borderRadius: 12, cursor: saving ? "default" : "pointer", textAlign: "left", width: "100%" }}>
                  <div style={{ fontSize: 20, width: 28, flexShrink: 0 }}>{a.emoji}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: C.stone }}>{a.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Other expanded form */}
            {showOther && (
              <div style={{ marginTop: 4, padding: "14px", background: C.offwhite, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>What did you do?</div>
                <input type="text" value={otherLabel} onChange={e => setOtherLabel(e.target.value)}
                  placeholder="e.g. Applied copper fungicide, staked tomatoes…"
                  style={{ ...inputStyle, marginBottom: 8 }}
                  autoFocus />
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  style={{ ...inputStyle, height: 64, resize: "none", marginBottom: 10 }} />
                <button onClick={() => logAction("other")} disabled={saving || !otherLabel.trim()}
                  style={{ width: "100%", background: otherLabel.trim() ? C.forest : C.border, border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 700, color: "#fff", cursor: otherLabel.trim() ? "pointer" : "default", fontFamily: "serif" }}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CropList({ onAddCrop, editCropId, editCropField, onEditOpened, isDemo = false, navEnabled = false }) {
  const CROPS_CACHE = "vercro_crops_v1";
  const _cachedCrops = (() => { try { const c = localStorage.getItem(CROPS_CACHE); if (c) { const { cropsData, areasData, ts } = JSON.parse(c); if (Date.now() - ts < 5 * 60 * 1000) return { cropsData, areasData }; } } catch(e) {} return null; })();
  const [crops,    setCrops]   = useState(_cachedCrops?.cropsData || []);
  const [loading,  setLoading] = useState(!_cachedCrops);
  const [error,    setError]   = useState(null);
  const [editing,       setEditing]      = useState(null);

  // Succession group state
  const [successionGroups,   setSuccessionGroups]   = useState([]);
  const [addingSowingFor,    setAddingSowingFor]    = useState(null); // group id
  const [newSowingForm,      setNewSowingForm]      = useState({ sown_date: "", status: "growing" });
  const [expandedGroups,     setExpandedGroups]     = useState({});
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);

  // Auto-open edit for a specific crop (from QuickCropCheck)
  useEffect(() => {
    if (editCropId && crops.length > 0) {
      const crop = crops.find(c => c.id === editCropId);
      if (crop) {
        startEdit(crop);
        if (onEditOpened) onEditOpened();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [editCropId, crops.length]);
  const [editForm,      setEditForm]      = useState({});
  const [editVarieties, setEditVarieties] = useState([]);
  const [areas,         setAreas]         = useState([]);
  const [saving,        setSaving]        = useState(false);
  const [confirm,       setConfirm]       = useState(null);
  const [diary,         setDiary]         = useState(null);  // crop to show diary for
  const [timelineCrop,  setTimelineCrop]  = useState(null);  // crop to show timeline for
  const [cropPhotos,    setCropPhotos]    = useState({});    // cropId → latest photo_url
  const [filterStatus,  setFilterStatus]  = useState("");    // "" | "growing" | "planned" | "sown_indoors" | "harvested"
  const [filterArea,    setFilterArea]    = useState("");    // "" | area id
  const [filterType,    setFilterType]    = useState("");    // "" | "veg" | "fruit" | "herb"
  const [sortBy,        setSortBy]        = useState("recent"); // "recent" | "alpha" | "pct"
  const [showFilters,   setShowFilters]   = useState(false);
  const [cropPlantCheck, setCropPlantCheck] = useState(null); // crop object when Plant Check opened from crop card
  const plantCheckEnabled = usePlantCheckEnabled();
  const [cropTab, setCropTab] = useState("crops"); // "crops" | "feeds" — toggle inside Crops tab

  const load = useCallback(async () => {
    // Fetch fresh
    try {
      const [cropsData, areasData, groupsData] = await Promise.all([
        apiFetch("/crops"),
        apiFetch("/areas"),
        apiFetch("/succession-groups"),
      ]);
      setCrops(cropsData); setAreas(areasData); setSuccessionGroups(groupsData || []);
      try { localStorage.setItem(CROPS_CACHE, JSON.stringify({ cropsData, areasData, ts: Date.now() })); } catch(e) {}
      // Load photos in background — non-blocking
      const photoMap = {};
      Promise.allSettled(cropsData.map(async crop => {
        try {
          const photos = await apiFetch(`/crops/${crop.id}/photos`);
          if (Array.isArray(photos) && photos.length > 0) photoMap[crop.id] = photos[0].photo_url;
        } catch {}
      })).then(() => setCropPhotos({...photoMap})).catch(() => {});
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = async (crop) => {
    setEditing(crop.id);
    setEditForm({
      variety_id:  crop.variety_id || "",
      variety:     varietyName(crop.variety) || "",
      sown_date:   crop.sown_date || "",
      area_id:     crop.area_id || "",
      notes:       crop.notes || "",
      status:      crop.status || "growing",
      grown_from:     crop.grown_from || "",
      lifecycle_mode: crop.lifecycle_mode || "seasonal",
    });
    if (crop.crop_def_id) {
      try {
        const vars = await apiFetch(`/varieties?crop_def_id=${crop.crop_def_id}`);
        setEditVarieties(vars);
      } catch { setEditVarieties([]); }
    } else {
      setEditVarieties([]);
    }
  };

  const saveEdit = async (cropId) => {
    setSaving(true);
    try {
      const isOther = editForm.variety_id === "__other__";
      await apiFetch(`/crops/${cropId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editForm,
          sown_date:     editForm.sown_date  || null,
          variety_id:    isOther ? null : (editForm.variety_id || null),
          variety:       isOther ? (editForm.variety || null) : (editVarieties.find(v => v.id === editForm.variety_id)?.name || editForm.variety || null),
          status:        editForm.status        || "growing",
          grown_from:    editForm.grown_from    || null,
          lifecycle_mode: editForm.lifecycle_mode || "seasonal",
        }),
      });
      setEditing(null);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteCrop = async (cropId) => {
    setSaving(true);
    try {
      await apiFetch(`/crops/${cropId}`, { method: "DELETE" });
      try { localStorage.removeItem("vercro_crops_v1"); localStorage.removeItem("vercro_garden_v1"); } catch(e) {}
      setConfirm(null);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteGroup = async (groupId) => {
    setSaving(true);
    try {
      await apiFetch(`/succession-groups/${groupId}`, { method: "DELETE" });
      setConfirmDeleteGroup(null);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const [convertingCrop, setConvertingCrop] = useState(null);
  const [convertForm,    setConvertForm]    = useState({ target_sowings: 3, interval_days: 14 });

  const convertToSuccession = async (cropId) => {
    setSaving(true);
    try {
      await apiFetch(`/crops/${cropId}/convert-to-succession`, {
        method: "POST",
        body: JSON.stringify({
          target_sowings: Number(convertForm.target_sowings) || 3,
          interval_days:  Number(convertForm.interval_days)  || 14,
        }),
      });
      setConvertingCrop(null);
      setConvertForm({ target_sowings: 3, interval_days: 14 });
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const addNextSowing = async (groupId) => {
    setSaving(true);
    try {
      await apiFetch(`/succession-groups/${groupId}/sowings`, {
        method: "POST",
        body: JSON.stringify(newSowingForm),
      });
      setAddingSowingFor(null);
      setNewSowingForm({ sown_date: "", status: "growing" });
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const STAGE_COLOR = { seed: C.stone, seedling: C.leaf, vegetative: C.forest, flowering: C.amber, fruiting: C.amber, harvesting: "#e08020", finished: C.stone };

  // Infer crop type from name for type filter
  const HERB_NAMES = ["basil","parsley","mint","thyme","rosemary","chive","chives","coriander","dill","sage","oregano","tarragon","bay","fennel"];
  const FRUIT_NAMES = ["tomato","strawberry","apple","pear","blueberry","raspberry","blackberry","grape","melon","watermelon","cucumber","courgette","zucchini","pumpkin","squash","pepper","chilli","chili","aubergine","eggplant","corn","sweetcorn"];
  const inferCropType = (name) => {
    if (!name) return "veg";
    const lower = name.toLowerCase();
    if (HERB_NAMES.some(h => lower.includes(h))) return "herb";
    if (FRUIT_NAMES.some(f => lower.includes(f))) return "fruit";
    return "veg";
  };

  // Succession group IDs with active sowings — exclude those crop instances from solo list
  const successionCropIds = new Set(
    successionGroups.flatMap(g => (g.sowings || []).map(s => s.id))
  );

  // Apply filters — exclude crops that belong to a succession group
  let visibleCrops = crops.filter(crop => {
    if (crop.succession_group_id) return false; // shown in grouped card instead
    if (filterStatus && crop.status !== filterStatus) return false;
    if (filterArea   && crop.area_id !== filterArea)  return false;
    if (filterType   && inferCropType(crop.name) !== filterType) return false;
    return true;
  });

  // Apply sort
  visibleCrops = [...visibleCrops].sort((a, b) => {
    if (sortBy === "alpha") return a.name.localeCompare(b.name);
    if (sortBy === "pct") {
      const getPct = (crop) => {
        if (crop.sown_date && crop.crop_def?.days_to_maturity_max) {
          const days = Math.floor((Date.now() - new Date(crop.sown_date)) / 86400000);
          return Math.min(100, Math.round((days / crop.crop_def.days_to_maturity_max) * 100));
        }
        const STAGES = ["seed","seedling","vegetative","flowering","fruiting","harvesting"];
        const idx = STAGES.indexOf(crop.stage || "seed");
        return idx < 0 ? 0 : Math.round(((idx + 1) / STAGES.length) * 100);
      };
      return getPct(b) - getPct(a);
    }
    return 0; // recent — preserve server order
  });

  const activeFilterCount = [filterStatus, filterArea, filterType].filter(Boolean).length;

  if (loading) return <Spinner />;
  if (error)   return <ErrorMsg msg={error} />;

  return (
    <div>
      {diary && <CropGrowthDiary crop={diary} onClose={() => { setDiary(null); load(); }} />}
      {timelineCrop && <CropTimelineSheet crop={timelineCrop} onClose={() => { setTimelineCrop(null); load(); }} onCropUpdated={async () => { await load(); }} />}
      {plantCheckEnabled && cropPlantCheck && (
        <PlantCheck
          entry="crop"
          prefillCrop={cropPlantCheck}
          onClose={() => setCropPlantCheck(null)}
          onDone={() => { setCropPlantCheck(null); load(); }}
        />
      )}
      {/* Crops / Feed toggle — only shown when nav is redesigned (Mark or PRO_ENABLED) */}
      {navEnabled && (
        <div style={{ display: "flex", background: C.offwhite, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {[["crops", "🌱 Crops"], ["feeds", "🧪 Feeds"]].map(([id, label]) => (
            <button key={id} onClick={() => setCropTab(id)}
              style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "none", background: cropTab === id ? C.forest : "transparent", color: cropTab === id ? "#fff" : C.stone, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "serif", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Feeds view — only when navEnabled and cropTab=feeds */}
      {navEnabled && cropTab === "feeds" && <FeedsScreen />}

      {/* Crops view — always shown when navEnabled=false, or when cropTab=crops */}
      {(!navEnabled || cropTab === "crops") && <>

      {/* Header + filter/sort controls */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>My Crops</div>
            <div style={{ fontSize: 13, color: C.stone, marginTop: 2 }}>{visibleCrops.length} of {crops.length} crop{crops.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onAddCrop()}
              style={{ background: C.forest, border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              + Add Crop
            </button>
            <button onClick={() => setShowFilters(v => !v)}
              style={{ background: activeFilterCount > 0 ? C.forest : C.offwhite, border: `1px solid ${activeFilterCount > 0 ? C.forest : C.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: activeFilterCount > 0 ? "#fff" : C.stone, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              ⚙ Filter & Sort{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
          </div>
        </div>
        {/* Filter/sort dropdown */}
        {showFilters && (
          <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Status filter */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Status</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["", "All"], ["growing", "Growing"], ["planned", "Planned"], ["sown_indoors", "Indoors"], ["harvested", "Harvested"]].map(([val, label]) => (
                  <button key={val} onClick={() => setFilterStatus(val)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${filterStatus === val ? C.forest : C.border}`, background: filterStatus === val ? C.forest : "transparent", color: filterStatus === val ? "#fff" : C.stone, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Type filter */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Type</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["", "All"], ["veg", "🥦 Veg"], ["fruit", "🍅 Fruit"], ["herb", "🌿 Herb"]].map(([val, label]) => (
                  <button key={val} onClick={() => setFilterType(val)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${filterType === val ? C.forest : C.border}`, background: filterType === val ? C.forest : "transparent", color: filterType === val ? "#fff" : C.stone, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Area filter */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Area</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setFilterArea("")}
                  style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${filterArea === "" ? C.forest : C.border}`, background: filterArea === "" ? C.forest : "transparent", color: filterArea === "" ? "#fff" : C.stone, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  All
                </button>
                {areas.map(a => (
                  <button key={a.id} onClick={() => setFilterArea(a.id)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${filterArea === a.id ? C.forest : C.border}`, background: filterArea === a.id ? C.forest : "transparent", color: filterArea === a.id ? "#fff" : C.stone, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            {/* Sort */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Sort by</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["recent", "Recently added"], ["alpha", "A–Z"], ["pct", "% grown"]].map(([val, label]) => (
                  <button key={val} onClick={() => setSortBy(val)}
                    style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${sortBy === val ? C.forest : C.border}`, background: sortBy === val ? C.forest : "transparent", color: sortBy === val ? "#fff" : C.stone, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Clear */}
            {activeFilterCount > 0 && (
              <button onClick={() => { setFilterStatus(""); setFilterArea(""); setFilterType(""); }}
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px", fontSize: 12, color: C.stone, cursor: "pointer", fontWeight: 600 }}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
      {crops.length === 0 && successionGroups.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 20px", color: C.stone, fontSize: 14 }}>No crops yet. Add your first crop.</div>
      )}
      {crops.length > 0 && visibleCrops.length === 0 && successionGroups.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 20px", color: C.stone, fontSize: 14 }}>No crops match your filters.</div>
      )}

      {/* ── Succession group cards ── */}
      {successionGroups.map(group => {
        const isExpanded = expandedGroups[group.id] !== false; // default expanded
        const sowings    = group.sowings || [];
        const nextIdx    = sowings.length + 1;
        const canAddMore = sowings.length < group.target_sowings;

        // Next harvest from earliest active sowing
        const harvests = sowings
          .filter(s => s.sown_date && (s.crop_def?.days_to_maturity_min || s.crop_def?.days_to_maturity_max))
          .map(s => {
            const dtm = s.crop_def?.days_to_maturity_min || s.crop_def?.days_to_maturity_max;
            const d = new Date(s.sown_date);
            d.setDate(d.getDate() + dtm);
            return d;
          })
          .sort((a, b) => a - b);
        const nextHarvest = harvests[0];
        const latestHarvest = harvests[harvests.length - 1];

        return (
          <div key={group.id} style={{ background: C.cardBg, border: `1px solid ${C.forest}44`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>

            {/* Confirm delete group */}
            {confirmDeleteGroup === group.id && (
              <div style={{ background: "#fff5f5", border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 14px", margin: "12px 14px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 10 }}>
                  Remove all {group.crop_name} sowings? This will remove {sowings.length} sowing{sowings.length !== 1 ? "s" : ""} and their tasks.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => deleteGroup(group.id)} disabled={saving}
                    style={{ flex: 1, background: C.red, color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    {saving ? "Removing…" : "Yes, remove all"}
                  </button>
                  <button onClick={() => setConfirmDeleteGroup(null)}
                    style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 0", color: C.stone, cursor: "pointer", fontSize: 13 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Group header */}
            <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedGroups(e => ({ ...e, [group.id]: !isExpanded }))}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 18 }}>{getCropEmoji(group.crop_name)}</span>
                  <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: "#1a1a1a" }}>
                    {group.crop_name}{group.variety_name ? ` — ${group.variety_name}` : ""}
                  </div>
                  <span style={{ fontSize: 11, background: C.forest + "18", color: C.forest, borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>
                    Succession
                  </span>
                  <span style={{ fontSize: 11, color: C.stone }}>{isExpanded ? "▼" : "▶"}</span>
                </div>
                <div style={{ fontSize: 11, color: C.stone }}>
                  {sowings.length} of {group.target_sowings} sowing{group.target_sowings !== 1 ? "s" : ""}
                  {group.interval_days ? ` · every ${group.interval_days} days` : ""}
                  {nextHarvest ? ` · first harvest ~${nextHarvest.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                </div>
              </div>
              <button onClick={() => setConfirmDeleteGroup(group.id)}
                style={{ background: "none", border: `1px solid ${C.red}22`, borderRadius: 8, padding: "4px 8px", fontSize: 11, color: C.red, cursor: "pointer", flexShrink: 0 }}>
                ✕
              </button>
            </div>

            {/* Expanded sowings list */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px 14px" }}>
                {sowings.map(sowing => {
                  const STAGE_LABEL = { seed: "Germinating", seedling: "Seedling", vegetative: "Vegetative", flowering: "Flowering", fruiting: "Fruiting", harvesting: "Ready to harvest", finished: "Finished" };
                  const stageKey   = sowing.stage || "seed";
                  const stageColor = { seed: C.stone, seedling: C.leaf, vegetative: C.forest, flowering: C.amber, fruiting: C.amber, harvesting: "#e08020", finished: C.stone }[stageKey] || C.stone;

                  let pct = 0;
                  if (sowing.sown_date && (sowing.crop_def?.days_to_maturity_max || sowing.crop_def?.days_to_maturity_min)) {
                    const offsetDays = sowing.timeline_offset_days || 0;
                    const effectiveSow = new Date(sowing.sown_date);
                    effectiveSow.setDate(effectiveSow.getDate() + offsetDays);
                    const dtm = sowing.crop_def?.days_to_maturity_max || sowing.crop_def?.days_to_maturity_min;
                    const daysSown = Math.max(0, Math.floor((Date.now() - effectiveSow.getTime()) / 86400000));
                    pct = Math.min(100, Math.max(0, Math.round((daysSown / dtm) * 100)));
                  }

                  // Estimated harvest date for this sowing
                  let harvestStr = null;
                  if (sowing.sown_date && (sowing.crop_def?.days_to_maturity_min || sowing.crop_def?.days_to_maturity_max)) {
                    const dtm = sowing.crop_def?.days_to_maturity_min || sowing.crop_def?.days_to_maturity_max;
                    const h = new Date(sowing.sown_date);
                    h.setDate(h.getDate() + dtm);
                    harvestStr = h.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                  }

                  return (
                    <div key={sowing.id} style={{ background: C.offwhite, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>
                            Sow {sowing.succession_index}
                            {sowing.sown_date && (
                              <span style={{ fontWeight: 400, color: C.stone, marginLeft: 8 }}>
                                sown {new Date(sowing.sown_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: stageColor, background: stageColor + "1a", border: `1px solid ${stageColor}44`, borderRadius: 20, padding: "1px 7px" }}>
                              {STAGE_LABEL[stageKey] || stageKey}
                            </span>
                            {harvestStr && <span style={{ fontSize: 11, color: C.stone }}>harvest ~{harvestStr}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setTimelineCrop(sowing)}
                            style={{ background: "none", border: `1px solid ${C.forest}`, borderRadius: 8, padding: "3px 9px", fontSize: 11, color: C.forest, fontWeight: 600, cursor: "pointer" }}>
                            Timeline
                          </button>
                          <button onClick={() => setConfirm(sowing.id)}
                            style={{ background: "none", border: `1px solid ${C.red}22`, borderRadius: 8, padding: "3px 8px", fontSize: 11, color: C.red, cursor: "pointer" }}>
                            ✕
                          </button>
                        </div>
                      </div>
                      {/* Per-sowing progress bar */}
                      {sowing.sown_date && (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: stageColor, fontWeight: 600 }}>{pct}% grown</span>
                          </div>
                          <div style={{ height: 5, background: C.border, borderRadius: 99, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: pct + "%", background: stageColor, borderRadius: 99 }} />
                          </div>
                        </div>
                      )}
                      {/* Confirm delete this sowing */}
                      {confirm === sowing.id && (
                        <div style={{ marginTop: 10, background: "#fff5f5", border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.red, marginBottom: 8 }}>Remove Sow {sowing.succession_index}?</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => deleteCrop(sowing.id)} disabled={saving}
                              style={{ flex: 1, background: C.red, color: "#fff", border: "none", borderRadius: 8, padding: "7px 0", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                              {saving ? "Removing…" : "Yes, remove"}
                            </button>
                            <button onClick={() => setConfirm(null)}
                              style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 0", color: C.stone, cursor: "pointer", fontSize: 12 }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Placeholder rows for unstarted sowings */}
                {Array.from({ length: Math.max(0, group.target_sowings - sowings.length) }).map((_, i) => {
                  const idx = sowings.length + i + 1;
                  const isNext = i === 0;
                  return (
                    <div key={`placeholder-${idx}`} style={{ background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 13, color: C.stone }}>
                        Sow {idx} <span style={{ fontSize: 11 }}>— not yet added</span>
                      </div>
                      {isNext && canAddMore && (
                        <button onClick={() => { setAddingSowingFor(group.id); setNewSowingForm({ sown_date: "", status: "growing" }); }}
                          style={{ background: C.forest, border: "none", color: "#fff", borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          + Add Sow {idx}
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add next sowing form */}
                {addingSowingFor === group.id && (
                  <div style={{ background: C.cardBg, border: `1px solid ${C.forest}`, borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "serif", marginBottom: 10 }}>Add Sow {nextIdx}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <label style={labelStyle}>Sow date</label>
                        <input type="date" value={newSowingForm.sown_date} onChange={e => setNewSowingForm(f => ({ ...f, sown_date: e.target.value }))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Status</label>
                        <select value={newSowingForm.status} onChange={e => setNewSowingForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                          <option value="planned">🗓 Planned</option>
                          <option value="sown_indoors">🪟 Sowing indoors</option>
                          <option value="sown_outdoors">🌱 Sowing outdoors</option>
                          <option value="growing">✅ Already growing</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => addNextSowing(group.id)} disabled={saving}
                          style={{ flex: 1, background: C.forest, border: "none", borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", fontFamily: "serif" }}>
                          {saving ? "Saving…" : `Save Sow ${nextIdx}`}
                        </button>
                        <button onClick={() => setAddingSowingFor(null)}
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 14px", color: C.stone, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Add beyond target */}
                {!canAddMore && !addingSowingFor && (
                  <button onClick={() => { setAddingSowingFor(group.id); setNewSowingForm({ sown_date: "", status: "growing" }); }}
                    style={{ width: "100%", background: "none", border: `1px dashed ${C.border}`, borderRadius: 10, padding: "10px", fontSize: 12, color: C.stone, cursor: "pointer", marginTop: 4 }}>
                    + Add another sowing
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {visibleCrops.map(crop => (
        <div key={crop.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>

          {/* Confirm delete overlay */}
          {confirm === crop.id && (
            <div style={{ background: "#fff5f5", border: `1px solid ${C.red}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 10 }}>Remove {crop.name}? This cannot be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => deleteCrop(crop.id)} disabled={saving}
                  style={{ flex: 1, background: C.red, color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {saving ? "Removing…" : "Yes, remove"}
                </button>
                <button onClick={() => setConfirm(null)}
                  style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 0", color: C.stone, cursor: "pointer", fontSize: 13 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editing === crop.id ? (
            /* Edit form */
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>Edit {crop.name}</div>
              <div>
                <label style={labelStyle}>Variety</label>
                <select
                  value={editForm.variety_id === "__other__" ? "__other__" : (editForm.variety_id || "")}
                  onChange={e => {
                    if (e.target.value === "__other__") {
                      setEditForm(f => ({ ...f, variety_id: "__other__", variety: "" }));
                    } else {
                      const matched = editVarieties.find(v => v.id === e.target.value);
                      setEditForm(f => ({ ...f, variety_id: e.target.value, variety: matched?.name || "" }));
                    }
                  }}
                  style={inputStyle}
                >
                  <option value="">Unknown / not sure</option>
                  {editVarieties.map(v => <option key={v.id} value={v.id}>{v.name}{v.classification ? ` (${v.classification})` : ""}</option>)}
                  <option value="__other__">Other — type my own</option>
                </select>
                {(editForm.variety_id === "__other__" || (!editForm.variety_id && editForm.variety)) && (
                  <input
                    value={editForm.variety}
                    onChange={e => setEditForm(f => ({ ...f, variety: e.target.value }))}
                    style={{ ...inputStyle, marginTop: 8 }}
                    placeholder="Type your variety name"
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                  <option value="planned">🗓 Planned</option>
                  <option value="sown_indoors">🪟 Sowing indoors</option>
                  <option value="sown_outdoors">🌱 Sowing outdoors</option>
                  <option value="transplanted">🪴 Transplanted</option>
                  <option value="growing">✅ Growing</option>
                  <option value="harvested">🧺 Harvested</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sow date</label>
                <input type="date" value={editForm.sown_date} onChange={e => setEditForm(f => ({ ...f, sown_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Growing area</label>
                <select value={editForm.area_id} onChange={e => setEditForm(f => ({ ...f, area_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select area</option>
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} placeholder="Optional notes" />
              </div>
              <div>
                <label style={labelStyle}>Grown from</label>
                <select value={editForm.grown_from} onChange={e => setEditForm(f => ({ ...f, grown_from: e.target.value }))} style={inputStyle}>
                  <option value="">Not specified</option>
                  <option value="seed">Seed</option>
                  <option value="sets">Sets</option>
                  <option value="tuber">Tuber</option>
                  <option value="plug">Plug plant</option>
                  <option value="cutting">Cutting</option>
                  <option value="crown">Crown</option>
                  <option value="runner">Runner</option>
                  <option value="cane">Cane</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Lifecycle</label>
                <select value={editForm.lifecycle_mode || "seasonal"} onChange={e => setEditForm(f => ({ ...f, lifecycle_mode: e.target.value }))} style={inputStyle}>
                  <option value="seasonal">This season</option>
                  <option value="established">Already established</option>
                  <option value="overwintered">Overwintered</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => saveEdit(crop.id)} disabled={saving}
                  style={{ flex: 1, background: C.forest, color: "#fff", border: "none", borderRadius: 8, padding: 12, fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button onClick={() => setEditing(null)}
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 16px", color: C.stone, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>

              {!crop.succession_group_id && (
                <div style={{ marginTop: 10 }}>
                  {convertingCrop !== crop.id ? (
                    <button onClick={() => { setConvertingCrop(crop.id); setConvertForm({ target_sowings: 3, interval_days: 14 }); }}
                      style={{ width: "100%", background: "none", border: `1px dashed ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: C.stone, cursor: "pointer", textAlign: "left" }}>
                      🔁 Convert to succession sowing
                    </button>
                  ) : (
                    <div style={{ border: `1px solid ${C.forest}`, borderRadius: 10, padding: "12px 14px", background: "#f0f5f3" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.forest, marginBottom: 4 }}>🔁 Convert to succession</div>
                      <div style={{ fontSize: 11, color: C.stone, marginBottom: 10 }}>This crop becomes Sow 1. Its tasks and timeline are preserved.</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <div>
                          <label style={labelStyle}>Planned sowings</label>
                          <input type="number" min="2" max="12" value={convertForm.target_sowings}
                            onChange={e => setConvertForm(f => ({ ...f, target_sowings: e.target.value }))}
                            style={inputStyle} inputMode="numeric" />
                        </div>
                        <div>
                          <label style={labelStyle}>Sow every (days)</label>
                          <input type="number" min="7" max="90" value={convertForm.interval_days}
                            onChange={e => setConvertForm(f => ({ ...f, interval_days: e.target.value }))}
                            style={inputStyle} inputMode="numeric" />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => convertToSuccession(crop.id)} disabled={saving}
                          style={{ flex: 1, background: C.forest, border: "none", borderRadius: 8, padding: 10, fontWeight: 700, fontSize: 13, color: "#fff", cursor: "pointer", fontFamily: "serif" }}>
                          {saving ? "Converting…" : "Convert"}
                        </button>
                        <button onClick={() => setConvertingCrop(null)}
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 14px", color: C.stone, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Normal view */
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1 }}>
                  {/* Thumbnail or emoji — with red dot if missed task */}
                  <div onClick={() => setDiary(crop)} style={{ cursor: "pointer", flexShrink: 0, position: "relative" }}>
                    {cropPhotos[crop.id] ? (
                      <img src={cropPhotos[crop.id]} alt={crop.name}
                        style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 10, background: C.offwhite, border: `1px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                        {getCropEmoji(crop.name)}
                      </div>
                    )}
                    {crop.missed_task_note && (
                      <div title={crop.missed_task_note}
                        style={{ position: "absolute", top: -4, right: -4, width: 12, height: 12, borderRadius: "50%", background: C.red, border: "2px solid #fff", flexShrink: 0 }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: "#1a1a1a" }}>{crop.name}</div>
                    <div style={{ fontSize: 12, color: C.stone, marginTop: 1 }}>{varietyName(crop.variety) || "No variety set"}</div>
                    {(() => {
                      const stageKey = crop.stage || "seed";
                      const stageColor = STAGE_COLOR[stageKey] || C.stone;
                      const STAGE_LABEL = { seed: "Germinating", seedling: "Seedling", vegetative: "Vegetative", flowering: "Flowering", fruiting: "Fruiting", harvesting: "Ready to harvest", finished: "Finished" };
                      const label = STAGE_LABEL[stageKey] || stageKey;
                      return (
                        <span style={{ display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 600, color: stageColor, background: stageColor + "1a", border: `1px solid ${stageColor}44`, borderRadius: 20, padding: "2px 8px" }}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => setTimelineCrop(crop)}
                    style={{ background: "none", border: `1px solid ${C.forest}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: C.forest, fontWeight: 600, cursor: "pointer" }}>
                    Timeline
                  </button>
                  {plantCheckEnabled && <button onClick={() => setCropPlantCheck(crop)}
                    style={{ background: "none", border: `1px solid ${C.forest}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: C.forest, fontWeight: 600, cursor: "pointer" }}>
                    🔍 Check
                  </button>}
                  <button onClick={() => setDiary(crop)}
                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: C.stone, cursor: "pointer" }}>
                    📷
                  </button>
                  <button onClick={() => startEdit(crop)}
                    style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: C.stone, cursor: "pointer" }}>
                    Edit
                  </button>
                  <button onClick={() => setConfirm(crop.id)}
                    style={{ background: "none", border: `1px solid ${C.red}22`, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: C.red, cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              {(() => {
                const stageKey = crop.stage || "seed";
                const stageColor = STAGE_COLOR[stageKey] || C.stone;
                // Calculate % grown
                let pct;
                const isPerennial = crop.crop_def?.is_perennial;
                if (crop.status === "planned") {
                  // Planned but not sown — always 0
                  pct = 0;
                } else if (isPerennial && crop.crop_def?.harvest_month_start) {
                  // Perennials: show seasonal progress toward harvest window
                  const now = new Date();
                  const month = now.getMonth() + 1; // 1-12
                  const hs = crop.crop_def.harvest_month_start;
                  const he = crop.crop_def.harvest_month_end || hs;
                  // Season runs Jan→harvest end. Show progress through the year toward harvest.
                  if (month > he) {
                    pct = 100; // past harvest window
                  } else if (month >= hs) {
                    // In harvest window
                    pct = Math.round(((month - hs + 1) / (he - hs + 1)) * 100);
                    pct = Math.max(80, Math.min(100, pct));
                  } else {
                    // Before harvest window — progress toward it
                    pct = Math.round((month / hs) * 75);
                    pct = Math.max(0, Math.min(74, pct));
                  }
                } else if (!crop.sown_date) {
                  pct = 0;
                } else if (crop.sown_date && crop.crop_def?.days_to_maturity_max) {
                  const offsetDays = crop.timeline_offset_days || 0;
                  const effectiveSowDate = new Date(crop.sown_date);
                  effectiveSowDate.setDate(effectiveSowDate.getDate() + offsetDays);
                  const totalDays = crop.crop_def.days_to_maturity_max;
                  const daysSinceSown = Math.max(0, Math.floor((Date.now() - effectiveSowDate.getTime()) / 86400000));
                  pct = Math.min(100, Math.max(0, Math.round((daysSinceSown / totalDays) * 100)));
                } else {
                  // No maturity data — fall back to stage index but skip if no sow date
                  const STAGES = ["seed","seedling","vegetative","flowering","fruiting","harvesting"];
                  const idx = STAGES.indexOf(stageKey === "tuber" || stageKey === "sets" ? "seed" : stageKey);
                  pct = idx <= 0 ? 0 : Math.round((idx / STAGES.length) * 100);
                }
                return (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: stageColor, textTransform: "capitalize" }}>{stageKey && stageKey !== "seed" ? stageKey : (crop.grown_from || "seed")}</span>
                      <span style={{ fontSize: 11, color: stageColor, fontWeight: 600 }}>{pct}% grown</span>
                    </div>
                    <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: pct + "%", background: stageColor, borderRadius: 99, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ background: C.offwhite, borderRadius: 20, fontSize: 11, padding: "2px 8px", color: C.forest }}>{crop.area?.name}</span>
                {crop.sown_date && <span style={{ background: C.offwhite, borderRadius: 20, fontSize: 11, padding: "2px 8px", color: C.stone }}>Sown {new Date(crop.sown_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                {crop.status === "planned"      && <span style={{ background: "#fff8ed", border: `1px solid ${C.amber}`, borderRadius: 20, fontSize: 11, padding: "2px 8px", color: C.amber }}>🗓 Planned</span>}
                {crop.status === "sown_indoors" && <span style={{ background: "#f0f4ff", border: `1px solid #7b9ef7`, borderRadius: 20, fontSize: 11, padding: "2px 8px", color: "#2d4fc0" }}>🪟 Indoors</span>}
                {!crop.crop_def_id && <span style={{ background: "#f0f4ff", border: `1px solid #7b9ef7`, borderRadius: 20, fontSize: 11, padding: "2px 8px", color: "#2d4fc0" }}>🔍 Being identified…</span>}
                {crop.lifecycle_mode === "established"  && <span style={{ background: "#f0f5f3", border: `1px solid ${C.forest}44`, borderRadius: 20, fontSize: 11, padding: "2px 8px", color: C.forest }}>🌳 Established</span>}
                {crop.lifecycle_mode === "overwintered" && <span style={{ background: "#f0f4ff", border: `1px solid #7b9ef7`, borderRadius: 20, fontSize: 11, padding: "2px 8px", color: "#2d4fc0" }}>❄️ Overwintered</span>}
              </div>

              {/* Missed task note */}
              {crop.missed_task_note && (
                <div style={{ marginTop: 10, background: "#fff5f5", border: `1px solid ${C.red}44`, borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 2 }}>⚠ Missed task</div>
                    <div style={{ fontSize: 12, color: C.stone, lineHeight: 1.4 }}>{crop.missed_task_note}</div>
                  </div>
                  <button onClick={async () => {
                    await apiFetch(`/crops/${crop.id}`, { method: "PUT", body: JSON.stringify({ missed_task_note: null }) });
                    await load();
                  }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 8px", fontSize: 11, color: C.stone, cursor: "pointer", flexShrink: 0 }}>
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </>}
    </div>
  );
}

// ── CropSearchInput ───────────────────────────────────────────────────────────
function CropSearchInput({ cropDefs, value, onChange }) {
  const [query,   setQuery]   = useState("");
  const [open,    setOpen]    = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const displayText = focused ? query : (value?.name || query);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return cropDefs.slice(0, 8);
    const singular = q.endsWith("s") ? q.slice(0, -1) : q;
    const matches = cropDefs.filter(d => {
      const n = d.name.toLowerCase();
      return n.includes(q) || n.includes(singular);
    });
    matches.sort((a, b) => {
      const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      const aStarts = an.startsWith(q) || an.startsWith(singular);
      const bStarts = bn.startsWith(q) || bn.startsWith(singular);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return an.localeCompare(bn);
    });
    return matches.slice(0, 8);
  })();

  const handleFocus = () => { setFocused(true); setQuery(value?.name || ""); setOpen(true); };
  const handleBlur  = () => {
    setTimeout(() => {
      setFocused(false); setOpen(false);
      if (query.trim() && !value) onChange({ id: "__other__", name: query.trim() });
    }, 150);
  };
  const handleChange = e => { setQuery(e.target.value); setOpen(true); if (value) onChange(null); };
  const handleSelect = def => { onChange(def); setQuery(def.name); setOpen(false); setFocused(false); inputRef.current?.blur(); };
  const handleKeyDown = e => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    if (e.key === "Enter" && filtered.length > 0) { e.preventDefault(); handleSelect(filtered[0]); }
  };

  return (
    <div style={{ position: "relative" }}>
      <input ref={inputRef} type="text" value={displayText} onChange={handleChange}
        onFocus={handleFocus} onBlur={handleBlur} onKeyDown={handleKeyDown}
        style={{ ...inputStyle, background: value && value.id !== "__other__" ? "#f0f5f3" : undefined }}
        placeholder="Search crops — e.g. Carrot, Tomato…" autoComplete="off" />
      {value && value.id !== "__other__" && (
        <button type="button" onClick={() => { onChange(null); setQuery(""); setTimeout(() => inputRef.current?.focus(), 50); }}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.stone, padding: 0, lineHeight: 1 }}>×</button>
      )}
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", zIndex: 200, overflow: "hidden", marginTop: 2 }}>
          {filtered.map(def => (
            <div key={def.id} onMouseDown={() => handleSelect(def)}
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, color: "#1a1a1a", borderBottom: `1px solid ${C.border}` }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0f5f3"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {getCropEmoji(def.name)} {def.name}
            </div>
          ))}
          {query.trim() ? (
            <div onMouseDown={() => handleSelect({ id: "__other__", name: query.trim() })}
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, color: C.stone, fontStyle: "italic" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0f5f3"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              🔍 Not in list — identify "{query.trim()}" with AI
            </div>
          ) : (
            <div onMouseDown={() => { setOpen(false); onChange({ id: "__other__", name: "" }); setTimeout(() => inputRef.current?.focus(), 50); }}
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, color: C.stone, fontStyle: "italic" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0f5f3"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              🔍 Not in list — identify with AI
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add crop ──────────────────────────────────────────────────────────────────
function AddCrop({ prefill, onPrefillConsumed, onCancel }) {
  const [cropDefs,  setCropDefs]  = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [areas,     setAreas]     = useState([]);
  const [form, setForm] = useState({
    crop_def_id: "", variety_id: "", variety: "", crop_other: "", area_id: "",
    status: "", sown_date: "", transplant_date: "", notes: "", lifecycle_mode: "seasonal",
  });
  const [saving,          setSaving]          = useState(false);
  const [saved,           setSaved]           = useState(false);
  const [enriching,       setEnriching]       = useState(false);
  const [error,           setError]           = useState(null);
  const [step,            setStep]            = useState("form");
  const [showScanner,     setShowScanner]     = useState(false);
  const [cropProfile,     setCropProfile]     = useState(null);
  // Succession mode
  const [successionMode,  setSuccessionMode]  = useState(false);
  const [succForm,        setSuccForm]        = useState({ target_sowings: 3, interval_days: 14, first_sown_date: "" });
  // Lifecycle mode
  // (value stored in form.lifecycle_mode)

  useEffect(() => {
    Promise.all([apiFetch("/crop-definitions"), apiFetch("/areas")])
      .then(([defs, areasData]) => {
        setCropDefs(defs);
        setAreas(areasData);
        // Apply prefill from planting suggestions if present
        if (prefill) {
          const matched = defs.find(d => d.name.toLowerCase() === prefill.name?.toLowerCase());
          setForm(f => ({
            ...f,
            crop_def_id: matched ? matched.id : "__other__",
            crop_other:  matched ? "" : (prefill.name || ""),
            variety:     prefill.variety || "",
            variety_id:  prefill.variety ? "__other__" : "",
            area_id:     prefill.area_id || "",
            is_companion: prefill.is_companion || false,
          }));
          if (onPrefillConsumed) onPrefillConsumed();
        }
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!form.crop_def_id || form.crop_def_id === "__other__") { setVarieties([]); return; }
    apiFetch(`/varieties?crop_def_id=${form.crop_def_id}`)
      .then(setVarieties).catch(() => setVarieties([]));
    setForm(f => ({ ...f, variety_id: "", variety: "" }));
  }, [form.crop_def_id]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const isOtherCrop    = form.crop_def_id === "__other__";
  const isOtherVariety = form.variety_id  === "__other__";
  const selectedCrop   = cropDefs.find(d => d.id === form.crop_def_id);

  const STATUS_OPTIONS = [
    { value: "planned",       label: "🗓 Planned",             hint: "I plan to grow this — not started yet" },
    { value: "sown_indoors",  label: "🪟 Sowing indoors",      hint: "Starting on windowsill, greenhouse or cold frame" },
    { value: "sown_outdoors", label: "🌱 Sowing outdoors",     hint: "Direct sowing outside in final position" },
    { value: "transplanted",  label: "🪴 Transplanted",        hint: "Moved outside from indoors / greenhouse" },
    { value: "growing",       label: "✅ Already growing",     hint: "Established and growing — add sow date below" },
  ];

  const showSowDate        = ["sown_indoors","sown_outdoors","growing","transplanted"].includes(form.status);
  const showTransplantDate = form.status === "transplanted";
  const sowDateLabel       = form.status === "sown_indoors" ? "Date sown indoors"
                           : form.status === "sown_outdoors" ? "Date sown outdoors"
                           : "Sow date";
  const canSave = (form.crop_def_id || (isOtherCrop && form.crop_other)) && form.area_id && form.status;

  // ── Step 1: user hits "Review & Add" → fetch profile or generate for unknown ──
  const handleReview = async () => {
    setError(null);
    const cropName = isOtherCrop ? form.crop_other : selectedCrop?.name;
    if (!cropName || !form.area_id || !form.status) return;

    if (isOtherCrop) {
      // Unknown crop — ask Claude to build a profile
      setStep("loading_preview");
      try {
        const profile = await apiFetch("/crops/preview", {
          method: "POST",
          body: JSON.stringify({ name: cropName, variety: form.variety || null }),
        });
        setCropProfile(profile);
        setStep("previewing");
      } catch (e) {
        setError("Could not identify crop — " + e.message);
        setStep("form");
      }
    } else {
      // Known crop — show enrichment data from crop_def
      const def = selectedCrop;
      const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      setCropProfile({
        name:        def.name,
        known:       true,
        description: def.description || null,
        sow_window:  def.sow_window_start && def.sow_window_end
          ? `${monthNames[def.sow_window_start - 1]} – ${monthNames[def.sow_window_end - 1]}`
          : null,
        harvest_window: def.harvest_window_start && def.harvest_window_end
          ? `${monthNames[def.harvest_window_start - 1]} – ${monthNames[def.harvest_window_end - 1]}`
          : null,
        spacing_cm:  def.spacing_cm || null,
        days_to_maturity: def.days_to_maturity_min && def.days_to_maturity_max
          ? `${def.days_to_maturity_min}–${def.days_to_maturity_max} days`
          : null,
        feeding_notes:    def.feeding_notes    || null,
        companion_plants: def.companion_plants || null,
        common_issues:    def.common_issues    || null,
        sow_method:       def.sow_method       || null,
      });
      setStep("previewing");
    }
  };

  // ── Step 2: user confirms → actually save ─────────────────────────────────
  const handleSave = async () => {
    const cropName = isOtherCrop ? form.crop_other : selectedCrop?.name;
    setSaving(true); setError(null);

    // ── Succession path ───────────────────────────────────────────────────
    if (successionMode) {
      if (saving) return;
      try {
        const realVarietyId = isOtherVariety ? null : (form.variety_id || null);
        const realVariety   = isOtherVariety
          ? (form.variety || null)
          : (varieties.find(v => v.id === form.variety_id)?.name || null);
        await apiFetch("/succession-groups", {
          method: "POST",
          body: JSON.stringify({
            crop_name:       cropName,
            crop_def_id:     isOtherCrop ? null : (form.crop_def_id || null),
            variety_id:      realVarietyId,
            variety_name:    realVariety,
            area_id:         form.area_id,
            target_sowings:  Number(succForm.target_sowings) || 3,
            interval_days:   Number(succForm.interval_days)  || null,
            first_sown_date: succForm.first_sown_date || null,
            first_status:    succForm.first_sown_date ? "growing" : "planned",
          }),
        });
        try { localStorage.removeItem("vercro_crops_v1"); localStorage.removeItem("vercro_garden_v1"); localStorage.removeItem("vercro_dashboard_v1"); } catch(e) {}
        setStep("done");
        setTimeout(() => {
          setStep("form"); setSaved(false); setEnriching(false); setCropProfile(null);
          setSuccessionMode(false);
          setSuccForm({ target_sowings: 3, interval_days: 14, first_sown_date: "" });
          setForm({ crop_def_id: "", variety_id: "", variety: "", crop_other: "", area_id: "", status: "", sown_date: "", transplant_date: "", notes: "", lifecycle_mode: "seasonal" });
        }, 5000);
      } catch (e) { setError(e.message); setStep("previewing"); }
      setSaving(false);
      return;
    }

    // ── Single crop path (existing) ───────────────────────────────────────
    try {
      const realVarietyId = isOtherVariety ? null : (form.variety_id || null);
      const realVariety   = isOtherVariety
        ? (form.variety || null)
        : (varieties.find(v => v.id === form.variety_id)?.name || null);

      const result = await apiFetch("/crops", {
        method: "POST",
        body: JSON.stringify({
          name:             cropName,
          crop_def_id:      isOtherCrop ? null : (form.crop_def_id || null),
          variety_id:       realVarietyId,
          variety:          realVariety,
          area_id:          form.area_id,
          status:           form.status,
          sown_date:        showSowDate ? (form.sown_date || null) : null,
          transplant_date:  showTransplantDate ? (form.transplant_date || null) : null,
          start_date_confidence: form.sown_date ? "exact" : "unknown",
          notes:            form.notes || null,
          is_other_crop:    isOtherCrop,
          is_other_variety: isOtherVariety,
          is_companion:     form.is_companion || false,
          preview_profile:  cropProfile || null,
          barcode:          form.barcode || null,
          lifecycle_mode:   form.lifecycle_mode || "seasonal",
        }),
      });

      if (result.enriching) setEnriching(true);
      try { localStorage.removeItem("vercro_crops_v1"); localStorage.removeItem("vercro_garden_v1"); localStorage.removeItem("vercro_dashboard_v1"); } catch(e) {}
      setStep("done");
      setTimeout(() => {
        setStep("form");
        setSaved(false); setEnriching(false); setCropProfile(null);
        setForm({ crop_def_id: "", variety_id: "", variety: "", crop_other: "", area_id: "", status: "", sown_date: "", transplant_date: "", notes: "", lifecycle_mode: "seasonal" });
      }, 5000);
    } catch (e) { setError(e.message); setStep("previewing"); }
    setSaving(false);
  };

  // ── Done state ────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{getCropEmoji(cropProfile?.name || "")}</div>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 8 }}>{cropProfile?.name} added!</div>
        <div style={{ fontSize: 14, color: C.stone, marginBottom: 24 }}>
          {enriching ? "Identifying and enriching crop data — tasks will appear shortly 🔍" : "Tasks will be generated for your garden."}
        </div>
        <button onClick={() => { setStep("form"); setCropProfile(null); setEnriching(false); setForm({ crop_def_id: "", variety_id: "", variety: "", crop_other: "", area_id: "", status: "", sown_date: "", transplant_date: "", notes: "", lifecycle_mode: "seasonal" }); }}
          style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "serif" }}>
          Add Another Crop
        </button>
      </div>
    );
  }

  // ── Loading preview state ─────────────────────────────────────────────────
  if (step === "loading_preview") {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 8 }}>Finding your crop…</div>
        <div style={{ fontSize: 13, color: C.stone }}>Building a growing profile for {form.crop_other}</div>
      </div>
    );
  }

  // ── Confirmation / preview state ──────────────────────────────────────────
  if (step === "previewing" && cropProfile) {
    const area = areas.find(a => a.id === form.area_id);
    const statusLabel = STATUS_OPTIONS.find(o => o.value === form.status)?.label || form.status;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setStep("form")}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, color: C.stone, cursor: "pointer" }}>
            ← Back
          </button>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Confirm crop</div>
        </div>

        {error && <ErrorMsg msg={error} />}

        {/* Crop profile card */}
        <div style={{ background: "#f0f7f4", border: `1px solid ${C.sage}`, borderRadius: 14, padding: "20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 40 }}>{getCropEmoji(cropProfile.name)}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>{cropProfile.name}</div>
              {(form.variety || varieties.find(v => v.id === form.variety_id)?.name) && (
                <div style={{ fontSize: 13, color: C.stone }}>
                  {form.variety || varieties.find(v => v.id === form.variety_id)?.name}
                </div>
              )}
              {cropProfile.known && <div style={{ fontSize: 11, color: C.forest, fontWeight: 600, marginTop: 2 }}>✓ Known crop</div>}
              {!cropProfile.known && <div style={{ fontSize: 11, color: "#7b9ef7", fontWeight: 600, marginTop: 2 }}>🔍 AI identified</div>}
            </div>
          </div>

          {cropProfile.description && (
            <div style={{ fontSize: 13, color: "#1a1a1a", marginBottom: 12, lineHeight: 1.5 }}>{cropProfile.description}</div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {cropProfile.sow_window && (
              <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: C.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Sow window</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{cropProfile.sow_window}</div>
              </div>
            )}
            {cropProfile.harvest_window && (
              <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: C.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Harvest</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{cropProfile.harvest_window}</div>
              </div>
            )}
            {cropProfile.spacing_cm && (
              <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: C.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Spacing</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{cropProfile.spacing_cm}cm</div>
              </div>
            )}
            {cropProfile.days_to_maturity && (
              <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: C.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Matures in</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{cropProfile.days_to_maturity}</div>
              </div>
            )}
          </div>

          {cropProfile.feeding_notes && (
            <div style={{ marginTop: 10, background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: C.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Feeding</div>
              <div style={{ fontSize: 12, color: "#1a1a1a", lineHeight: 1.5 }}>{cropProfile.feeding_notes}</div>
            </div>
          )}
          {cropProfile.companion_plants && (
            <div style={{ marginTop: 10, background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: C.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Companion plants</div>
              <div style={{ fontSize: 12, color: "#1a1a1a", lineHeight: 1.5 }}>{cropProfile.companion_plants}</div>
            </div>
          )}
          {cropProfile.common_issues && (
            <div style={{ marginTop: 10, background: "#fff", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Watch out for</div>
              <div style={{ fontSize: 12, color: "#1a1a1a", lineHeight: 1.5 }}>{cropProfile.common_issues}</div>
            </div>
          )}
        </div>

        {/* Planting summary */}
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Your planting details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 13, color: "#1a1a1a" }}>📍 {area?.name || "Unknown area"}</div>
            <div style={{ fontSize: 13, color: "#1a1a1a" }}>{statusLabel}</div>
            {form.sown_date && <div style={{ fontSize: 13, color: "#1a1a1a" }}>📅 Sown {new Date(form.sown_date).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</div>}
            {form.notes && <div style={{ fontSize: 13, color: C.stone, fontStyle: "italic" }}>"{form.notes}"</div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep("form")}
            style={{ flex: 1, padding: "13px", borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Edit details
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: "13px", borderRadius: 12, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "serif", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Adding…" : "Add to my garden 🌱"}
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div>
      {showScanner && (
        <BarcodeScanner
          mode="crop"
          onClose={() => setShowScanner(false)}
          onResult={r => {
            setShowScanner(false);
            if (r.found) {
              if (r.crop_def_id) set("crop_def_id", r.crop_def_id);
              else { set("crop_def_id", "__other__"); set("crop_other", r.name); }
              if (r.variety) set("variety", r.variety);
              if (r.barcode) set("barcode", r.barcode);
            }
            // Not found — user fills in manually, Claude will enrich as usual
          }}
        />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Add Crop</div>
        {onCancel && (
          <button onClick={onCancel}
            style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: C.stone, lineHeight: 1, padding: "0 4px" }}>
            ×
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: C.stone, marginBottom: 24 }}>Tell us what you're growing and we'll build a task schedule for you.</div>
      {error && <ErrorMsg msg={error} />}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Crop */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>What are you growing?</label>
            <button type="button" onClick={() => setShowScanner(true)}
              style={{ background: C.offwhite, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, color: C.forest, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              📷 Scan packet
            </button>
          </div>
          <CropSearchInput
            cropDefs={cropDefs}
            value={form.crop_def_id === "__other__" ? { id: "__other__", name: form.crop_other } : (cropDefs.find(d => d.id === form.crop_def_id) || null)}
            onChange={selection => {
              if (!selection) { set("crop_def_id", ""); set("crop_other", ""); }
              else if (selection.id === "__other__") { set("crop_def_id", "__other__"); set("crop_other", selection.name); }
              else { set("crop_def_id", selection.id); set("crop_other", ""); }
            }}
          />
        </div>

        {/* Variety */}
        <div>
          <label style={labelStyle}>Variety</label>
          <select
            value={form.variety_id === "__other__" ? "__other__" : (form.variety_id || "")}
            onChange={e => {
              if (e.target.value === "__other__") { set("variety_id", "__other__"); set("variety", ""); }
              else { set("variety_id", e.target.value); set("variety", ""); }
            }}
            style={inputStyle} disabled={!form.crop_def_id}>
            <option value="">Unknown / not sure</option>
            {varieties.map(v => <option key={v.id} value={v.id}>{v.name}{v.classification ? ` (${v.classification})` : ""}</option>)}
            <option value="__other__">Other — type my own</option>
          </select>
          {(isOtherVariety || isOtherCrop) && (
            <input type="text" value={form.variety} onChange={e => set("variety", e.target.value)}
              style={{ ...inputStyle, marginTop: 8 }} placeholder="Type your variety name" />
          )}
          <div style={{ fontSize: 11, color: C.stone, marginTop: 4 }}>Optional — tasks work without a variety.</div>
        </div>

        {/* Area */}
        <div>
          <label style={labelStyle}>Where are you growing it?</label>
          <select value={form.area_id} onChange={e => set("area_id", e.target.value)} style={inputStyle}>
            <option value="">Select area…</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type?.replace("_"," ")})</option>)}
          </select>
        </div>

        {/* Status */}
        <div>
          <label style={labelStyle}>What stage is this crop at?</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STATUS_OPTIONS.map(opt => (
              <div key={opt.value} onClick={() => set("status", opt.value)}
                style={{ border: `2px solid ${form.status === opt.value ? C.forest : C.border}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", background: form.status === opt.value ? "#f0f5f3" : C.cardBg, transition: "all 0.15s" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: form.status === opt.value ? C.forest : "#1a1a1a" }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>{opt.hint}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Sow date */}
        {showSowDate && (
          <div>
            <label style={labelStyle}>{sowDateLabel} <span style={{ color: C.stone, fontWeight: 400 }}>(optional)</span></label>
            <input type="date" value={form.sown_date} onChange={e => set("sown_date", e.target.value)} style={inputStyle} />
            <div style={{ fontSize: 11, color: C.stone, marginTop: 4 }}>Helps generate accurate feeding and harvest tasks</div>
          </div>
        )}

        {/* Transplant date */}
        {showTransplantDate && (
          <div>
            <label style={labelStyle}>Date transplanted outdoors <span style={{ color: C.stone, fontWeight: 400 }}>(optional)</span></label>
            <input type="date" value={form.transplant_date} onChange={e => set("transplant_date", e.target.value)} style={inputStyle} />
          </div>
        )}

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            style={{ ...inputStyle, height: 80, resize: "vertical" }} placeholder="Any notes about this plant…" />
        </div>

        {/* Lifecycle mode */}
        <div>
          <label style={labelStyle}>How are you growing this?</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { value: "seasonal",     label: "This season",        hint: "Growing from seed or young plant this season" },
              { value: "established",  label: "Already established", hint: "Long-term plant already in the ground" },
              { value: "overwintered", label: "Overwintered",        hint: "Started last season and still growing now" },
            ].map(opt => (
              <div key={opt.value} onClick={() => set("lifecycle_mode", opt.value)}
                style={{ border: "2px solid " + (form.lifecycle_mode === opt.value ? C.forest : C.border), borderRadius: 10, padding: "9px 12px", cursor: "pointer", background: form.lifecycle_mode === opt.value ? "#f0f5f3" : C.cardBg, transition: "all 0.15s" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: form.lifecycle_mode === opt.value ? C.forest : "#1a1a1a" }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>{opt.hint}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Succession sowing toggle */}
        {form.area_id && (
          <div style={{ border: `1px solid ${successionMode ? C.forest : C.border}`, borderRadius: 12, padding: "12px 14px", background: successionMode ? "#f0f5f3" : "transparent" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => setSuccessionMode(v => !v)}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: successionMode ? C.forest : "#1a1a1a" }}>🔁 Succession sowing</div>
                <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>Sow in batches for a continuous harvest — carrots, salads, beetroot</div>
              </div>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: successionMode ? C.forest : C.border, position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 2, left: successionMode ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
              </div>
            </div>
            {successionMode && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Planned sowings</label>
                    <input type="number" min="2" max="12" value={succForm.target_sowings}
                      onChange={e => setSuccForm(f => ({ ...f, target_sowings: e.target.value }))}
                      style={inputStyle} inputMode="numeric" />
                  </div>
                  <div>
                    <label style={labelStyle}>Sow every (days)</label>
                    <input type="number" min="7" max="90" value={succForm.interval_days}
                      onChange={e => setSuccForm(f => ({ ...f, interval_days: e.target.value }))}
                      style={inputStyle} inputMode="numeric" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>First sow date <span style={{ fontWeight: 400, color: C.stone }}>(optional)</span></label>
                  <input type="date" value={succForm.first_sown_date}
                    onChange={e => setSuccForm(f => ({ ...f, first_sown_date: e.target.value }))}
                    style={inputStyle} />
                </div>
                <div style={{ fontSize: 11, color: C.stone, fontStyle: "italic" }}>
                  Sow 1 is created now. Add Sow 2, 3 etc. later when you're ready.
                </div>
              </div>
            )}
          </div>
        )}

        <button onClick={successionMode ? handleSave : handleReview} disabled={!canSave || saving}
          style={{ background: (!canSave || saving) ? C.border : C.forest, color: (!canSave || saving) ? C.stone : "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: (!canSave || saving) ? "not-allowed" : "pointer", fontFamily: "serif", transition: "background 0.2s" }}>
          {saving ? "Saving…" : successionMode ? "Create succession →" : "Review & Add →"}
        </button>
      </div>
    </div>
  );
}

// ── Helper date functions ─────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().split("T")[0]; }
function weekEndISO() { return new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]; }

// ── FAQ Section ──────────────────────────────────────────────────────────────
const FAQ_DATA = [
  {
    section: "Getting Started",
    emoji: "🌱",
    items: [
      {
        q: "What is Vercro and how does it work?",
        a: "Vercro is an AI garden planner built for UK home growers and allotment holders. Add your crops, tell us where you're growing them and when you sowed them, and Vercro builds a personalised task schedule covering sowing, feeding, watering, harvesting and more. It also factors in your local weather and frost risk to keep tasks accurate throughout the season.",
      },
      {
        q: "How do I add my first crop?",
        a: "Tap the Add tab at the bottom of the screen. Select your crop, choose a variety if you know it, pick your growing area and tell us what stage it's at. Vercro generates a task schedule automatically. You can also tap 'Scan packet' to identify a crop from a photo of the seed packet.",
      },
      {
        q: "Why do I need to add a postcode?",
        a: "Your postcode pulls live local weather and frost alerts for your area. Without it Vercro can't warn you about frost risk or adjust task timing based on your climate. Enter the first part only — for example TS22, not TS22 5BQ.",
      },
      {
        q: "What's the difference between a location and a growing area?",
        a: "A location is where you garden — for example your back garden or your allotment plot. A growing area is a specific space within that location — for example Raised bed 1, Greenhouse or Container pots. You can have multiple locations, each with multiple growing areas.",
      },
    ],
  },
  {
    section: "Crops & Tasks",
    emoji: "🥕",
    items: [
      {
        q: "Why aren't I seeing any tasks yet?",
        a: "Tasks are generated based on your crops, sow dates and location. If you've just added a crop, tasks can take a few moments to appear. Check the Quick crop check section on your Today screen — it may be asking for a sow date or other information that's needed to generate tasks.",
      },
      {
        q: "How do I edit or delete a crop?",
        a: "Go to the Crops tab and swipe left on the crop card. This reveals an Edit button and a Delete button. Tap Edit to update the variety, status, sow date, area or notes. Tap Delete to remove it — you'll be asked to confirm first.",
      },
      {
        q: "What does each crop status mean?",
        a: "🗓 Planned — you intend to grow this but haven't started yet\n🪟 Sowing indoors — seeds started on a windowsill, greenhouse or cold frame\n🌱 Sowing outdoors — direct sown outside in the final position\n🪴 Transplanted — moved outside from indoors or a greenhouse\n✅ Growing — established and growing\n🧺 Harvested — the crop has been harvested",
      },
      {
        q: "What if my crop isn't in the list?",
        a: "Select 'Other' at the bottom of the crop list and type the name. Vercro will identify it and build a growing profile automatically, including sow windows, spacing, feeding guidance and harvest timing. This usually takes about 30 seconds.",
      },
      {
        q: "Why does my crop say 'Being identified'?",
        a: "When you add a crop not in our database, Vercro uses AI to research it and build a profile. This normally completes within a minute. Once done, tasks will start appearing for it.",
      },
      {
        q: "What does the % grown bar mean?",
        a: "For crops with a sow date, the bar shows how far through the crop's typical growing period you are — based on days since sowing divided by days to maturity. For perennial plants like fruit trees, it shows seasonal progress toward their harvest window. Planned crops that haven't been sown yet show 0%.",
      },
      {
        q: "What does the harvest estimate mean and how accurate is it?",
        a: "The harvest estimate is calculated from your sow date, the variety's typical days to maturity and your growing conditions. It gives an approximate date for when your crop should be ready. The more information you add — sow date, variety, updates via the Quick crop check — the more accurate it becomes. If you tap 'Not yet' on a lifecycle prompt, the estimate adjusts to reflect the delay.",
      },
    ],
  },
  {
    section: "Garden Setup",
    emoji: "⬡",
    items: [
      {
        q: "Can I have more than one garden location?",
        a: "Yes. Go to the Garden tab and tap + Location. Each location can have its own growing areas and its own postcode for localised weather.",
      },
      {
        q: "What types of growing area should I add?",
        a: "Add whatever matches how you actually grow — raised bed, open ground, greenhouse, polytunnel or container/pots. Getting this right matters: greenhouse and polytunnel crops get earlier planting dates and no frost warnings, while containers get more frequent watering reminders.",
      },
      {
        q: "Does it matter if I'm in a greenhouse vs open ground?",
        a: "Yes — significantly. Greenhouse and polytunnel growing extends your season at both ends. Vercro uses your area type to adjust sowing windows, frost alerts and task timing accordingly.",
      },
    ],
  },
  {
    section: "Weather & Alerts",
    emoji: "🌤",
    items: [
      {
        q: "How does Vercro use my location?",
        a: "Vercro uses your postcode to pull live weather data including temperature, conditions and frost risk. This appears on your Today screen and is used to adjust task timing — for example delaying outdoor sowing tasks if frost is forecast.",
      },
      {
        q: "What are frost alerts and when do I get them?",
        a: "Frost alerts appear on your Today screen when the temperature at your location is forecast to drop close to or below zero. They show as a traffic light indicator — green for no risk, amber for near frost, red for frost risk. If you have frost-sensitive crops outdoors, this is your warning to protect them.",
      },
    ],
  },
  {
    section: "Feeds",
    emoji: "🧪",
    items: [
      {
        q: "What are feeds and why should I add them?",
        a: "Feeds are the fertilisers and plant foods you use in your garden. When you register what you own, Vercro personalises your feeding tasks to match — including the right dilution rates, application frequency and which crops each feed suits.",
      },
      {
        q: "What if my feed brand isn't listed?",
        a: "Select Other as the brand and type the name. Vercro will look it up and fill in the details automatically, including NPK values, dilution rates and feeding frequency. This usually takes about a minute.",
      },
    ],
  },
  {
    section: "Account",
    emoji: "👤",
    items: [
      {
        q: "How do I change my name or postcode?",
        a: "Scroll up in the Profile tab to Your Details, update your name or postcode and tap Save Changes.",
      },
      {
        q: "How do I change my password?",
        a: "In the Profile tab, scroll to Change Password, enter your new password twice and tap Update Password.",
      },
      {
        q: "How do I delete my account?",
        a: "To request account deletion, email us at hello@vercro.com. We'll remove your account and all associated data within 7 days.",
      },
      {
        q: "Is my data private?",
        a: "Yes. Your garden data, crop information and location are only used to power your personal Vercro experience. We do not sell your data or share it with third parties. Aggregated and anonymised growing data may be used in future to improve crop timing predictions for all users.",
      },
    ],
  },
];

function FAQSection() {
  const [openSection, setOpenSection] = useState(null);
  const [openItem,    setOpenItem]    = useState(null);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 12 }}>
        Help & FAQ
      </div>
      {FAQ_DATA.map((section, si) => (
        <div key={si} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
          {/* Section header */}
          <button onClick={() => { setOpenSection(openSection === si ? null : si); setOpenItem(null); }}
            style={{ width: "100%", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{section.emoji}</span>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>{section.section}</span>
            </div>
            <span style={{ fontSize: 12, color: C.stone }}>{openSection === si ? "▲" : "▼"}</span>
          </button>
          {/* FAQ items */}
          {openSection === si && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              {section.items.map((item, ii) => {
                const key = `${si}-${ii}`;
                const isOpen = openItem === key;
                return (
                  <div key={ii} style={{ borderBottom: ii < section.items.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <button onClick={() => setOpenItem(isOpen ? null : key)}
                      style={{ width: "100%", padding: "13px 16px", background: isOpen ? "#f6faf8" : "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, textAlign: "left" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.forest, flex: 1, lineHeight: 1.4 }}>{item.q}</span>
                      <span style={{ fontSize: 11, color: C.stone, flexShrink: 0, marginTop: 2 }}>{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: "0 16px 14px", fontSize: 13, color: C.stone, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Profile Screen ────────────────────────────────────────────────────────────

// =============================================================================
// PUSH NOTIFICATION SETTINGS + PERMISSION PROMPT
// =============================================================================

async function registerPushSubscription(publicKey) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    return sub;
  } catch(e) {
    console.error("[Push] Subscribe failed:", e);
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function NotificationPermissionCard({ onEnabled, onDismiss }) {
  const [loading, setLoading] = useState(false);

  const enable = async () => {
    setLoading(true);
    try {
      // Get VAPID public key
      const { publicKey } = await apiFetch("/notifications/vapid-key");
      if (!publicKey) throw new Error("Push not configured");

      // Request OS permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setLoading(false); onDismiss(); return; }

      // Register service worker subscription
      const sub = await registerPushSubscription(publicKey);
      if (!sub) throw new Error("Subscription failed");

      // Save token
      await apiFetch("/notifications/register-token", {
        method: "POST",
        body: JSON.stringify({ subscription: sub.toJSON(), platform: "web" }),
      });
      await apiFetch("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({
          push_enabled: true, due_today_enabled: true, coming_up_enabled: true,
          weather_alerts_enabled: true, pest_alerts_enabled: true,
          crop_checks_enabled: true, weekly_summary_enabled: true, milestones_enabled: true,
          morning_time_local: "07:00", evening_time_local: "18:00",
        }),
      });
      onEnabled();
    } catch(e) {
      console.error("[Push]", e);
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#f0f7f4", border: `1px solid ${C.sage}`, borderRadius: 14, padding: "18px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
        <span style={{ fontSize: 28, flexShrink: 0 }}>🔔</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: C.forest, marginBottom: 4 }}>Stay on top of your garden</div>
          <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.5 }}>
            Get timely reminders for frost alerts, feeding, harvesting and crop checks — when they matter, not all day long.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={enable} disabled={loading}
          style={{ flex: 1, background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Setting up…" : "Turn on notifications"}
        </button>
        <button onClick={onDismiss}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", color: C.stone, fontSize: 13, cursor: "pointer" }}>
          Not now
        </button>
      </div>
    </div>
  );
}

function NotificationSettingsSection() {
  const [prefs,   setPrefs]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    apiFetch("/notifications/preferences")
      .then(p => { setPrefs(p); setLoading(false); })
      .catch(() => setLoading(false));

    // Check if push is supported and not yet enabled
    if ("Notification" in window && Notification.permission === "default") {
      setShowPrompt(true);
    }
  }, []);

  const save = async (updates) => {
    setSaving(true);
    const newPrefs = { ...prefs, ...updates };
    setPrefs(newPrefs);
    try {
      await apiFetch("/notifications/preferences", { method: "PUT", body: JSON.stringify(updates) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch(e) { console.error(e); }
    setSaving(false);
  };

  const toggle = (key) => save({ [key]: !prefs[key] });

  if (loading) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Notifications</div>

      {/* Permission prompt if not yet enabled */}
      {showPrompt && !prefs?.push_enabled && (
        <NotificationPermissionCard
          onEnabled={() => { setShowPrompt(false); save({ push_enabled: true }); }}
          onDismiss={() => setShowPrompt(false)}
        />
      )}

      {/* Main push toggle */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>Push notifications</div>
            <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>
              {prefs?.push_enabled ? "Enabled — tap to manage settings below" : "Off — enable to get garden reminders"}
            </div>
          </div>
          <div onClick={() => {
            if (!prefs?.push_enabled && "Notification" in window) {
              setShowPrompt(true);
            } else {
              toggle("push_enabled");
            }
          }} style={{ width: 44, height: 24, borderRadius: 12, background: prefs?.push_enabled ? C.forest : C.border, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 2, left: prefs?.push_enabled ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
        </div>
      </div>

      {/* Detailed settings — only show if push enabled */}
      {prefs?.push_enabled && (
        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {[
            { key: "due_today_enabled",      label: "Garden tasks due today",       desc: "Feeding, sowing, harvesting and care tasks" },
            { key: "coming_up_enabled",       label: "Coming up soon",              desc: "Reminders a few days before key tasks" },
            { key: "weather_alerts_enabled",  label: "Frost and weather alerts",    desc: "Time-sensitive alerts for frost and heat" },
            { key: "pest_alerts_enabled",     label: "Pest and disease watch",      desc: "When conditions increase pest risk" },
            { key: "crop_checks_enabled",     label: "Quick crop checks",           desc: "Flowering, fruit set and condition prompts" },
            { key: "weekly_summary_enabled",  label: "Weekly garden summary",       desc: "Sunday evening roundup of the week ahead" },
            { key: "milestones_enabled",      label: "Milestones and achievements", desc: "Harvest milestones and badge unlocks" },
          ].map(({ key, label, desc }, i, arr) => (
            <div key={key} style={{ padding: "13px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{label}</div>
                <div style={{ fontSize: 11, color: C.stone, marginTop: 1 }}>{desc}</div>
              </div>
              <div onClick={() => toggle(key)}
                style={{ width: 36, height: 20, borderRadius: 10, background: prefs?.[key] ? C.forest : C.border, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: prefs?.[key] ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
            </div>
          ))}

          {/* Timing — fixed at 7am / 6pm, no user choice */}
          <div style={{ padding: "13px 16px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, color: C.stone }}>Reminders are sent at <strong style={{ color: "#1a1a1a" }}>7am</strong> and <strong style={{ color: "#1a1a1a" }}>6pm</strong></div>
          </div>
        </div>
      )}

      {saved && <div style={{ fontSize: 12, color: C.forest, textAlign: "center", marginTop: 8 }}>✓ Settings saved</div>}
    </div>
  );
}



// ── Time Away — Today screen banner ──────────────────────────────────────────
function TimeAwayTodayBanner({ blockedPeriods, onTabChange }) {
  const today = new Date().toISOString().split("T")[0];

  if (!blockedPeriods?.length) return null;

  // Find the most relevant period: active now, or starting within 7 days
  const active = blockedPeriods.find(p => p.start_date <= today && p.end_date >= today);
  const upcoming = blockedPeriods.find(p => {
    const daysUntil = Math.round((new Date(p.start_date) - new Date(today)) / 86400000);
    return daysUntil > 0 && daysUntil <= 7;
  });

  const period = active || upcoming;
  if (!period) return null;

  const isActive = active != null;
  const daysUntil = isActive ? 0 : Math.round((new Date(period.start_date) - new Date(today)) / 86400000);
  const daysLeft  = isActive ? Math.round((new Date(period.end_date) - new Date(today)) / 86400000) : null;

  const label = period.label || "Time away";
  const endStr = new Date(period.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const startStr = new Date(period.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div
      onClick={() => onTabChange("profile", { openTimeAway: true })}
      style={{
        background: isActive ? "#fff8ed" : "#f0f7f4",
        border: `1px solid ${isActive ? "#f59e0b" : "#86c9a0"}`,
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 12,
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>{isActive ? "✈️" : "🗓️"}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
            {isActive
              ? `You're marked away until ${endStr}`
              : `${label} starts in ${daysUntil} day${daysUntil !== 1 ? "s" : ""} (${startStr})`}
          </div>
          <div style={{ fontSize: 11, color: isActive ? "#b45309" : "#2d7a28", marginTop: 2 }}>
            {isActive
              ? (daysLeft != null && daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining — tasks have been adjusted` : "Last day away — tasks have been adjusted")
              : "Tasks have been adjusted around these dates"}
          </div>
        </div>
      </div>
      <span style={{ fontSize: 11, color: isActive ? "#b45309" : C.forest, fontWeight: 600, flexShrink: 0 }}>View →</span>
    </div>
  );
}

// =============================================================================
// TIME AWAY — COMPONENTS
// =============================================================================

function TimeAwaySection({ openOnMount = false, onOpened }) {
  const [periods,    setPeriods]    = useState(null);
  const [showScreen, setShowScreen] = useState(false);

  useEffect(() => {
    loadPeriods();
    if (openOnMount) {
      setShowScreen(true);
      if (onOpened) onOpened();
    }
  }, []);

  const loadPeriods = async () => {
    try {
      const data = await apiFetch("/blocked-periods");
      setPeriods(data || []);
    } catch (e) { setPeriods([]); }
  };

  const activePeriods = (periods || []).filter(p => p.status === "active");

  return (
    <>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: activePeriods.length > 0 ? 12 : 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Time away</div>
            <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>
              {activePeriods.length === 0
                ? "Going away? We'll adjust your tasks."
                : `${activePeriods.length} period${activePeriods.length > 1 ? "s" : ""} active`}
            </div>
          </div>
          <button onClick={() => setShowScreen(true)}
            style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {activePeriods.length > 0 ? "Manage" : "+ Add"}
          </button>
        </div>
        {activePeriods.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activePeriods.slice(0, 2).map(p => (
              <div key={p.id} style={{ background: "#fff8ed", border: `1px solid ${C.amber}`, borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{p.label || "Time away"}</span>
                <span style={{ color: C.stone, marginLeft: 6 }}>
                  {new Date(p.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} –{" "}
                  {new Date(p.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showScreen && (
        <TimeAwayScreen onClose={() => { setShowScreen(false); loadPeriods(); }} />
      )}
    </>
  );
}

function TimeAwayScreen({ onClose }) {
  const [periods,     setPeriods]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAdd,     setShowAdd]     = useState(false);
  const [summary,     setSummary]     = useState(null);
  const [adjustments, setAdjustments] = useState(null);
  const [form,        setForm]        = useState({ start_date: "", end_date: "", label: "" });
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);
  const [deleting,    setDeleting]    = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/blocked-periods");
      setPeriods(data || []);
    } catch (e) {}
    setLoading(false);
  };

  const save = async () => {
    if (!form.start_date || !form.end_date) { setError("Please set both dates"); return; }
    if (form.end_date < form.start_date) { setError("End date must be on or after start date"); return; }
    setSaving(true); setError(null);
    try {
      const result = await apiFetch("/blocked-periods", {
        method: "POST",
        body: JSON.stringify({ start_date: form.start_date, end_date: form.end_date, label: form.label || null }),
      });
      setSummary(result.summary);
      if (result.blockedPeriod?.id) {
        const detail = await apiFetch("/blocked-periods/" + result.blockedPeriod.id + "/adjustments").catch(() => null);
        if (detail) setAdjustments(detail.grouped);
      }
      setForm({ start_date: "", end_date: "", label: "" });
      setShowAdd(false);
      load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const remove = async (id) => {
    setDeleting(id);
    try {
      await apiFetch("/blocked-periods/" + id, { method: "DELETE" });
      setPeriods(p => p.filter(x => x.id !== id));
      setSummary(null); setAdjustments(null);
    } catch (e) {}
    setDeleting(null);
  };

  const LABEL_OPTIONS = ["Holiday", "Work trip", "Busy week", "Other"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#F7FAF8", zIndex: 2000, overflowY: "auto" }}>

      {/* ── Dark green hero header ── */}
      <div style={{ background: "#2F5D50" }}>
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "28px 20px 26px", position: "relative", overflow: "hidden" }}>
          {/* Decorative circles */}
          <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.055)", top: -50, right: -50 }} />
          <div style={{ position: "absolute", width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.04)", bottom: -24, left: 16 }} />

          {/* Back button */}
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 12, padding: 0, marginBottom: 20, position: "relative" }}>
            ← Profile
          </button>

          {/* Title block */}
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✈️</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", color: "#fff", lineHeight: 1.2, marginBottom: 6 }}>Time away</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.58)", lineHeight: 1.5, maxWidth: 280 }}>
              Tell us when you're unavailable — we'll adjust your tasks automatically.
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 20px 60px" }}>

        {/* Summary strip after add */}
        {summary && (
          <div style={{ background: "#f0f7f4", border: "1px solid #c4ddd2", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", marginBottom: 10 }}>✓ Your plan has been updated</div>

            {summary.total === 0 && (
              <div style={{ fontSize: 13, color: C.stone }}>No tasks fell in this date range.</div>
            )}

            {adjustments?.moved_earlier?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.forest, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                  ⬆ {adjustments.moved_earlier.length} task{adjustments.moved_earlier.length !== 1 ? "s" : ""} brought forward
                </div>
                {adjustments.moved_earlier.map((a, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < adjustments.moved_earlier.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{a.task?.crop?.name ? getCropEmoji(a.task.crop.name) + " " + a.task.crop.name : "Garden task"}</span>
                      <span style={{ fontSize: 12, color: C.stone }}> · {a.task?.action || a.task?.task_type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.forest, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                      {new Date(a.original_due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} → {new Date(a.adjusted_due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {adjustments?.moved_later?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                  ⬇ {adjustments.moved_later.length} task{adjustments.moved_later.length !== 1 ? "s" : ""} moved back
                </div>
                {adjustments.moved_later.map((a, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < adjustments.moved_later.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{a.task?.crop?.name ? getCropEmoji(a.task.crop.name) + " " + a.task.crop.name : "Garden task"}</span>
                      <span style={{ fontSize: 12, color: C.stone }}> · {a.task?.action || a.task?.task_type}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#b45309", fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                      {new Date(a.original_due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} → {new Date(a.adjusted_due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {adjustments?.at_risk?.length > 0 && (
              <div style={{ background: "#fff0f0", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.red, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                  ⚠ {adjustments.at_risk.length} task{adjustments.at_risk.length !== 1 ? "s" : ""} may need attention
                </div>
                {adjustments.at_risk.map((a, i) => (
                  <div key={i} style={{ padding: "5px 0", borderBottom: i < adjustments.at_risk.length - 1 ? "1px solid #fee2e2" : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                      {a.task?.crop?.name ? getCropEmoji(a.task.crop.name) + " " + a.task.crop.name : "Garden task"}
                      <span style={{ fontWeight: 400, color: C.stone }}> · {a.task?.action || a.task?.task_type}</span>
                      <span style={{ color: C.stone }}> · {new Date(a.original_due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    </div>
                    {a.metadata?.explanation && (
                      <div style={{ fontSize: 11, color: C.red, marginTop: 3, lineHeight: 1.4 }}>{a.metadata.explanation}</div>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 11, color: C.stone, marginTop: 8, lineHeight: 1.4 }}>
                  These tasks could not safely be moved. They may still need attention while you're away.
                </div>
              </div>
            )}

            {!adjustments && summary.total > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {summary.movedEarlier > 0 && <span style={{ fontSize: 12, color: C.forest, background: "#e8f5ee", borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>⬆ {summary.movedEarlier} moved earlier</span>}
                {summary.movedLater   > 0 && <span style={{ fontSize: 12, color: "#b45309", background: "#fff8ed", borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>⬇ {summary.movedLater} moved later</span>}
                {summary.atRisk       > 0 && <span style={{ fontSize: 12, color: C.red, background: "#fff0f0", borderRadius: 20, padding: "3px 10px", fontWeight: 600 }}>⚠ {summary.atRisk} at risk</span>}
              </div>
            )}
          </div>
        )}

        {/* Existing periods list */}
        {loading ? <Spinner /> : (
          <>
            {/* Empty state — card style from Option B */}
            {periods.length === 0 && !showAdd && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#f7faf8", border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ width: 46, height: 46, borderRadius: 10, background: "#E8F4EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  🏖️
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 3 }}>No time away added</div>
                  <div style={{ fontSize: 12, color: C.stone, lineHeight: 1.45 }}>Holidays, busy weeks, work trips — we handle the re-planning.</div>
                </div>
              </div>
            )}

            {/* Existing periods */}
            {periods.map(p => (
              <div key={p.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", fontFamily: "serif" }}>{p.label || "Time away"}</div>
                  <div style={{ fontSize: 13, color: C.stone, marginTop: 2 }}>
                    {new Date(p.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "long" })} –{" "}
                    {new Date(p.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
                <button onClick={() => remove(p.id)} disabled={deleting === p.id}
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, color: C.stone, cursor: "pointer" }}>
                  {deleting === p.id ? "..." : "Remove"}
                </button>
              </div>
            ))}
          </>
        )}

        {/* Add form */}
        {showAdd ? (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginTop: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 14 }}>Add time away</div>

            {error && (
              <div style={{ background: "#fff0f0", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red, marginBottom: 12 }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.stone, display: "block", marginBottom: 4 }}>FROM</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.stone, display: "block", marginBottom: 4 }}>TO</label>
                <input type="date" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.stone, display: "block", marginBottom: 6 }}>REASON (optional)</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {LABEL_OPTIONS.map(opt => (
                  <button key={opt} onClick={() => setForm(f => ({ ...f, label: f.label === opt ? "" : opt }))}
                    style={{ background: form.label === opt ? C.forest : C.offwhite, color: form.label === opt ? "#fff" : C.stone, border: `1px solid ${form.label === opt ? C.forest : C.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowAdd(false); setError(null); }}
                style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px", fontWeight: 600, fontSize: 13, cursor: "pointer", color: C.stone }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                style={{ flex: 2, background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "11px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "serif" }}>
                {saving ? "Adjusting plan..." : "Adjust my plan"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setShowAdd(true); setSummary(null); setAdjustments(null); }}
            style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "serif", marginTop: periods.length === 0 ? 0 : 8 }}>
            + Add time away
          </button>
        )}

      </div>
    </div>
  );
}

// ── Harvest Summary Card — grouped by crop with expandable individual records ──
function HarvestSummaryCard({ crop }) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = (v) => v >= 7 ? C.leaf : v >= 4 ? C.amber : C.red;

  const totalQty = crop.total_quantity_g;
  const qtyDisplay = totalQty ? (totalQty >= 1000 ? (totalQty / 1000).toFixed(1) + "kg" : totalQty + "g") : null;

  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 14, marginBottom: 14 }}>
      {/* Crop summary row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "serif", color: "#1a1a1a" }}>
            {getCropEmoji(crop.crop_name)} {crop.crop_name}{crop.variety ? ` — ${crop.variety}` : ""}
          </div>
          <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>
            {crop.harvest_count === 1 ? "1 harvest" : `${crop.harvest_count} harvests`}
            {qtyDisplay ? ` · ${qtyDisplay} total` : ""}
            {crop.harvest_count > 1 ? " · season averages shown" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {crop.avg_yield_score && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: scoreColor(crop.avg_yield_score) }}>{crop.avg_yield_score}</div>
              <div style={{ fontSize: 9, color: C.stone }}>Yield</div>
            </div>
          )}
          {crop.avg_quality_score && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: scoreColor(crop.avg_quality_score) }}>{crop.avg_quality_score}</div>
              <div style={{ fontSize: 9, color: C.stone }}>Quality</div>
            </div>
          )}
        </div>
      </div>

      {/* Expand/collapse individual harvests — only if more than 1 */}
      {crop.harvest_count > 1 && (
        <button onClick={() => setExpanded(e => !e)}
          style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: C.forest, fontWeight: 600, cursor: "pointer", marginBottom: expanded ? 8 : 0 }}>
          {expanded ? "▲ Hide individual harvests" : `▼ Show ${crop.harvest_count} individual harvests`}
        </button>
      )}

      {/* Individual harvest entries */}
      {(expanded || crop.harvest_count === 1) && crop.entries.map((e, i) => (
        <div key={e.id} style={{ background: "#f9f9f7", borderRadius: 8, padding: "10px 12px", marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: C.stone }}>
                {new Date(e.harvested_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {e.partial ? <span style={{ marginLeft: 6, color: C.amber, fontWeight: 600 }}>· partial</span> : ""}
              </div>
              {e.quantity_g && (
                <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>
                  {e.quantity_g >= 1000 ? (e.quantity_g / 1000).toFixed(1) + "kg" : e.quantity_g + "g"}
                </div>
              )}
              {e.notes && <div style={{ fontSize: 11, color: C.stone, marginTop: 2, fontStyle: "italic" }}>{e.notes}</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {e.yield_score && <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: scoreColor(e.yield_score) }}>{e.yield_score}</div><div style={{ fontSize: 9, color: C.stone }}>Yield</div></div>}
              {e.quality && <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: scoreColor(e.quality) }}>{e.quality}</div><div style={{ fontSize: 9, color: C.stone }}>Quality</div></div>}
            </div>
          </div>
          {e.photo_url && <img src={e.photo_url} alt="harvest" style={{ width: "100%", borderRadius: 6, marginTop: 8, maxHeight: 140, objectFit: "cover" }} />}
        </div>
      ))}
    </div>
  );
}

function ProfileScreen({ session, onTabChange, openTimeAway = false, onTimeAwayOpened }) {
  const PROFILE_CACHE = "vercro_profile_v1";
  const _cachedProfile = (() => { try { const c = localStorage.getItem(PROFILE_CACHE); if (c) { const { form, ts } = JSON.parse(c); if (Date.now() - ts < 10 * 60 * 1000) return form; } } catch(e) {} return null; })();
  const [form,       setForm]      = useState(_cachedProfile || { name: "", postcode: "" });
  const [pwForm,     setPwForm]    = useState({ current: "", next: "", confirm: "" });
  const [loading,    setLoading]   = useState(!_cachedProfile);
  const [saving,     setSaving]    = useState(false);
  const [pwSaving,   setPwSaving]  = useState(false);
  const [saved,      setSaved]     = useState(false);
  const [pwSaved,    setPwSaved]   = useState(false);
  const [error,      setError]     = useState(null);
  const [pwError,    setPwError]   = useState(null);
  const [harvests,   setHarvests]  = useState([]);
  const [logYear,    setLogYear]   = useState(new Date().getFullYear());
  const [logOpen,    setLogOpen]   = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [allHarvests, setAllHarvests] = useState([]);

  // Email preferences state
  const [marketingEmails,     setMarketingEmails]     = useState(true);
  const [emailPrefLoading,    setEmailPrefLoading]    = useState(false);
  const [emailPrefSaved,      setEmailPrefSaved]      = useState(false);

  // Delete account state
  const [showDeleteModal,     setShowDeleteModal]     = useState(false);
  const [deleteConfirmStep,   setDeleteConfirmStep]   = useState(1); // 1 = first modal, 2 = final confirm
  const [deleting,            setDeleting]            = useState(false);
  const [deleteError,         setDeleteError]         = useState(null);

  const loadHarvests = async (year) => {
    setLogLoading(true);
    try {
      const data = await apiFetch("/harvest-log/summary?year=" + year);
      setHarvests(data);
    } catch (e) { console.error(e); }
    setLogLoading(false);
  };

  const loadAllHarvests = async () => {
    try {
      const data = await apiFetch("/harvest-log/summary?year=" + new Date().getFullYear());
      setAllHarvests(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    apiFetch("/auth/profile")
      .then(p => {
        const f = { name: p.name || "", postcode: p.postcode || "", photo_url: p.photo_url || null };
        setForm(f);
        // email_unsubscribed is the inverse of marketing_emails_enabled
        setMarketingEmails(!p.email_unsubscribed);
        try { localStorage.setItem(PROFILE_CACHE, JSON.stringify({ form: f, ts: Date.now() })); } catch(e) {}
        setLoading(false);
      })
      .catch(() => setLoading(false));
    loadAllHarvests();
  }, []);

  useEffect(() => {
    if (logOpen) loadHarvests(logYear);
  }, [logOpen, logYear]);

  const saveProfile = async () => {
    if (!form.name.trim() || !form.postcode.trim()) return;
    setSaving(true); setError(null);
    try {
      await apiFetch("/auth/profile", { method: "POST", body: JSON.stringify(form) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const changePassword = async () => {
    setPwError(null);
    if (!pwForm.next.trim()) return;
    if (pwForm.next !== pwForm.confirm) { setPwError("Passwords don't match"); return; }
    if (pwForm.next.length < 8) { setPwError("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.next });
      if (error) throw new Error(error.message);
      setPwSaved(true);
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => setPwSaved(false), 3000);
    } catch (e) { setPwError(e.message); }
    setPwSaving(false);
  };

  const saveEmailPreference = async (enabled) => {
    setEmailPrefLoading(true);
    setMarketingEmails(enabled);
    try {
      await apiFetch("/auth/email-preferences", {
        method: "POST",
        body: JSON.stringify({ marketing_emails_enabled: enabled }),
      });
      setEmailPrefSaved(true);
      setTimeout(() => setEmailPrefSaved(false), 2500);
    } catch (e) {
      // Revert optimistic update on failure
      setMarketingEmails(!enabled);
    }
    setEmailPrefLoading(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch("/auth/account", { method: "DELETE" });
      // Sign out locally — auth record is gone server-side
      await supabase.auth.signOut();
    } catch (e) {
      setDeleteError(e.message || "Something went wrong. Please try again.");
      setDeleting(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", marginBottom: 24, color: "#1a1a1a" }}>Profile</div>

      {/* Profile photo */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <PhotoCircle photoUrl={form.photo_url} size={80} endpoint="/photos/profile"
          onUploaded={url => setForm(f => ({ ...f, photo_url: url }))} placeholder="👤" />
      </div>

      {/* Account info */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: C.stone, marginBottom: 2 }}>Signed in as</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{session?.user?.email}</div>
      </div>

      {/* Edit name + postcode */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px", marginBottom: 16, marginTop: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 16 }}>Your Details</div>
        {saved  && <div style={{ background: "#edf7ec", border: `1px solid ${C.leaf}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#2d7a28", fontWeight: 600, fontSize: 13 }}>✓ Saved</div>}
        {error  && <ErrorMsg msg={error} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Your name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. Mark" />
          </div>
          <div>
            <label style={labelStyle}>Postcode</label>
            <input value={form.postcode} onChange={e => setForm(f => ({ ...f, postcode: e.target.value.toUpperCase() }))} style={inputStyle} placeholder="e.g. TS22" />
            <div style={{ fontSize: 11, color: C.stone, marginTop: 4 }}>Enter the first part only — e.g. <strong>TS22</strong>, not TS22 5BQ</div>
          </div>
          <button onClick={saveProfile} disabled={saving} style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Change password */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 16 }}>Change Password</div>
        {pwSaved  && <div style={{ background: "#edf7ec", border: `1px solid ${C.leaf}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#2d7a28", fontWeight: 600, fontSize: 13 }}>✓ Password updated</div>}
        {pwError  && <ErrorMsg msg={pwError} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>New password</label>
            <input type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} style={inputStyle} placeholder="At least 8 characters" />
          </div>
          <div>
            <label style={labelStyle}>Confirm new password</label>
            <input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} style={inputStyle} placeholder="Repeat new password" />
          </div>
          <button onClick={changePassword} disabled={pwSaving} style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: pwSaving ? 0.6 : 1 }}>
            {pwSaving ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>

      {/* Yield Summary */}
      {allHarvests.length > 0 && (() => {
        const year = new Date().getFullYear();
        // allHarvests is now the grouped summary format
        const totalHarvests = allHarvests.reduce((sum, crop) => sum + crop.harvest_count, 0);
        const best = [...allHarvests].sort((a, b) => (b.avg_yield_score || 0) - (a.avg_yield_score || 0))[0];

        // Overall averages across all entries
        const allEntries = allHarvests.flatMap(c => c.entries);
        const allYields    = allEntries.map(e => e.yield_score).filter(Boolean);
        const allQualities = allEntries.map(e => e.quality).filter(Boolean);
        const avgYield   = allYields.length    ? Math.round(allYields.reduce((a,b) => a+b,0)    / allYields.length * 10) / 10    : null;
        const avgQuality = allQualities.length ? Math.round(allQualities.reduce((a,b) => a+b,0) / allQualities.length * 10) / 10 : null;

        const scoreColor = v => v >= 8 ? C.leaf : v >= 5 ? C.amber : C.red;

        return (
          <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, #1e3d33 100%)`, borderRadius: 14, padding: "20px", marginBottom: 16, color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -15, right: -15, width: 80, height: 80, borderRadius: "50%", background: C.accent, opacity: 0.1 }} />
            <div style={{ fontSize: 11, opacity: 0.65, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{year} Season</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "serif", marginBottom: 16 }}>Your Harvest Summary</div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{totalHarvests}</div>
                <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>Harvests</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: avgYield ? scoreColor(avgYield) : "#fff" }}>{avgYield || "—"}</div>
                <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>Avg Yield</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: avgQuality ? scoreColor(avgQuality) : "#fff" }}>{avgQuality || "—"}</div>
                <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>Avg Quality</div>
              </div>
            </div>

            {/* Best crop */}
            {best && (
              <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 28 }}>{getCropEmoji(best.crop_name)}</div>
                <div>
                  <div style={{ fontSize: 10, opacity: 0.65, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Best performing crop</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif" }}>{best.crop_name}</div>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>
                    Yield {best.avg_yield_score || "—"} · Quality {best.avg_quality_score || "—"} out of 10
                  </div>
                </div>
              </div>
            )}

            {/* Quality vs Yield bars */}
            {(avgYield || avgQuality) && (
              <div style={{ marginTop: 14 }}>
                {[{ label: "Yield", val: avgYield }, { label: "Quality", val: avgQuality }].filter(r => r.val).map(r => (
                  <div key={r.label} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, opacity: 0.75 }}>{r.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{r.val}/10</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 99 }}>
                      <div style={{ height: "100%", width: (r.val / 10 * 100) + "%", background: scoreColor(r.val), borderRadius: 99, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Harvest Log */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
        <button onClick={() => setLogOpen(o => !o)}
          style={{ width: "100%", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>🌾 My Harvest Log</div>
          <span style={{ color: C.stone, fontSize: 18 }}>{logOpen ? "▲" : "▼"}</span>
        </button>
        {logOpen && (
          <div style={{ padding: "0 16px 16px" }}>
            {/* Year selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map(y => (
                <button key={y} onClick={() => setLogYear(y)}
                  style={{ padding: "6px 16px", borderRadius: 20, border: `1px solid ${logYear === y ? C.forest : C.border}`, background: logYear === y ? C.forest : "none", color: logYear === y ? "#fff" : C.stone, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  {y}
                </button>
              ))}
            </div>
            {logLoading ? <Spinner /> : harvests.length === 0 ? (
              <div style={{ fontSize: 13, color: C.stone, textAlign: "center", padding: "16px 0" }}>No harvests logged for {logYear}</div>
            ) : (
              harvests.map((crop, ci) => (
                <HarvestSummaryCard key={crop.crop_instance_id || crop.crop_name + ci} crop={crop} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Challenges & Badges link */}
      <button onClick={() => onTabChange("badges")}
        style={{ width:"100%", background:C.cardBg, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>🏆</span>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#1a1a1a" }}>Challenges & Badges</div>
            <div style={{ fontSize:12, color:C.stone, marginTop:1 }}>Track progress and unlock garden rewards</div>
          </div>
        </div>
        <span style={{ color:C.stone, fontSize:16 }}>›</span>
      </button>

      {/* Notification Settings */}
      <NotificationSettingsSection />

      {/* Time Away */}
      <TimeAwaySection openOnMount={openTimeAway} onOpened={onTimeAwayOpened} />

      {/* FAQ Section */}
      <FAQSection />

      {/* Pro subscription section — only visible when PRO_ENABLED=true */}
      {PRO_ENABLED && <ProSubscriptionSection />}

      {/* Email preferences */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Email preferences</div>
            <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Manage product updates and marketing emails</div>
          </div>
          {/* Toggle */}
          <button
            onClick={() => !emailPrefLoading && saveEmailPreference(!marketingEmails)}
            style={{
              width: 44, height: 26, borderRadius: 13, border: "none", cursor: emailPrefLoading ? "default" : "pointer",
              background: marketingEmails ? C.forest : "#ccc",
              position: "relative", flexShrink: 0, transition: "background 0.2s", opacity: emailPrefLoading ? 0.6 : 1,
            }}>
            <span style={{
              position: "absolute", top: 3, left: marketingEmails ? 21 : 3,
              width: 20, height: 20, borderRadius: "50%", background: "#fff",
              transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>
        {emailPrefSaved && (
          <div style={{ padding: "8px 16px", background: "#edf7ec", borderTop: `1px solid ${C.leaf}`, fontSize: 12, color: "#2d7a28", fontWeight: 600 }}>
            ✓ {marketingEmails ? "You're subscribed to product updates" : "You've been unsubscribed from marketing emails"}
          </div>
        )}
      </div>

      {/* Sign out */}
      <button
        onClick={() => supabase.auth.signOut()}
        style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px", fontWeight: 600, fontSize: 14, cursor: "pointer", color: C.stone, marginBottom: 8 }}>
        Sign Out
      </button>

      {/* Delete account */}
      <button
        onClick={() => { setShowDeleteModal(true); setDeleteConfirmStep(1); setDeleteError(null); }}
        style={{ width: "100%", background: "none", border: `1px solid #fca5a5`, borderRadius: 10, padding: "12px", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#dc2626", marginBottom: 24 }}>
        Delete account
      </button>

      <div style={{ fontSize: 11, color: C.stone, textAlign: "center", marginBottom: 32 }}>Vercro — version 1.0</div>

      {/* ── Delete account modal ─────────────────────────────────────────── */}
      {showDeleteModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
          onClick={e => { if (e.target === e.currentTarget && !deleting) { setShowDeleteModal(false); setDeleteConfirmStep(1); } }}>
          <div style={{
            background: "#fff", borderRadius: "20px 20px 0 0", padding: "28px 24px 40px",
            width: "100%", maxWidth: 480, boxSizing: "border-box",
          }}>
            {deleteConfirmStep === 1 ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 12 }}>
                  Delete account?
                </div>
                <div style={{ fontSize: 14, color: "#444", lineHeight: 1.6, marginBottom: 24 }}>
                  This will permanently delete your Vercro account and personal profile data. We may retain anonymised gardening activity data to help improve Vercro.
                </div>
                <button
                  onClick={() => setDeleteConfirmStep(2)}
                  style={{ width: "100%", background: "#dc2626", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 10 }}>
                  Continue
                </button>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px", fontWeight: 600, fontSize: 15, cursor: "pointer", color: C.stone }}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "serif", color: "#dc2626", marginBottom: 12 }}>
                  Are you sure?
                </div>
                <div style={{ fontSize: 14, color: "#444", lineHeight: 1.6, marginBottom: 8 }}>
                  This cannot be undone. Your account, profile, and all personal data will be permanently removed.
                </div>
                {deleteError && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#dc2626", fontSize: 13 }}>
                    {deleteError}
                  </div>
                )}
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  style={{ width: "100%", background: "#dc2626", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 700, fontSize: 15, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1, marginBottom: 10 }}>
                  {deleting ? "Deleting…" : "Yes, delete my account"}
                </button>
                <button
                  onClick={() => { setDeleteConfirmStep(1); setDeleteError(null); }}
                  disabled={deleting}
                  style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px", fontWeight: 600, fontSize: 15, cursor: "pointer", color: C.stone }}>
                  Go back
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Pro Subscription Section ─────────────────────────────────────────────────
// Shows in Profile when PRO_ENABLED=true.
// Free users see upgrade prompt. Pro users see their plan status + manage link.

function ProSubscriptionSection() {
  const { isPro, plan, loading } = useProStatus();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [manageLoading,   setManageLoading]   = useState(false);

  const handleUpgrade = async (priceType = "early") => {
    setCheckoutLoading(true);
    try {
      const data = await apiFetch("/subscription/create-checkout", {
        method: "POST",
        body: JSON.stringify({ price_type: priceType }),
      });
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error("Checkout error:", e);
    }
    setCheckoutLoading(false);
  };

  const handleManage = async () => {
    setManageLoading(true);
    try {
      const data = await apiFetch("/subscription/manage");
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      console.error("Manage error:", e);
    }
    setManageLoading(false);
  };

  if (loading) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
        Subscription
      </div>

      {isPro ? (
        <div style={{ background: "#f0f7f4", border: `1px solid ${C.sage}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 24 }}>🌱</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>Vercro Pro</div>
              <div style={{ fontSize: 12, color: C.stone }}>All features unlocked</div>
            </div>
          </div>
          <button
            onClick={handleManage}
            disabled={manageLoading}
            style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, color: C.stone, cursor: "pointer" }}>
            {manageLoading ? "Loading…" : "Manage subscription"}
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px" }}>
          <div style={{ fontFamily: "serif", fontSize: 17, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>
            Vercro Pro
          </div>
          <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.6, marginBottom: 16 }}>
            Unlimited plant diagnosis, smart garden planning, rotation automation and yield insights.
          </div>

          <div style={{ marginBottom: 16 }}>
            {[
              "📸 Unlimited Plant Check",
              "📐 Smart garden planning",
              "🔄 Crop rotation automation",
              "📊 Yield & ROI insights",
            ].map(item => (
              <div key={item} style={{ fontSize: 13, color: "#1a1a1a", padding: "4px 0", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: C.leaf, fontWeight: 700 }}>✓</span> {item}
              </div>
            ))}
          </div>

          <button
            onClick={() => handleUpgrade("early")}
            disabled={checkoutLoading}
            style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "serif", marginBottom: 8 }}>
            {checkoutLoading ? "Loading…" : "Start Pro — £49/year"}
          </button>
          <div style={{ fontSize: 11, color: C.stone, textAlign: "center" }}>
            Early supporter price · cancel anytime
          </div>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// PLANT CHECK (DIAGNOSIS) — Full Flow
// Entry points: Today screen (floating button + feed card) + Crop detail page
// Flow: crop picker → camera/library → processing → result → confirm update
// Free: 3 lifetime diagnoses. Mark's account: always Pro (unlimited).
// =============================================================================

// ── Crop picker for Plant Check ───────────────────────────────────────────────
function PlantCheckCropPicker({ onSelect, onClose, prefillCropId = null }) {
  const [crops,   setCrops]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    apiFetch("/crops")
      .then(data => {
        setCrops(data || []);
        // If a crop is prefilled, auto-select it immediately
        if (prefillCropId && data?.length) {
          const found = data.find(c => c.id === prefillCropId);
          if (found) { onSelect(found); return; }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = crops.filter(c => {
    if (!search.trim()) return true;
    return (c.name || "").toLowerCase().includes(search.toLowerCase());
  });

  // Sort: today's crops first (those with tasks due today), then alphabetical
  const today = new Date().toISOString().split("T")[0];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#ddd" }} />
        </div>

        <div style={{ padding: "8px 20px 12px" }}>
          <div style={{ fontFamily: "serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>🔍 Which crop?</div>
          <div style={{ fontSize: 13, color: C.stone, marginBottom: 12 }}>Select the crop you want to check</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search crops…"
            autoFocus
            style={{ ...inputStyle, marginBottom: 0 }}
          />
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "0 20px 32px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 32, color: C.stone, fontSize: 14 }}>Loading your crops…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: C.stone, fontSize: 14 }}>No crops found</div>
          ) : (
            filtered.map(crop => (
              <button key={crop.id} onClick={() => onSelect(crop)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{getCropEmoji(crop.name)}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", fontFamily: "serif" }}>{crop.name}</div>
                  <div style={{ fontSize: 12, color: C.stone }}>
                    {crop.area?.name || ""}
                    {crop.variety ? ` · ${typeof crop.variety === "object" ? crop.variety.name : crop.variety}` : ""}
                    {crop.stage ? ` · ${crop.stage}` : ""}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Photo source picker ───────────────────────────────────────────────────────
function PlantCheckPhotoPicker({ onPhoto, onClose }) {
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(",")[1];
      onPhoto(base64);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 710, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "20px 24px 48px" }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#ddd" }} />
        </div>

        <div style={{ fontFamily: "serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 4, textAlign: "center" }}>Take or choose a photo</div>
        <div style={{ fontSize: 13, color: C.stone, textAlign: "center", marginBottom: 24 }}>Get a clear shot of the affected leaves, stems or fruit</div>

        {/* Camera */}
        <button onClick={() => cameraRef.current?.click()}
          style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 14, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "serif", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          📷 Take a photo
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />

        {/* Library */}
        <button onClick={() => fileRef.current?.click()}
          style={{ width: "100%", background: "#fff", color: C.forest, border: `2px solid ${C.forest}`, borderRadius: 14, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "serif", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          🖼️ Choose from library
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />

        <button onClick={onClose}
          style={{ width: "100%", background: "none", border: "none", color: C.stone, fontSize: 14, cursor: "pointer", padding: 8 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Diagnosis result screen ───────────────────────────────────────────────────
function PlantCheckResult({ result, crop, onClose, onConfirmUpdate, onDone }) {
  const [updating,     setUpdating]     = useState(false);
  const [updated,      setUpdated]      = useState(false);
  const [updateError,  setUpdateError]  = useState(null);

  const severityColor = {
    low:    "#7FB069",
    medium: "#D9A441",
    high:   "#C65A5A",
  }[result.severity] || C.stone;

  const severityBg = {
    low:    "#f0f9eb",
    medium: "#fdf6e3",
    high:   "#fdf0f0",
  }[result.severity] || "#f5f5f5";

  const readinessEmoji = {
    ready:     "✅",
    soon:      "🟡",
    not_ready: "⏳",
  }[result.harvest_readiness] || "";

  const handleConfirmUpdate = async () => {
    setUpdating(true);
    setUpdateError(null);
    try {
      await onConfirmUpdate(result);
      setUpdated(true);
    } catch(e) {
      console.error("[PlantCheck] Confirm update failed:", e.message);
      setUpdateError("Couldn't update crop record — please try again");
    }
    setUpdating(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 720, background: "#fff", overflowY: "auto" }}>
      {/* Header */}
      <div style={{ background: C.forest, color: "#fff", padding: "20px 20px 16px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 13, cursor: "pointer" }}>← Back</button>
          <div>
            <div style={{ fontFamily: "serif", fontSize: 17, fontWeight: 700 }}>Plant Check</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{getCropEmoji(crop.name)} {crop.name}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 20px 100px" }}>

        {/* Overall summary */}
        <div style={{ background: result.looks_healthy ? "#f0f9f4" : severityBg, border: `1px solid ${result.looks_healthy ? C.sage : severityColor}`, borderRadius: 16, padding: "18px", marginBottom: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>
            {result.looks_healthy ? "🌿" : result.severity === "high" ? "🚨" : result.severity === "medium" ? "⚠️" : "ℹ️"}
          </div>
          <div style={{ fontFamily: "serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>
            {result.looks_healthy
              ? "Looking healthy!"
              : result.problem_name || "Issue detected"}
          </div>
          <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6 }}>
            {result.reasoning_summary}
          </div>
          {result.severity && !result.looks_healthy && (
            <div style={{ display: "inline-block", marginTop: 10, background: severityColor + "22", color: severityColor, borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {result.severity} severity
            </div>
          )}
        </div>

        {/* Harvest readiness */}
        {result.harvest_readiness && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Harvest readiness</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{readinessEmoji}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", textTransform: "capitalize" }}>
                  {result.harvest_readiness === "not_ready" ? "Not ready yet" : result.harvest_readiness === "soon" ? "Ready soon" : "Ready to harvest"}
                </div>
                {result.harvest_readiness_detail && (
                  <div style={{ fontSize: 13, color: C.stone, marginTop: 2 }}>{result.harvest_readiness_detail}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stage detection */}
        {result.stage_detected && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Growth stage detected</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15, color: C.forest, textTransform: "capitalize" }}>{result.stage_detected}</span>
                {result.stage_confidence && <span style={{ fontSize: 12, color: C.stone, marginLeft: 8 }}>({result.stage_confidence} confidence)</span>}
              </div>
              {!result.stage_matches_record && result.stage_detected && (
                <span style={{ fontSize: 11, background: "#fff3cd", color: "#856404", borderRadius: 8, padding: "3px 8px", fontWeight: 600 }}>Differs from record</span>
              )}
            </div>
          </div>
        )}

        {/* Yield impact — Pro only */}
        {result.yield_impact_pct !== null && result.yield_impact_pct !== undefined && (
          <div style={{ background: result.yield_impact_pct < -20 ? "#fdf0f0" : "#fff", border: `1px solid ${result.yield_impact_pct < -20 ? "#C65A5A44" : C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Estimated yield impact</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "serif", fontSize: 22, fontWeight: 700, color: result.yield_impact_pct < 0 ? C.red : C.leaf }}>
                {result.yield_impact_pct}%
              </span>
              {result.quality_impact && result.quality_impact !== "none" && (
                <span style={{ fontSize: 12, color: C.stone }}>· Quality impact: {result.quality_impact}</span>
              )}
            </div>
          </div>
        )}

        {/* Problem description */}
        {result.problem_description && !result.looks_healthy && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>What we can see</div>
            <div style={{ fontSize: 14, color: "#1a1a1a", lineHeight: 1.6 }}>{result.problem_description}</div>
          </div>
        )}

        {/* Treatment steps */}
        {result.treatment_steps?.length > 0 && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>What to do now</div>
            {result.treatment_steps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < result.treatment_steps.length - 1 ? 10 : 0 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.forest, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                <div style={{ fontSize: 14, color: "#1a1a1a", lineHeight: 1.5, flex: 1 }}>{step}</div>
              </div>
            ))}
          </div>
        )}

        {/* Prevention tips */}
        {result.prevention_tips?.length > 0 && (
          <div style={{ background: "#f8faf6", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Prevention</div>
            {result.prevention_tips.map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: i < result.prevention_tips.length - 1 ? 8 : 0 }}>
                <span style={{ color: C.leaf, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>✓</span>
                <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.5 }}>{tip}</div>
              </div>
            ))}
          </div>
        )}

        {/* Confirm update prompt */}
        {result.requires_confirmation && !updated && (
          <div style={{ background: "#f0f7ff", border: "1px solid #b3d4f5", borderRadius: 14, padding: "16px", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1a3a5c", marginBottom: 12, lineHeight: 1.5 }}>
              {result.confirmation_prompt || `Update ${crop.name} record with detected stage?`}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleConfirmUpdate} disabled={updating}
                style={{ flex: 1, background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "serif" }}>
                {updating ? "Updating…" : "Yes, update record"}
              </button>
              <button onClick={() => setUpdated(true)}
                style={{ flex: 1, background: "#fff", color: C.stone, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                No thanks
              </button>
            </div>
            {updateError && (
              <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{updateError}</div>
            )}
          </div>
        )}

        {updated && (
          <div style={{ background: "#f0f9f4", border: `1px solid ${C.sage}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, fontSize: 14, color: C.forest, fontWeight: 600 }}>
            ✓ Crop record updated
          </div>
        )}

        {/* Diagnoses remaining count */}
        {result.diagnoses_remaining !== null && result.diagnoses_remaining !== undefined && (
          <div style={{ textAlign: "center", fontSize: 12, color: C.stone, marginBottom: 16 }}>
            {result.diagnoses_remaining === 0
              ? "You've used all 3 free plant checks"
              : `${result.diagnoses_remaining} free plant check${result.diagnoses_remaining !== 1 ? "s" : ""} remaining`}
          </div>
        )}

        <button onClick={onDone}
          style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
          Done
        </button>
      </div>
    </div>
  );
}

// ── Main Plant Check orchestrator ─────────────────────────────────────────────
// Manages the full flow: crop picker → photo picker → processing → result
// entry: "today" | "crop" | "task"
// prefillCrop: crop object to skip picker (crop page / task entry)
function PlantCheck({ entry = "today", prefillCrop = null, onClose, onDone }) {
  const [step,       setStep]       = useState(prefillCrop ? "photo" : "crop");
  const [crop,       setCrop]       = useState(prefillCrop);
  const [processing, setProcessing] = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);
  const { isPro, isProForDiagnosis } = useProStatus();

  // Check lifetime usage for free users
  const [usageCount, setUsageCount] = useState(null);
  useEffect(() => {
    // Use isProForDiagnosis — plan-based check, ignores PRO_ENABLED flag.
    // This ensures paid users are never blocked and free users always see accurate counts.
    if (isProForDiagnosis) return;
    apiFetch("/diagnoses/count").then(d => setUsageCount(d?.count || 0)).catch(() => {});
  }, [isProForDiagnosis]);

  const handleCropSelect = (selectedCrop) => {
    setCrop(selectedCrop);
    setStep("photo");
  };

  const handlePhoto = async (base64) => {
    // Gate on isProForDiagnosis — plan-based, not flag-based
    if (!isProForDiagnosis && usageCount >= 3) {
      setStep("paywall");
      return;
    }

    setStep("processing");
    setError(null);

    try {
      const data = await apiFetch("/diagnoses/analyze", {
        method: "POST",
        body: JSON.stringify({
          crop_instance_id: crop.id,
          image: base64,
        }),
      });

      if (data.upgrade_required) {
        setStep("paywall");
        return;
      }

      setResult(data);
      setStep("result");
    } catch (e) {
      if (e.message?.includes("upgrade_required") || e.message?.includes("free plant checks")) {
        setStep("paywall");
        return;
      }
      setError(e.message || "Something went wrong — please try again");
      setStep("photo");
    }
  };

  const handleConfirmUpdate = async (diagResult) => {
    if (!crop?.id) return;
    // Build the observation payload based on what was detected
    const payload = { observation_type: "plant_check" };
    if (diagResult.stage_detected) {
      payload.confirmed_stage = diagResult.stage_detected;
      payload.symptom_code = {
        seedling:   "seedling_emerged",
        vegetative: "vegetative_confirmed",
        flowering:  "flowering_confirmed",
        fruiting:   "fruit_set_confirmed",
        harvesting: "harvest_started",
      }[diagResult.stage_detected] || null;
    }
    if (diagResult.harvest_readiness === "ready") {
      payload.symptom_code = "harvest_started";
      payload.confirmed_stage = "harvesting";
    }
    await apiFetch(`/crops/${crop.id}/observe`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  };

  // ── STEP: crop picker ─────────────────────────────────────────────────────
  if (step === "crop") {
    return (
      <PlantCheckCropPicker
        onSelect={handleCropSelect}
        onClose={onClose}
        prefillCropId={prefillCrop?.id}
      />
    );
  }

  // ── STEP: photo picker ────────────────────────────────────────────────────
  if (step === "photo") {
    return (
      <>
        {error && (
          <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 800, background: C.red, color: "#fff", padding: "10px 16px", borderRadius: 10, fontSize: 13, maxWidth: "90vw", textAlign: "center" }}>
            {error}
          </div>
        )}
        <PlantCheckPhotoPicker onPhoto={handlePhoto} onClose={onClose} />
      </>
    );
  }

  // ── STEP: processing ──────────────────────────────────────────────────────
  if (step === "processing") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 720, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 52, marginBottom: 24, animation: "pulse 1.5s infinite" }}>🔬</div>
        <div style={{ fontFamily: "serif", fontSize: 20, fontWeight: 700, color: C.forest, marginBottom: 10, textAlign: "center" }}>Analysing your {crop?.name || "plant"}…</div>
        <div style={{ fontSize: 14, color: C.stone, textAlign: "center", lineHeight: 1.6, maxWidth: 280 }}>
          Checking for issues, growth stage, and harvest readiness
        </div>
        <div style={{ marginTop: 32, display: "flex", gap: 6 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: C.forest, opacity: 0.3, animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
          ))}
        </div>
        <style>{`
          @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
          @keyframes bounce { 0%,100%{opacity:0.3;transform:translateY(0)} 50%{opacity:1;transform:translateY(-4px)} }
        `}</style>
      </div>
    );
  }

  // ── STEP: result ──────────────────────────────────────────────────────────
  if (step === "result" && result) {
    return (
      <PlantCheckResult
        result={result}
        crop={crop}
        onClose={() => setStep("photo")}
        onConfirmUpdate={handleConfirmUpdate}
        onDone={onDone || onClose}
      />
    );
  }

  // ── STEP: paywall ─────────────────────────────────────────────────────────
  if (step === "paywall") {
    return <ProPaywall trigger="diagnosis" onClose={onClose} />;
  }

  return null;
}

// ── Pro Paywall Component ─────────────────────────────────────────────────────
// Shown as a bottom sheet when user hits a Pro feature limit.
// Only renders when PRO_ENABLED=true — pass null/undefined to hide.
// Usage: <ProPaywall trigger="diagnosis" onClose={() => setShowPaywall(false)} />

function ProPaywall({ trigger, onClose }) {
  const [loading, setLoading] = useState(false);

  // Diagnosis paywall always works — users need an upgrade path when they hit
  // their 3 free checks, even while the broader Pro UI is still hidden.
  // All other paywall triggers (plans, default etc) respect the PRO_ENABLED flag.
  const diagnosisOnly = trigger === "diagnosis";
  if (!diagnosisOnly && (!PRO_ENABLED || !trigger)) return null;
  if (!trigger) return null;

  const MESSAGES = {
    diagnosis: {
      title:  "Unlimited Plant Check",
      body:   "You've used your 3 free plant checks. Upgrade to Pro for unlimited diagnosis, harvest readiness detection, and treatment plans.",
      cta:    "Unlock unlimited Plant Check",
    },
    plans: {
      title:  "Save your garden plans",
      body:   "Save and compare multiple garden layouts, reuse them next season, and track your performance over time.",
      cta:    "Unlock garden planning",
    },
    default: {
      title:  "Grow better with Pro",
      body:   "Unlock unlimited plant diagnosis, smart planning, rotation automation and yield insights.",
      cta:    "Upgrade to Pro",
    },
  };

  const msg = MESSAGES[trigger] || MESSAGES.default;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/subscription/create-checkout", {
        method: "POST",
        body: JSON.stringify({ price_type: "early" }),
      });
      if (data?.url) window.location.href = data.url;
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "28px 24px 48px", width: "100%", maxWidth: 480 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🌱</div>
          <div style={{ fontFamily: "serif", fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
            {msg.title}
          </div>
          <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6 }}>
            {msg.body}
          </div>
        </div>

        <div style={{ background: "#f5f9f7", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Vercro Pro</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.forest }}>£3.99/mo</div>
          </div>
          <div style={{ fontSize: 12, color: C.stone }}>or £39/year · early supporter price · cancel anytime</div>
        </div>

        <button
          onClick={handleUpgrade}
          disabled={loading}
          style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "serif", marginBottom: 10 }}>
          {loading ? "Loading…" : msg.cta}
        </button>
        <button
          onClick={onClose}
          style={{ width: "100%", background: "none", border: "none", color: C.stone, fontSize: 13, cursor: "pointer", padding: "8px" }}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

// ── My Feeds ──────────────────────────────────────────────────────────────────

const KNOWN_BRANDS = [
  "Chempak","Westland","Miracle-Gro","Vitax","Yara","Maxicrop","Levington","Phostrogen","RHS","Other"
];

function FeedsScreen() {
  const FEEDS_CACHE = "vercro_feeds_v1";
  const _cachedFeeds = (() => { try { const c = localStorage.getItem(FEEDS_CACHE); if (c) { const { feeds, catalog, ts } = JSON.parse(c); if (Date.now() - ts < 5 * 60 * 1000) return { feeds, catalog }; } } catch(e) {} return null; })();
  const [feeds,    setFeeds]    = useState(_cachedFeeds?.feeds || []);
  const [catalog,  setCatalog]  = useState(_cachedFeeds?.catalog || []);
  const [loading,  setLoading]  = useState(!_cachedFeeds);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [added,    setAdded]    = useState(false);
  const [brand,    setBrand]    = useState("");
  const [otherBrand, setOtherBrand] = useState("");
  const [showFeedScanner, setShowFeedScanner] = useState(false);
  const [scannedBarcode,  setScannedBarcode]  = useState(null);
  const [isLiquid, setIsLiquid] = useState(null);
  const [product,  setProduct]  = useState("");
  const [otherProduct, setOtherProduct] = useState("");

  const load = async () => {
    try {
      const [feedData, catalogData] = await Promise.all([
        apiFetch("/feeds"),
        apiFetch("/feed-catalog"),
      ]);
      setFeeds(feedData);
      setCatalog(catalogData);
      try { localStorage.setItem(FEEDS_CACHE, JSON.stringify({ feeds: feedData, catalog: catalogData, ts: Date.now() })); } catch(e) {}
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Derive effective brand/form for filtering
  const effectiveBrand = brand === "Other" ? null : brand;
  const effectiveForm  = isLiquid === true ? "liquid" : isLiquid === false ? ["granular","powder","pellet"] : null;

  // Filter catalog to matching products
  const filteredProducts = catalog.filter(c => {
    if (effectiveBrand && c.brand !== effectiveBrand) return false;
    if (isLiquid === true  && c.form !== "liquid") return false;
    if (isLiquid === false && c.form === "liquid") return false;
    return true;
  });

  const productOptions = [...new Set(filteredProducts.map(c => c.product_name)), "Other"];

  // Find the matched catalog entry for the selected product
  const matchedCatalog = catalog.find(c =>
    c.brand === effectiveBrand && c.product_name === product && product !== "Other"
  );

  const canAdd = brand && isLiquid !== null && (
    (product && product !== "Other") ||
    (product === "Other" && otherProduct.trim())
  ) || (brand === "Other" && otherBrand.trim() && isLiquid !== null && otherProduct.trim());

  const addFeed = async () => {
    if (!canAdd) return;
    setSaving(true);
    try {
      const finalBrand   = brand === "Other" ? otherBrand.trim() : brand;
      const finalProduct = product === "Other" ? otherProduct.trim() : product;

      if (matchedCatalog) {
        // Known product — save directly with all data, no enrichment needed
        await apiFetch("/feeds", {
          method: "POST",
          body: JSON.stringify({
            brand:                 matchedCatalog.brand,
            product_name:          matchedCatalog.product_name,
            form:                  matchedCatalog.form,
            feed_type:             matchedCatalog.feed_type,
            npk:                   matchedCatalog.npk,
            dilution_ml_per_litre: matchedCatalog.dilution_ml_per_litre,
            frequency_days:        matchedCatalog.frequency_days,
            suitable_crop_types:   matchedCatalog.suitable_crop_types,
            application_method:    matchedCatalog.application_method,
            notes:                 matchedCatalog.notes,
            pre_enriched:          true,
            barcode:               scannedBarcode || null,
          }),
        });
      } else {
        // Unknown product — send for enrichment
        await apiFetch("/feeds", {
          method: "POST",
          body: JSON.stringify({
            brand:        finalBrand || null,
            product_name: finalProduct,
            form:         isLiquid ? "liquid" : "granular",
          }),
        });
      }

      // Reset form
      setBrand(""); setOtherBrand(""); setIsLiquid(null);
      setProduct(""); setOtherProduct("");
      try { localStorage.removeItem(FEEDS_CACHE); } catch(e) {}
      setAdded(true);
      setTimeout(() => setAdded(false), 4000);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteFeed = async (id) => {
    try {
      await apiFetch(`/feeds/${id}`, { method: "DELETE" });
      setFeeds(f => f.filter(x => x.id !== id));
    } catch (e) { setError(e.message); }
  };

  const feedTypeLabel = (ft) => {
    const map = {
      high_potash: "High Potash", balanced: "Balanced", high_nitrogen: "High Nitrogen",
      low_nitrogen: "Low Nitrogen", specialist_tomato: "Tomato Feed", specialist_rose: "Rose Feed",
      seaweed: "Seaweed", organic_general: "Organic General",
    };
    return map[ft] || ft || "Unknown";
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>My Feeds</div>
        <div style={{ fontSize: 13, color: C.stone, marginTop: 2 }}>Register the feeds you own — we'll personalise your feeding tasks</div>
      </div>

      {error && <ErrorMsg msg={error} />}

      {showFeedScanner && (
        <BarcodeScanner
          mode="feed"
          onClose={() => setShowFeedScanner(false)}
          onResult={r => {
            setShowFeedScanner(false);
            if (r.found) {
              setBrand(r.brand || "Other");
              setOtherBrand(r.brand || "");
              setIsLiquid(r.form === "liquid");
              setProduct(r.product_name || "Other");
              setOtherProduct(r.product_name ? "" : r.name);
              setScannedBarcode(r.barcode || null);
            }
          }}
        />
      )}

      {/* Add feed form */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Add a Feed</div>
          <button onClick={() => setShowFeedScanner(true)}
            style={{ background: C.offwhite, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, color: C.forest, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            📷 Scan product
          </button>
        </div>
        {added && <div style={{ background: "#edf7ec", border: `1px solid ${C.leaf}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#2d7a28", fontWeight: 600, fontSize: 13 }}>✓ Feed added</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Brand */}
          <div>
            <label style={labelStyle}>Brand</label>
            <select value={brand} onChange={e => { setBrand(e.target.value); setProduct(""); setOtherProduct(""); }} style={inputStyle}>
              <option value="">Select brand…</option>
              {KNOWN_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {brand === "Other" && (
            <div>
              <label style={labelStyle}>Brand name</label>
              <input value={otherBrand} onChange={e => setOtherBrand(e.target.value)} style={inputStyle} placeholder="Enter brand name" />
            </div>
          )}

          {/* Liquid or not */}
          {brand && (
            <div>
              <label style={labelStyle}>Is it a liquid feed?</label>
              <div style={{ display: "flex", gap: 10 }}>
                {[{ label: "Yes — liquid", val: true }, { label: "No — granular / powder", val: false }].map(opt => (
                  <button key={String(opt.val)} onClick={() => { setIsLiquid(opt.val); setProduct(""); setOtherProduct(""); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${isLiquid === opt.val ? C.forest : C.border}`, background: isLiquid === opt.val ? C.forest : C.cardBg, color: isLiquid === opt.val ? "#fff" : "#1a1a1a", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product */}
          {brand && isLiquid !== null && (
            <div>
              <label style={labelStyle}>Product</label>
              {productOptions.length > 1 ? (
                <select value={product} onChange={e => setProduct(e.target.value)} style={inputStyle}>
                  <option value="">Select product…</option>
                  {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <select value="Other" onChange={() => setProduct("Other")} style={inputStyle}>
                  <option value="Other">Other (not listed)</option>
                </select>
              )}
            </div>
          )}
          {product === "Other" && (
            <div>
              <label style={labelStyle}>Product name</label>
              <input value={otherProduct} onChange={e => setOtherProduct(e.target.value)} style={inputStyle} placeholder="Enter product name" />
            </div>
          )}

          {/* Preview for known products */}
          {matchedCatalog && (
            <div style={{ background: "#f0f7f4", border: `1px solid ${C.sage}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.forest, marginBottom: 6 }}>✓ Product identified</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: 11, background: "#e8f0fe", color: "#3a5fc8", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>{feedTypeLabel(matchedCatalog.feed_type)}</span>
                <span style={{ fontSize: 11, background: C.offWhite, color: C.stone, borderRadius: 6, padding: "2px 8px" }}>{matchedCatalog.form}</span>
                {matchedCatalog.npk && <span style={{ fontSize: 11, background: C.offWhite, color: C.stone, borderRadius: 6, padding: "2px 8px" }}>NPK {matchedCatalog.npk}</span>}
                {matchedCatalog.dilution_ml_per_litre && <span style={{ fontSize: 11, background: C.offWhite, color: C.stone, borderRadius: 6, padding: "2px 8px" }}>{matchedCatalog.dilution_ml_per_litre}ml/L</span>}
                {matchedCatalog.frequency_days && <span style={{ fontSize: 11, background: C.offWhite, color: C.stone, borderRadius: 6, padding: "2px 8px" }}>Every {matchedCatalog.frequency_days} days</span>}
              </div>
              {matchedCatalog.notes && <div style={{ fontSize: 12, color: C.stone, marginTop: 6 }}>{matchedCatalog.notes}</div>}
            </div>
          )}
          {product === "Other" && otherProduct.trim() && (
            <div style={{ background: "#fdf8ec", border: `1px solid ${C.amber}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.stone }}>
              🔍 We'll look this one up and fill in the details automatically
            </div>
          )}

          <button onClick={addFeed} disabled={saving || !canAdd}
            style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: (saving || !canAdd) ? 0.5 : 1, fontFamily: "serif" }}>
            {saving ? "Adding…" : "Add Feed"}
          </button>
        </div>
      </div>

      {/* Feed list */}
      {feeds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px", color: C.stone, fontSize: 14 }}>
          No feeds added yet. Add your first feed above.
        </div>
      ) : (
        feeds.map(feed => (
          <div key={feed.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "serif" }}>
                  {feed.brand ? `${feed.brand} ` : ""}{feed.product_name}
                </div>
                {feed.enriched ? (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span style={{ fontSize: 11, background: "#e8f0fe", color: "#3a5fc8", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>{feedTypeLabel(feed.feed_type)}</span>
                    {feed.form && <span style={{ fontSize: 11, background: C.offWhite, color: C.stone, borderRadius: 6, padding: "2px 8px" }}>{feed.form}</span>}
                    {feed.npk && <span style={{ fontSize: 11, background: C.offWhite, color: C.stone, borderRadius: 6, padding: "2px 8px" }}>NPK {feed.npk}</span>}
                    {feed.dilution_ml_per_litre && <span style={{ fontSize: 11, background: C.offWhite, color: C.stone, borderRadius: 6, padding: "2px 8px" }}>{feed.dilution_ml_per_litre}ml/L</span>}
                    {feed.frequency_days && <span style={{ fontSize: 11, background: C.offWhite, color: C.stone, borderRadius: 6, padding: "2px 8px" }}>Every {feed.frequency_days} days</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.stone, marginTop: 4, fontStyle: "italic" }}>Identifying feed data… 🔍</div>
                )}
                {feed.notes && <div style={{ fontSize: 12, color: C.stone, marginTop: 6 }}>{feed.notes}</div>}
              </div>
              <button onClick={() => deleteFeed(feed.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: C.stone, fontSize: 18, padding: "0 0 0 12px", lineHeight: 1 }}>×</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Navigation tabs ───────────────────────────────────────────────────────────
// ── Barcode Scanner ───────────────────────────────────────────────────────────
// Uses native <input type="file" capture="environment" accept="image/*"> for iOS
// compatibility — no library needed, works in all browsers including iOS Safari PWA.
// Photo is sent to the API which uses Claude Vision to read the barcode/product.

function BarcodeScanner({ onResult, onClose, mode = "crop" }) {
  const [status,     setStatus]     = useState("idle"); // idle | scanning | found | error
  const [result,     setResult]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [preview,    setPreview]    = useState(null);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target.result);
    reader.readAsDataURL(file);

    setStatus("scanning");
    setLoading(true);

    try {
      // Compress image inline — max 800px, 70% quality, stay under 4.5mb body limit
      const bitmap = await createImageBitmap(file);
      const maxDim = 800;
      const scale  = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(bitmap.width  * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

      const data = await apiFetch("/barcode/scan-image", {
        method: "POST",
        body: JSON.stringify({ image: base64, mode }),
      });

      setResult(data);
      setStatus("found");
    } catch (e) {
      console.error("Scan error:", e);
      setStatus("error");
    }
    setLoading(false);
  };

  const handleManual = async () => {
    if (!manualCode.trim()) return;
    setLoading(true);
    setShowManual(false);
    setStatus("scanning");
    try {
      const data = await apiFetch(`/barcode/${encodeURIComponent(manualCode.trim())}?mode=${mode}`);
      setResult(data);
      setStatus("found");
    } catch (e) {
      setStatus("error");
    }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "24px 20px 48px", width: "100%", maxWidth: 440, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>
              Identify {mode === "crop" ? "seed packet" : "product"} 📷
            </div>
            <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Take a photo of the front of the packet</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.stone }}>×</button>
        </div>

        {/* Idle — show scan button */}
        {status === "idle" && (
          <>
            <label htmlFor="barcode-photo-input" style={{ display: "block", background: C.offwhite, border: `2px dashed ${C.border}`, borderRadius: 14, padding: "32px 20px", textAlign: "center", marginBottom: 16, cursor: "pointer" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📷</div>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>
                Take a photo of the front of the packet
              </div>
              <div style={{ fontSize: 13, color: C.stone }}>Show the name and variety clearly — no barcode needed</div>
            </label>
            <input
              id="barcode-photo-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              style={{ display: "none" }}
            />
            <label htmlFor="barcode-photo-input"
              style={{ display: "block", width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "serif", marginBottom: 10, textAlign: "center", boxSizing: "border-box" }}>
              Take photo of packet
            </label>
            <button onClick={() => setShowManual(true)}
              style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              Enter barcode number manually
            </button>
          </>
        )}

        {/* Scanning / loading */}
        {status === "scanning" && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            {preview && <img src={preview} alt="scan" style={{ width: "100%", borderRadius: 12, marginBottom: 16, maxHeight: 200, objectFit: "cover" }} />}
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
            <div style={{ fontWeight: 700, fontFamily: "serif", fontSize: 16, marginBottom: 4 }}>Identifying product…</div>
            <div style={{ fontSize: 13, color: C.stone }}>Searching product databases</div>
          </div>
        )}

        {/* Found */}
        {status === "found" && result?.found && (
          <>
            {preview && <img src={preview} alt="scan" style={{ width: "100%", borderRadius: 12, marginBottom: 16, maxHeight: 160, objectFit: "cover" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 36 }}>{getCropEmoji(result.name || "")}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, fontFamily: "serif", color: "#1a1a1a" }}>{result.name}</div>
                {result.brand && <div style={{ fontSize: 13, color: C.stone }}>{result.brand}</div>}
                <div style={{ fontSize: 11, color: C.forest, fontWeight: 600, marginTop: 2 }}>✓ Product identified</div>
              </div>
            </div>
            {result.description && (
              <div style={{ fontSize: 13, color: C.stone, marginBottom: 14, lineHeight: 1.5 }}>{result.description}</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              {[
                result.variety    && { label: "Variety",     val: result.variety },
                result.sow_window && { label: "Sow window",  val: result.sow_window },
                result.npk        && { label: "NPK",          val: result.npk },
                result.form       && { label: "Form",         val: result.form },
              ].filter(Boolean).map(r => (
                <div key={r.label} style={{ background: C.offwhite, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: C.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{r.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginTop: 2 }}>{r.val}</div>
                </div>
              ))}
            </div>
            <button onClick={() => { onResult(result); }}
              style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "serif" }}>
              Add {result.name} →
            </button>
          </>
        )}

        {/* Not found */}
        {status === "found" && !result?.found && (
          <>
            {preview && <img src={preview} alt="scan" style={{ width: "100%", borderRadius: 12, marginBottom: 16, maxHeight: 160, objectFit: "cover" }} />}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🤔</div>
              <div style={{ fontWeight: 700, fontFamily: "serif", fontSize: 16, color: "#1a1a1a", marginBottom: 6 }}>We don't recognise this one yet</div>
              <div style={{ fontSize: 13, color: C.stone }}>Use the dropdowns to tell us what it is and we'll look up all the growing details automatically.</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { onResult({ found: false }); }}
                style={{ flex: 2, padding: "13px", borderRadius: 12, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "serif" }}>
                Continue →
              </button>
              <button onClick={() => { setStatus("idle"); setPreview(null); setResult(null); }}
                style={{ flex: 1, padding: "13px", borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Retry
              </button>
            </div>
          </>
        )}

        {/* Error */}
        {status === "error" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontFamily: "serif", fontSize: 16, marginBottom: 8 }}>Something went wrong</div>
            <div style={{ fontSize: 13, color: C.stone, marginBottom: 20 }}>Try again or enter the barcode manually.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setStatus("idle"); setPreview(null); }}
                style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, cursor: "pointer" }}>Try again</button>
              <button onClick={() => setShowManual(true)}
                style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Manual entry</button>
            </div>
          </div>
        )}

        {/* Manual entry overlay */}
        {showManual && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, padding: 24, borderRadius: "16px 16px 0 0" }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%" }}>
              <div style={{ fontWeight: 700, fontFamily: "serif", fontSize: 16, marginBottom: 12 }}>Enter barcode manually</div>
              <input value={manualCode} onChange={e => setManualCode(e.target.value)}
                placeholder="e.g. 5000174002017" autoFocus
                style={{ ...inputStyle, marginBottom: 12 }}
                onKeyDown={e => e.key === "Enter" && handleManual()} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowManual(false)}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.stone, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button onClick={handleManual}
                  style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, cursor: "pointer" }}>Look up</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}


// ── Feedback Sheet ────────────────────────────────────────────────────────────

const FEEDBACK_CATEGORIES = [
  { id: "feature", label: "💡 Feature idea",   hint: "Something you'd love to see" },
  { id: "bug",     label: "🐛 Bug report",      hint: "Something isn't working right" },
  { id: "general", label: "💬 General thought", hint: "Anything on your mind" },
  { id: "praise",  label: "🌟 Positive feedback", hint: "Something you love" },
];

function FeedbackSheet({ onClose }) {
  const [category, setCategory] = useState("");
  const [message,  setMessage]  = useState("");
  const [rating,   setRating]   = useState(0);
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState(null);

  const canSubmit = rating > 0 || (category && message.trim().length > 3);

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await apiFetch("/feedback", {
        method: "POST",
        body: JSON.stringify({ category, message, rating: rating || null }),
      });
      setDone(true);
      setTimeout(onClose, 2500);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "24px 20px 44px", width: "100%", maxWidth: 440, margin: "0 auto", maxHeight: "90vh", overflowY: "auto" }}>

        {done ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🙏</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 6 }}>Thanks for your feedback!</div>
            <div style={{ fontSize: 13, color: C.stone }}>It really helps shape Vercro.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Share your thoughts 💬</div>
                <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Helps us build the right things</div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.stone, padding: 0 }}>×</button>
            </div>

            {error && <ErrorMsg msg={error} />}

            {/* Star rating — can submit with just this */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                How are you finding Vercro? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(tap to submit with just a rating)</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => setRating(rating === n ? 0 : n)}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${rating >= n ? C.amber : C.border}`, background: rating >= n ? "#fff8ed" : "transparent", fontSize: 20, cursor: "pointer", transition: "all 0.15s" }}>
                    {rating >= n ? "⭐" : "☆"}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>What kind of feedback? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {FEEDBACK_CATEGORIES.map(c => (
                  <div key={c.id} onClick={() => setCategory(category === c.id ? "" : c.id)}
                    style={{ border: `2px solid ${category === c.id ? C.forest : C.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", background: category === c.id ? "#f0f5f3" : C.cardBg, transition: "all 0.15s" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: category === c.id ? C.forest : "#1a1a1a" }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>{c.hint}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Message */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Want to say more? <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></div>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us what you think, what's missing, or what could be better…"
                style={{ ...inputStyle, height: 100, resize: "vertical", fontSize: 13 }}
              />
            </div>

            <button onClick={submit} disabled={!canSubmit || saving}
              style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: canSubmit ? C.forest : C.border, color: canSubmit ? "#fff" : C.stone, fontWeight: 700, fontSize: 15, cursor: canSubmit ? "pointer" : "default", fontFamily: "serif", transition: "background 0.2s" }}>
              {saving ? "Sending…" : "Send feedback"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AdminFeedbackList() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/admin/feedback")
      .then(d => { setItems(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const CATEGORY_LABEL = { bug: "🐛 Bug", feature: "💡 Feature", general: "💬 General", praise: "🌟 Praise" };

  if (loading) return <div style={{ textAlign: "center", padding: "40px 0" }}><Spinner /></div>;

  if (items.length === 0) return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: C.stone }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>No feedback yet</div>
      <div style={{ fontSize: 13 }}>Submissions will appear here once users send feedback.</div>
    </div>
  );

  return (
    <>
      <div style={{ fontSize: 13, color: C.stone, marginBottom: 12 }}>{items.length} submission{items.length !== 1 ? "s" : ""}</div>
      {items.map(item => (
        <div key={item.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.forest }}>{CATEGORY_LABEL[item.category] || item.category}</span>
            <span style={{ fontSize: 11, color: C.stone }}>{new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          </div>
          <div style={{ fontSize: 13, color: "#1a1a1a", lineHeight: 1.5, marginBottom: 8 }}>{item.message}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 11, color: C.stone }}>{item.profiles?.name || "Unknown"}</span>
              {item.user_email && <span style={{ fontSize: 11, color: C.stone, marginLeft: 6 }}>· {item.user_email}</span>}
            </div>
            {item.rating && <span style={{ fontSize: 12 }}>{"⭐".repeat(item.rating)}</span>}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Metric helpers ────────────────────────────────────────────────────────────
function MetricSection({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>{title}</div>
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function MetricRow({ label, val, sub, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 13, color: "#1a1a1a" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.stone, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: highlight ? C.forest : "#1a1a1a", fontFamily: "serif" }}>{val ?? "—"}</div>
    </div>
  );
}

function MetricCard({ label, value, sub, status, suggestion }) {
  const [open, setOpen] = useState(false);
  const bg   = status === "green" ? "#EAF3DE" : status === "amber" ? "#FFF8E7" : status === "red" ? "#FFF0F0" : C.offwhite;
  const col  = status === "green" ? "#3B6D11" : status === "amber" ? "#92600A" : status === "red" ? "#8B1A1A" : C.stone;
  const badge = status === "green" ? "✓ on target" : status === "amber" ? "↗ below target" : status === "red" ? "⚠ needs action" : null;
  return (
    <div style={{ background: C.offwhite, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: C.stone, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", lineHeight: 1, marginBottom: 3 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 11, color: C.stone, marginBottom: 6 }}>{sub}</div>}
      {badge && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, background: bg, color: col, borderRadius: 99, padding: "2px 8px", display: "inline-block" }}>{badge}</span>
          {suggestion && status !== "green" && (
            <button onClick={() => setOpen(o => !o)}
              style={{ fontSize: 10, color: C.stone, background: "none", border: `1px solid ${C.border}`, borderRadius: 99, padding: "2px 8px", cursor: "pointer" }}>
              {open ? "hide" : "⚙ fix"}
            </button>
          )}
        </div>
      )}
      {open && suggestion && (
        <div style={{ marginTop: 10, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#1a1a1a", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: C.forest }}>{suggestion.title}</div>
          <div style={{ color: C.stone, marginBottom: 6 }}>{suggestion.body}</div>
          <ul style={{ margin: 0, paddingLeft: 16, color: C.stone }}>
            {suggestion.steps.map((s, i) => <li key={i} style={{ marginBottom: 3 }}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricRowWithFix({ label, val, sub, status, suggestion }) {
  const [open, setOpen] = useState(false);
  const col  = status === "green" ? C.forest : status === "amber" ? "#92600A" : status === "red" ? "#8B1A1A" : "#1a1a1a";
  const bg   = status === "green" ? "#EAF3DE" : status === "amber" ? "#FFF8E7" : status === "red" ? "#FFF0F0" : C.offwhite;
  const badge = status === "green" ? "✓" : status === "amber" ? "↗" : status === "red" ? "⚠" : null;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: open ? "none" : `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 13, color: "#1a1a1a" }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: C.stone, marginTop: 1 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", fontFamily: "serif" }}>{val ?? "—"}</div>
          {badge && <span style={{ fontSize: 10, background: bg, color: col, borderRadius: 99, padding: "2px 7px" }}>{badge}</span>}
          {suggestion && status !== "green" && (
            <button onClick={() => setOpen(o => !o)}
              style={{ fontSize: 10, color: C.stone, background: "none", border: `1px solid ${C.border}`, borderRadius: 99, padding: "2px 8px", cursor: "pointer" }}>
              {open ? "hide" : "⚙ fix"}
            </button>
          )}
        </div>
      </div>
      {open && suggestion && (
        <div style={{ margin: "0 14px 10px", background: C.offwhite, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#1a1a1a", lineHeight: 1.6, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 700, marginBottom: 5, color: C.forest }}>{suggestion.title}</div>
          <div style={{ color: C.stone, marginBottom: 6 }}>{suggestion.body}</div>
          <ul style={{ margin: 0, paddingLeft: 16, color: C.stone }}>
            {suggestion.steps.map((s, i) => <li key={i} style={{ marginBottom: 3 }}>{s}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}

const SUGGESTIONS = {
  activation: {
    title: "Improve activation rate",
    body: "Most users drop off between signup and adding their first crop. The empty state is the biggest friction point.",
    steps: [
      "Add a single-step onboarding prompt immediately after signup: \"What are you growing?\"",
      "Pre-populate with 3 quick-add crop buttons (Tomatoes, Courgettes, Potatoes)",
      "Send the unactivated nudge email sooner — try 2 hours instead of 24",
      "Show a progress indicator: \"Step 1 of 2 — add your first crop to get your plan\"",
    ],
  },
  week4retention: {
    title: "Improve month 1 retention",
    body: "Users who haven't formed the daily check-in habit by day 28 are unlikely to return. Day 14 is your last real lever.",
    steps: [
      "Check day 14 re-engagement email open rate in Resend — if below 20%, rewrite the subject line",
      "Add a streak mechanic — users with a 7-day streak are significantly more likely to stay",
      "Ensure morning push is firing reliably for day 14-28 users with tasks due",
      "The day 30 lapsed email tone shift (\"Your carrots need you\") is correct — verify it's sending",
    ],
  },
  waitlist: {
    title: "Improve waitlist conversion",
    body: "69% of invited users never set up an account. The invite email and follow-up sequence is your biggest lever.",
    steps: [
      "A/B test the invite email subject line — try \"Your Vercro garden is ready\" vs current",
      "Check if Hotmail/Outlook recipients are converting — those had delivery delays",
      "Day 7 nudge email should feel more urgent — growing season framing is working, lean into it",
      "Add a deadline feel to day 14 final email — \"last nudge from me\" is good but could be stronger",
    ],
  },
  dau_wau: {
    title: "Improve daily stickiness",
    body: "DAU/WAU below 0.25 means most weekly users aren't checking in daily. Push notifications are the main driver.",
    steps: [
      "Verify morning push is firing at 7am UK time and tokens are valid",
      "The engagement_nudge fallback fires when no tasks exist — check it's reaching users",
      "Today's focus hero card needs to always show something — if empty state shows, users don't open",
      "Consider a daily \"garden check-in\" streak visible on the dashboard",
    ],
  },
  taskcompletion: {
    title: "Improve task completion",
    body: "Users with too many visible tasks complete fewer. The today/focus split helps but volume is still the issue.",
    steps: [
      "The \"Today's focus\" hero card is working — ensure it always shows a high-urgency task",
      "Check if duplicate tasks per crop are diluting completion (dedup logic)",
      "The expandable \"See all\" list keeps the main view clean — good, keep it collapsed by default",
      "Consider a \"nice job\" moment when all today's tasks are done",
    ],
  },
  pushenabled: {
    title: "Improve push opt-in rate",
    body: "43% opt-in is below average for a utility app (typical is 55-70%). Timing and framing of the prompt matters most.",
    steps: [
      "Move the push prompt to after the first task is completed — higher intent moment",
      "Add context before the browser dialog: \"Get a 7am nudge when something needs doing\"",
      "For users who declined, re-prompt after 7 days via an in-app banner",
      "Show a sample notification in the prompt to reduce uncertainty",
    ],
  },
  organic: {
    title: "Grow organic share",
    body: "Referral and share card are your best organic channels right now. Both were just launched.",
    steps: [
      "Monitor how many referral sheet opens convert to actual signups",
      "The share card Instagram moment at 5 tasks is your best organic acquisition — track shares",
      "Consider a small incentive for referrals once you have more users",
      "SEO on vercro.com for \"UK gardening app\" terms is a medium-term play",
    ],
  },
  week1retention: {
    title: "Improve week 1 retention",
    body: "Day 7 is the critical checkpoint. Users who complete at least 3 tasks in week 1 retain at 2x the rate.",
    steps: [
      "Day 3 feedback email (active version) is asking the right questions — check reply rate",
      "Ensure the rule engine generates at least 3-5 tasks in first 7 days for new users",
      "The \"also today\" and \"see all\" task sections help — make sure first-week users have visible tasks",
      "Consider a welcome badge for completing first 5 tasks",
    ],
  },
};

// ── Admin Tools ──────────────────────────────────────────────────────────────
function InviteWaitlistButton() {
  const [status,  setStatus]  = useState(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!confirm("This will email all waitlist users telling them they can now join. Each person is only emailed once. Continue?")) return;
    setRunning(true);
    setStatus(null);
    try {
      const result = await apiFetch("/admin/invite-waitlist", { method: "POST" });
      setStatus({ ok: true, sent: result.queued, total: result.queued });
    } catch (e) {
      setStatus({ ok: false, error: e.message });
    }
    setRunning(false);
  };

  return (
    <>
      <button onClick={run} disabled={running}
        style={{ background: running ? C.border : C.forest, color: running ? C.stone : "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: running ? "default" : "pointer", opacity: running ? 0.7 : 1 }}>
        {running ? "Sending…" : "Send Invite Emails"}
      </button>
      {status && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: status.ok ? "#f0f8f0" : "#fff0f0", border: `1px solid ${status.ok ? "#b8ddb8" : "#f4b8b8"}`, fontSize: 13 }}>
          {status.ok
            ? `✅ Sent to ${status.sent} of ${status.total} waitlist users`
            : `❌ Error: ${status.error}`}
        </div>
      )}
    </>
  );
}

function AdminTools() {
  const [backfillStatus, setBackfillStatus] = useState(null);
  const [running,        setRunning]        = useState(false);

  const runBackfill = async () => {
    if (!confirm("This will backfill badge progress for all users from their existing data. Run it?")) return;
    setRunning(true);
    setBackfillStatus(null);
    try {
      const result = await apiFetch("/admin/backfill-badges", { method: "POST" });
      setBackfillStatus({ ok: true, count: result.processed, results: result.results });
    } catch (e) {
      setBackfillStatus({ ok: false, error: e.message });
    }
    setRunning(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Invite waitlist */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>📬 Invite Waitlist Users</div>
        <div style={{ fontSize: 13, color: C.stone, marginBottom: 16, lineHeight: 1.5 }}>
          Emails everyone on the waitlist telling them access is now open. Each user is only emailed once. Also updates their status to accepted.
        </div>
        <InviteWaitlistButton />
      </div>

      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>🏆 Backfill Badges</div>
        <div style={{ fontSize: 13, color: C.stone, marginBottom: 16, lineHeight: 1.5 }}>
          Calculates badge progress for all existing users from their real data — tasks completed, crops added, harvests logged etc. Run this once after deploying badges. Safe to re-run.
        </div>
        <button onClick={runBackfill} disabled={running}
          style={{ background: running ? C.border : C.forest, color: running ? C.stone : "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: running ? "default" : "pointer", opacity: running ? 0.7 : 1 }}>
          {running ? "Running…" : "Run Badge Backfill"}
        </button>
        {backfillStatus && (
          <div style={{ marginTop: 14, padding: "12px", borderRadius: 8, background: backfillStatus.ok ? "#f0f8f0" : "#fff0f0", border: `1px solid ${backfillStatus.ok ? "#b8ddb8" : "#f4b8b8"}` }}>
            {backfillStatus.ok ? (
              <>
                <div style={{ fontWeight: 700, color: C.forest, fontSize: 13, marginBottom: 8 }}>✅ Backfill complete — {backfillStatus.count} users processed</div>
                <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12, color: C.stone }}>
                  {(backfillStatus.results || []).map((r, i) => (
                    <div key={i} style={{ padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                      {r.email} — {r.tasks ?? "?"} tasks, {r.crops ?? "?"} crops, {r.harvests ?? "?"} harvests
                      {r.error && <span style={{ color: "red" }}> ⚠ {r.error}</span>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: "red", fontSize: 13 }}>❌ Error: {backfillStatus.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Screen ─────────────────────────────────────────────────────────────
// Only visible to mark@wynyardadvisory.co.uk

// ── Funnel tab component ───────────────────────────────────────────────────────
function FunnelTab({ data }) {
  const { funnel, retention, push_retention, cohort_days, health_check } = data;

  const rateColor = (r) => {
    if (r === null || r === undefined) return C.stone;
    if (r >= 30) return "#2F5D50";
    if (r >= 15) return "#92600A";
    return "#8B1A1A";
  };

  const RateCell = ({ d, label }) => {
    if (!d) return <td style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontSize: 12 }}>—</td>;
    return (
      <td style={{ padding: "8px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: rateColor(d.rate) }}>{d.rate}%</div>
        <div style={{ fontSize: 10, color: C.stone }}>of {d.eligible}</div>
      </td>
    );
  };

  const RetRow = ({ label, group }) => (
    <tr style={{ borderBottom: `1px solid ${C.sage}` }}>
      <td style={{ padding: "8px 10px", color: C.forest, fontWeight: 600, fontSize: 13 }}>{label}</td>
      <RateCell d={{ rate: group.d1_rate, eligible: group.d1_eligible }} />
      <RateCell d={{ rate: group.d3_rate, eligible: group.d3_eligible }} />
      <RateCell d={{ rate: group.d7_rate, eligible: group.d7_eligible }} />
    </tr>
  );

  const noCropsOk = health_check.no_crops_post_fix === 0;
  const noTasksOk = health_check.no_tasks_post_fix === 0;

  return (
    <div style={{ padding: "16px 14px" }}>

      {/* ── Post-fix health check ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Activated with no crops (post-fix)", value: health_check.no_crops_post_fix, ok: noCropsOk },
          { label: "Activated with no tasks (post-fix)",  value: health_check.no_tasks_post_fix, ok: noTasksOk },
        ].map(({ label, value, ok }) => (
          <div key={label} style={{ flex: 1, background: ok ? "#EAF5EE" : "#FFF0F0", border: `1px solid ${ok ? "#B8DEC7" : "#F5C6C6"}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: ok ? "#2F5D50" : "#8B1A1A", fontWeight: 600, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: ok ? "#2F5D50" : "#8B1A1A" }}>{value}</div>
            <div style={{ fontSize: 11, color: ok ? "#2F5D50" : "#8B1A1A" }}>{ok ? "✓ Target: 0" : "⚠ Target: 0"}</div>
          </div>
        ))}
      </div>

      {/* ── Activation funnel ── */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.sage}`, padding: "16px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.forest, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Activation funnel</div>
        {[
          { label: "Signed up",      value: funnel.signed_up,       pct: 100 },
          { label: "Onboarded",      value: funnel.onboarded,       pct: funnel.signed_up > 0 ? Math.round(funnel.onboarded / funnel.signed_up * 100) : 0 },
          { label: "Tasks generated",value: funnel.tasks_generated, pct: funnel.signed_up > 0 ? Math.round(funnel.tasks_generated / funnel.signed_up * 100) : 0 },
          { label: "First task done",value: funnel.first_task_done, pct: funnel.signed_up > 0 ? Math.round(funnel.first_task_done / funnel.signed_up * 100) : 0 },
          { label: "Active crops",   value: funnel.active_crops,    pct: funnel.signed_up > 0 ? Math.round(funnel.active_crops / funnel.signed_up * 100) : 0 },
        ].map(({ label, value, pct }) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: C.forest }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.forest }}>{(value||0).toLocaleString()} <span style={{ fontWeight: 400, color: C.stone }}>({pct}%)</span></span>
            </div>
            <div style={{ height: 8, background: "#E8F0EC", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: C.forest, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Behaviour → retention ── */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.sage}`, padding: "16px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.forest, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Behaviour → retention</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.sage}` }}>
                <th style={{ padding: "8px 10px", textAlign: "left",   color: C.stone, fontWeight: 600, fontSize: 12 }}>Group</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 600, fontSize: 12 }}>D1</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 600, fontSize: 12 }}>D3</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 600, fontSize: 12 }}>D7</th>
              </tr>
            </thead>
            <tbody>
              <RetRow label="❌ No task completed" group={retention.no_task} />
              <RetRow label="✅ 1 task completed"  group={retention.one_task} />
              <RetRow label="🔥 2+ tasks completed" group={retention.two_plus} />
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Push vs no-push ── */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.sage}`, padding: "16px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.forest, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Push notifications — D7 retention</div>
        {[
          { label: "With push",    ...push_retention.push },
          { label: "Without push", ...push_retention.no_push },
        ].map(({ label, rate, eligible }) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: C.forest }}>{label} <span style={{ color: C.stone, fontWeight: 400 }}>({eligible} users)</span></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: rateColor(rate) }}>{rate !== null ? `${rate}%` : "—"}</span>
            </div>
            {rate !== null && (
              <div style={{ height: 8, background: "#E8F0EC", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${rate}%`, background: rate >= 30 ? C.forest : "#92600A", borderRadius: 4 }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 14-day cohort table ── */}
      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.sage}`, padding: "16px 14px", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.forest, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>14-day cohort table</div>

        {/* Bug fix banner */}
        <div style={{ background: "#FFFBE6", border: "1px solid #F5C842", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#92600A", lineHeight: 1.5 }}>
          ⚠️ Bug fix deployed 24 Mar 2026 — cohorts before this date had broken onboarding. Use post-fix cohorts as your real product baseline.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.sage}`, background: "#F5FAF7" }}>
                <th style={{ padding: "8px 10px", textAlign: "left",   color: C.stone, fontWeight: 700 }}>Date</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 700 }}>New</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 700 }}>Activated</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 700 }}>1st Task</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 700 }}>D1</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 700 }}>D3</th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: C.stone, fontWeight: 700 }}>D7</th>
              </tr>
            </thead>
            <tbody>
              {(cohort_days || []).map((day, i) => {
                const dateLabel = new Date(day.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                const rowBg = day.is_post_fix ? "#F5FAF7" : "transparent";
                const CohortCell = ({ d }) => {
                  if (!d) return <td style={{ padding: "8px 10px", textAlign: "center", color: "#ccc", fontSize: 11 }}>—</td>;
                  return <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: rateColor(d.rate) }}>{d.rate}%</td>;
                };
                return (
                  <tr key={day.date} style={{ borderBottom: `1px solid ${C.sage}`, background: rowBg }}>
                    <td style={{ padding: "8px 10px", color: C.forest, fontWeight: day.is_post_fix ? 700 : 400, whiteSpace: "nowrap" }}>
                      {day.is_post_fix && <span style={{ color: "#2F5D50", marginRight: 4 }}>✓</span>}
                      {dateLabel}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: C.forest }}>{day.signups}</td>
                    <td style={{ padding: "8px 10px", textAlign: "center", color: day.activation_pct >= 70 ? "#2F5D50" : "#92600A" }}>
                      {day.activation_pct !== null ? `${day.activation_pct}%` : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", color: rateColor(day.first_task_pct) }}>
                      {day.first_task_pct !== null ? `${day.first_task_pct}%` : "—"}
                    </td>
                    <CohortCell d={day.d1} />
                    <CohortCell d={day.d3} />
                    <CohortCell d={day.d7} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.stone, textAlign: "center", marginTop: 8 }}>Live data · refreshes on load</div>
    </div>
  );
}

// ── Viewer admin screen — signup count only ────────────────────────────────────
function ViewerAdminScreen() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    apiFetch("/admin/metrics/viewer")
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  return (
    <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.forest, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 20 }}>
        Vercro — Overview
      </div>
      {loading && <div style={{ color: C.stone, fontSize: 14 }}>Loading…</div>}
      {error   && <div style={{ color: "#8B1A1A", fontSize: 14 }}>Error: {error}</div>}
      {data && (
        <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.sage}`, padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: C.stone, marginBottom: 8 }}>Total signups</div>
          <div style={{ fontSize: 56, fontWeight: 900, color: C.forest, lineHeight: 1 }}>{data.totalSignups.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: C.stone, marginTop: 8 }}>registered users</div>
        </div>
      )}
    </div>
  );
}

// ── Demo admin screen — marketing reset only ──────────────────────────────────
function DemoAdminScreen() {
  const [resetting, setResetting] = useState(false);
  const [result,    setResult]    = useState(null);
  const [confirm,   setConfirm]   = useState(false);

  const runReset = async () => {
    setResetting(true);
    setResult(null);
    try {
      const data = await apiFetch("/demo/reset", { method: "POST" });
      setResult({ ok: true, crops: data.crops, tasks: data.tasks });
    } catch(e) {
      setResult({ ok: false, error: e.message });
    }
    setResetting(false);
    setConfirm(false);
  };

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", marginBottom: 4, color: "#1a1a1a" }}>Demo tools</div>
      <div style={{ fontSize: 12, color: C.stone, marginBottom: 24 }}>Reset this account back to the demo state</div>

      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 6 }}>Marketing reset</div>
        <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.6, marginBottom: 16 }}>
          Wipes all crops, tasks and harvest logs and restores the demo garden to its default state. Use this before handing the phone to someone new.
        </div>

        {!confirm ? (
          <button onClick={() => setConfirm(true)}
            style={{ width: "100%", background: C.forest, color: "#fff", border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
            Reset demo garden
          </button>
        ) : (
          <div>
            <div style={{ background: "#fff8f0", border: `1px solid ${C.amber}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13, color: "#8a5c00", lineHeight: 1.5 }}>
              ⚠️ This will wipe all current data and restore the demo garden. Are you sure?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={runReset} disabled={resetting}
                style={{ flex: 1, background: C.red, color: "#fff", border: "none", borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "serif" }}>
                {resetting ? "Resetting…" : "Yes, reset now"}
              </button>
              <button onClick={() => setConfirm(false)}
                style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, fontSize: 14, color: "#666", cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {result?.ok && (
          <div style={{ marginTop: 14, background: "#f0f9f4", border: `1px solid ${C.sage}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.forest }}>
            ✓ Demo garden reset — {result.crops} crops and {result.tasks} tasks restored
          </div>
        )}
        {result?.ok === false && (
          <div style={{ marginTop: 14, background: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.red }}>
            ✗ Reset failed: {result.error}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminScreen({ isDemo = false }) {
  const [tab,       setAdminTab] = useState("metrics");
  const [crops,     setCrops]    = useState([]);
  const [users,     setUsers]    = useState([]);
  const [metrics,   setMetrics]  = useState(null);
  const [funnel,    setFunnel]   = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [error,     setError]    = useState(null);
  const [acting,    setActing]   = useState(null);
  const [metricTab, setMetricTab] = useState("overview");

  // ── Demo mode — restricted view ──────────────────────────────────────────
  if (isDemo) return <DemoAdminScreen />;

  useEffect(() => { loadAll(); }, [tab, metricTab]);

  const loadAll = async () => {
    setLoading(true); setError(null);
    try {
      if (tab === "crops") {
        const data = await apiFetch("/admin/crop-queue");
        setCrops(data);
      } else if (tab === "users") {
        const data = await apiFetch("/admin/users");
        setUsers(data);
      } else if (tab === "metrics") {
        if (metricTab === "funnel") {
          const data = await apiFetch("/admin/metrics/funnel");
          setFunnel(data);
        } else {
          const data = await apiFetch("/admin/metrics");
          setMetrics(data);
        }
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const approve = async (id) => {
    setActing(id);
    try {
      await apiFetch(`/admin/crop-queue/${id}/approve`, { method: "POST" });
      setCrops(cs => cs.filter(c => c.id !== id));
    } catch (e) { setError(e.message); }
    setActing(null);
  };

  const reject = async (id) => {
    setActing(id);
    try {
      await apiFetch(`/admin/crop-queue/${id}/reject`, { method: "POST" });
      setCrops(cs => cs.filter(c => c.id !== id));
    } catch (e) { setError(e.message); }
    setActing(null);
  };

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "serif", marginBottom: 4, color: "#1a1a1a" }}>Admin</div>
      <div style={{ fontSize: 12, color: C.stone, marginBottom: 20 }}>Internal tools — only visible to you</div>

      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {[
          { id: "metrics",  label: "📊 Metrics" },
          { id: "crops",    label: "🌱 Crop queue" },
          { id: "users",    label: "👤 Users" },
          { id: "feedback", label: "💬 Feedback" },
          { id: "tools",    label: "🔧 Tools" },
        ].map(t => (
          <button key={t.id} onClick={() => setAdminTab(t.id)}
            style={{ padding: "8px 14px", borderRadius: 20, border: `1px solid ${tab === t.id ? C.forest : C.border}`, background: tab === t.id ? C.forest : "transparent", color: tab === t.id ? "#fff" : C.stone, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading && <div style={{ textAlign: "center", padding: "40px 0" }}><Spinner /></div>}

      {/* ── Tools ── */}
      {!loading && tab === "tools" && (
        <AdminTools />
      )}

      {/* ── Metrics dashboard ── */}
      {!loading && tab === "metrics" && metrics && (() => {
        const actRate  = metrics.activationRate || 0;
        const w1Ret    = metrics.week1Retention || 0;
        const w4Ret    = metrics.week4Retention || 0;
        const dauWau   = parseFloat(metrics.dauWauRatio) || 0;
        const taskRate = metrics.taskCompletionRate || 0;

        const status = (val, green, amber) =>
          val >= green ? "green" : val >= amber ? "amber" : "red";

        return (
          <div>
            {/* Hero strip */}
            <div style={{ background: `linear-gradient(135deg, ${C.forest}, #1e3d33)`, borderRadius: 14, padding: "18px 20px", marginBottom: 16, color: "#fff" }}>
              <div style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Founder dashboard · live data</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Signups",    val: metrics.totalSignups,   sub: `+${metrics.newSignupsWeek} this week` },
                  { label: "Activated",  val: metrics.totalActivated, sub: `${actRate}% rate` },
                  { label: "WAU",        val: metrics.wau,            sub: `${metrics.dau} today` },
                  { label: "Crops",      val: metrics.totalCrops,     sub: `${metrics.avgCropsPerUser} avg/user` },
                  { label: "Tasks done", val: metrics.tasksCompleted, sub: `${taskRate}% rate` },
                  { label: "Harvests",   val: metrics.harvestLogs,    sub: "logged" },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{s.val}</div>
                    <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, marginTop: 1 }}>{s.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.55, marginTop: 1 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metric tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
              {[
                { id: "overview", label: "Overview" },
                { id: "funnel",   label: "Funnel" },
                { id: "growth",   label: "Growth" },
                { id: "usage",    label: "Usage" },
                { id: "comms",    label: "Comms" },
              ].map(t => (
                <button key={t.id} onClick={() => setMetricTab(t.id)}
                  style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${metricTab === t.id ? C.forest : C.border}`, background: metricTab === t.id ? C.forest : "transparent", color: metricTab === t.id ? "#fff" : C.stone, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW ── */}
            {metricTab === "overview" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Business health</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  <MetricCard label="Activation rate" value={`${actRate}%`} sub="signup → first crop"
                    status={status(actRate, 60, 40)}
                    suggestion={actRate < 60 ? SUGGESTIONS.activation : null} />
                  <MetricCard label="Week 1 retention" value={w1Ret ? `${w1Ret}%` : "—"} sub="back on day 7"
                    status={w1Ret ? status(w1Ret, 30, 20) : null}
                    suggestion={w1Ret && w1Ret < 30 ? SUGGESTIONS.week1retention : null} />
                  <MetricCard label="Week 4 retention" value={w4Ret ? `${w4Ret}%` : "—"} sub="still active day 28"
                    status={w4Ret ? status(w4Ret, 15, 10) : null}
                    suggestion={w4Ret && w4Ret < 15 ? SUGGESTIONS.week4retention : null} />
                  <MetricCard label="DAU / WAU" value={metrics.dauWauRatio || "—"} sub="stickiness ratio"
                    status={dauWau ? status(dauWau, 0.25, 0.15) : null}
                    suggestion={dauWau && dauWau < 0.25 ? SUGGESTIONS.dau_wau : null} />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Flags needing attention</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                  {[
                    { condition: actRate < 60,  label: `Activation ${actRate}% — users dropping off before first crop`, sug: SUGGESTIONS.activation, severity: actRate < 40 ? "red" : "amber" },
                    { condition: w4Ret && w4Ret < 15, label: `Week 4 retention ${w4Ret}% — habit not forming by day 28`, sug: SUGGESTIONS.week4retention, severity: "red" },
                    { condition: dauWau && dauWau < 0.25, label: `DAU/WAU ${metrics.dauWauRatio} — daily check-in habit below target`, sug: SUGGESTIONS.dau_wau, severity: "amber" },
                    { condition: taskRate < 40, label: `Task completion ${taskRate}% — users not completing tasks`, sug: SUGGESTIONS.taskcompletion, severity: "amber" },
                  ].filter(f => f.condition).map((f, i, arr) => (
                    <MetricRowWithFix key={i}
                      label={f.label}
                      status={f.severity}
                      suggestion={f.sug}
                      sub={null} val={null} />
                  ))}
                  {[actRate >= 60, !w4Ret || w4Ret >= 15, !dauWau || dauWau >= 0.25, taskRate >= 40].every(Boolean) && (
                    <div style={{ padding: "16px 14px", fontSize: 13, color: C.forest, fontWeight: 600 }}>✓ All metrics on target</div>
                  )}
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Investor snapshot</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
                  <MetricRow label="MAU" val={metrics.wau} sub="monthly active users" />
                  <MetricRow label="MAU growth" val={metrics.wowGrowth !== null ? `${metrics.wowGrowth > 0 ? "+" : ""}${metrics.wowGrowth}%` : "—"} sub="week on week" highlight={metrics.wowGrowth > 0} />
                  <MetricRow label="DAU / MAU ratio" val={metrics.dauWauRatio || "—"} sub="stickiness · target 0.15+" highlight={dauWau >= 0.15} />
                  <MetricRow label="Avg crops per user" val={metrics.avgCropsPerUser} sub="engagement depth · target 3+" highlight={parseFloat(metrics.avgCropsPerUser) >= 3} />
                  <MetricRow label="NPS proxy" val={metrics.avgRating ? `${metrics.avgRating}/5` : "—"} sub="avg feedback rating" />
                </div>
              </div>
            )}

            {/* ── GROWTH ── */}
            {metricTab === "growth" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Acquisition</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                  <MetricRow label="Total signups" val={metrics.totalSignups} sub="everyone who registered" />
                  <MetricRow label="New this week" val={metrics.newSignupsWeek} />
                  <MetricRow label="Week-on-week growth" val={metrics.wowGrowth !== null ? `${metrics.wowGrowth > 0 ? "+" : ""}${metrics.wowGrowth}%` : "—"} highlight={metrics.wowGrowth > 0} />
                  <MetricRowWithFix label="Waitlist → app conversion" val="—" sub="invited users who signed up"
                    status="amber" suggestion={SUGGESTIONS.waitlist} />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Retention curve</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                  {[
                    { label: "Week 1 retention", val: w1Ret ? `${w1Ret}%` : "—", pct: w1Ret, target: 30, sug: SUGGESTIONS.week1retention },
                    { label: "Week 4 retention", val: w4Ret ? `${w4Ret}%` : "—", pct: w4Ret, target: 15, sug: SUGGESTIONS.week4retention },
                  ].map((r, i) => (
                    <div key={i} style={{ padding: "10px 14px", borderBottom: i < 1 ? `1px solid ${C.border}` : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontSize: 13, color: "#1a1a1a" }}>{r.label}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>{r.val}</span>
                          <span style={{ fontSize: 10, color: C.stone }}>target {r.target}%</span>
                        </div>
                      </div>
                      <div style={{ height: 6, background: C.offwhite, borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, r.pct || 0)}%`, background: (r.pct || 0) >= r.target ? C.forest : (r.pct || 0) >= r.target * 0.7 ? C.amber : C.red, borderRadius: 99 }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Engagement</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
                  <MetricRow label="Weekly active users (WAU)" val={metrics.wau} />
                  <MetricRow label="Daily active users (DAU)" val={metrics.dau} />
                  <MetricRowWithFix label="DAU / WAU ratio" val={metrics.dauWauRatio || "—"} sub="target 0.25+"
                    status={status(dauWau, 0.25, 0.15)} suggestion={dauWau < 0.25 ? SUGGESTIONS.dau_wau : null} />
                </div>
              </div>
            )}

            {/* ── USAGE ── */}
            {metricTab === "usage" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Engagement</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                  <MetricRow label="Activated users" val={metrics.totalActivated} sub="completed onboarding" />
                  <MetricRowWithFix label="Activation rate" val={`${actRate}%`} sub="signup → first crop · target 60%"
                    status={status(actRate, 60, 40)} suggestion={actRate < 60 ? SUGGESTIONS.activation : null} />
                  <MetricRow label="Avg crops per user" val={metrics.avgCropsPerUser} sub="engagement depth · target 3+" highlight={parseFloat(metrics.avgCropsPerUser) >= 3} />
                  <MetricRowWithFix label="Task completion rate" val={`${taskRate}%`} sub="done / (done + pending) · target 40%"
                    status={status(taskRate, 40, 25)} suggestion={taskRate < 40 ? SUGGESTIONS.taskcompletion : null} />
                  <MetricRow label="Tasks pending" val={metrics.tasksPending} />
                  <MetricRow label="Tasks completed" val={metrics.tasksCompleted} sub="all time" />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Garden data</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                  <MetricRow label="Gardens created" val={metrics.totalLocations} />
                  <MetricRow label="Growing areas" val={metrics.totalAreas} />
                  <MetricRow label="Crop instances" val={metrics.totalCrops} />
                  <MetricRow label="Crops sown" val={metrics.cropsSown} />
                  <MetricRow label="Crops harvested" val={metrics.cropsHarvested} />
                  <MetricRow label="Harvest logs" val={metrics.harvestLogs} />
                  <MetricRow label="Feeds registered" val={metrics.totalFeeds} sub={`${metrics.avgFeedsPerUser} avg per user`} />
                  <MetricRow label="Growth diary photos" val={metrics.totalPhotos} />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Dataset</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
                  <MetricRow label="Crop varieties tracked" val={metrics.totalVarieties} />
                  <MetricRow label="Yield data points" val={metrics.yieldDataPoints} />
                </div>
              </div>
            )}

            {/* ── COMMS ── */}
            {metricTab === "funnel" && funnel && <FunnelTab data={funnel} />}

            {metricTab === "comms" && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Push notifications</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                  <MetricRowWithFix label="Push opt-in rate" val={metrics.pushOptIn ? `${metrics.pushOptIn}%` : "—"} sub="of activated users · target 60%"
                    status={metrics.pushOptIn ? status(metrics.pushOptIn, 60, 40) : null}
                    suggestion={SUGGESTIONS.pushenabled} />
                  <MetricRow label="Push tokens active" val={metrics.pushTokens || "—"} />
                  <MetricRow label="CTR" val="—" sub="tracking coming soon" />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Email sequences</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
                  <MetricRow label="Waitlist invites sent" val={metrics.emailWaitlistInvites || "—"} />
                  <MetricRow label="Feedback day 3 sent" val={metrics.emailFeedbackDay3 || "—"} />
                  <MetricRow label="Feedback day 7 sent" val={metrics.emailFeedbackDay7 || "—"} />
                  <MetricRow label="Re-engagement day 14" val={metrics.emailReengageDay14 || "—"} />
                  <MetricRow label="Re-engagement day 30" val={metrics.emailReengageDay30 || "—"} />
                  <MetricRow label="Daily fallback emails" val={metrics.emailDailyFallback || "—"} />
                  <MetricRow label="Open rates" val="—" sub="Resend webhook pending" />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Feedback</div>
                <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 8 }}>
                  <MetricRow label="Total submissions" val={metrics.totalFeedback || "—"} />
                  <MetricRow label="Average rating" val={metrics.avgRating ? `${metrics.avgRating}/5` : "—"} highlight={metrics.avgRating >= 4} />
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: C.stone, textAlign: "center", marginTop: 8 }}>Live data · refreshes on load</div>
          </div>
        );
      })()}


      {/* ── Crop queue ── */}
      {!loading && tab === "crops" && (
        <>
          {crops.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: C.stone }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 4 }}>Queue is clear</div>
              <div style={{ fontSize: 13 }}>No AI-added crops awaiting review</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: C.stone, marginBottom: 12 }}>{crops.length} crop{crops.length !== 1 ? "s" : ""} awaiting review</div>
              {crops.map(crop => (
                <div key={crop.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 28 }}>{getCropEmoji(crop.name)}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "serif", color: "#1a1a1a" }}>{crop.name}</div>
                      <div style={{ fontSize: 11, color: C.stone }}>Added by {crop.added_by_email || "unknown"} · {new Date(crop.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "Sow window",   val: crop.sow_window_start ? `Month ${crop.sow_window_start}–${crop.sow_window_end}` : null },
                      { label: "Harvest",      val: crop.harvest_window_start ? `Month ${crop.harvest_window_start}–${crop.harvest_window_end}` : null },
                      { label: "Spacing",      val: crop.spacing_cm ? `${crop.spacing_cm}cm` : null },
                      { label: "Maturity",     val: crop.days_to_maturity_min ? `${crop.days_to_maturity_min}–${crop.days_to_maturity_max} days` : null },
                      { label: "Sow method",   val: crop.sow_method || null },
                      { label: "Crop type",    val: crop.crop_type || null },
                    ].filter(r => r.val).map(r => (
                      <div key={r.label} style={{ background: C.offwhite, borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: C.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{r.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginTop: 1 }}>{r.val}</div>
                      </div>
                    ))}
                  </div>

                  {crop.description && (
                    <div style={{ fontSize: 12, color: C.stone, marginBottom: 12, lineHeight: 1.5, fontStyle: "italic" }}>{crop.description}</div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => approve(crop.id)} disabled={acting === crop.id}
                      style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: C.forest, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: acting === crop.id ? 0.6 : 1 }}>
                      ✓ Approve
                    </button>
                    <button onClick={() => reject(crop.id)} disabled={acting === crop.id}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: acting === crop.id ? 0.6 : 1 }}>
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ── Users ── */}
      {!loading && tab === "users" && (
        <>
          <div style={{ fontSize: 13, color: C.stone, marginBottom: 12 }}>{users.length} user{users.length !== 1 ? "s" : ""} signed up</div>
          {users.map(u => (
            <div key={u.id} style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", marginBottom: 2 }}>{u.name || "No name set"}</div>
              <div style={{ fontSize: 12, color: C.stone }}>{u.email}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: C.stone }}>Joined {new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                {u.crop_count > 0 && <span style={{ fontSize: 11, color: C.forest, fontWeight: 600 }}>🌱 {u.crop_count} crops</span>}
                {u.last_seen && <span style={{ fontSize: 11, color: C.stone }}>Last seen {new Date(u.last_seen).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Feedback ── */}
      {!loading && tab === "feedback" && (
        <AdminFeedbackList />
      )}
    </div>
  );
}

// =============================================================================
// PLAN SCREEN — holding page until visualiser + rotation are built
// Only visible to Mark (or when PRO_ENABLED=true)
// =============================================================================
// =============================================================================
// PLAN SCREEN — Garden Visualiser (Konva — Premium 2.5D Redesign)
// Warm soil ground, timber raised beds, drawn crop sprites, consistent lighting.
// No emoji, no bark chips, no brick border.
// =============================================================================

// ── Design tokens ─────────────────────────────────────────────────────────────
const K = {
  // Ground — warm compacted soil/mulch
  g1:"#2d4a1e", g2:"#3a5c26", gD:"#1e3214", gL:"#4a7030",
  // Timber — light, refined
  w1:"#C8AA78", w2:"#A88050", wD:"#7A5635", wS:"#906840",
  // Soil inside beds
  s1:"#5A3D2A", s2:"#4A3223", sL:"#634535", sH:"#3C2818",
  // Foliage — slightly desaturated
  l1:"#6A9A52", l2:"#82AE65", l3:"#4A7838", l1d:"#5A8A44",
  // Pots
  pot:"#B06845", potL:"#C8845A", potD:"#8A4E32",
  // Greenhouse
  gh:"#D5DBDA", ghS:"#AAB5B2",
};

// ── Seeded jitter for consistent crop variation ────────────────────────────────
function _jit(seed, range) {
  return (((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff) * range - range / 2;
}

// ── Bark/soil texture image cache ──────────────────────────────────────────────
const _textureCache = { img: null, state: "idle" };
const _soilTextureCache = { img: null, state: "idle" };
const _bedImgCache = { img: null, state: "idle" };
const _potImgCache = { img: null, state: "idle" };
const POT_IMG_DATA = "data:image/png;base64,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";

function _ensurePotImg(onReady) {
  if (_potImgCache.state === "ready")   { onReady(_potImgCache.img); return; }
  if (_potImgCache.state === "failed")  { onReady(null); return; }
  if (_potImgCache.state === "loading") { return; }
  _potImgCache.state = "loading";
  const img = new Image();
  img.onload  = () => { _potImgCache.img = img; _potImgCache.state = "ready"; onReady(img); };
  img.onerror = () => { _potImgCache.state = "failed"; onReady(null); };
  img.src = POT_IMG_DATA;
}
const BARK_TEXTURE_DATA = "data:image/jpeg;base64,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";
const SOIL_TEXTURE_DATA = "data:image/jpeg;base64,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";
const BED_IMG_DATA = "data:image/jpeg;base64,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";

function _ensureBarkTexture(onReady) {
  if (_textureCache.state === "ready")   { onReady(_textureCache.img); return; }
  if (_textureCache.state === "failed")  { onReady(null); return; }
  if (_textureCache.state === "loading") { return; }
  _textureCache.state = "loading";
  const img = new Image();
  img.onload  = () => { _textureCache.img = img; _textureCache.state = "ready"; onReady(img); };
  img.onerror = () => { _textureCache.state = "failed"; onReady(null); };
  img.src = BARK_TEXTURE_DATA;
}
function _ensureSoilTexture(onReady) {
  if (_soilTextureCache.state === "ready")   { onReady(_soilTextureCache.img); return; }
  if (_soilTextureCache.state === "failed")  { onReady(null); return; }
  if (_soilTextureCache.state === "loading") { return; }
  _soilTextureCache.state = "loading";
  const img = new Image();
  img.onload  = () => { _soilTextureCache.img = img; _soilTextureCache.state = "ready"; onReady(img); };
  img.onerror = () => { _soilTextureCache.state = "failed"; onReady(null); };
  img.src = SOIL_TEXTURE_DATA;
}
function _ensureBedImg(onReady) {
  if (_bedImgCache.state === "ready")   { onReady(_bedImgCache.img); return; }
  if (_bedImgCache.state === "failed")  { onReady(null); return; }
  if (_bedImgCache.state === "loading") { return; }
  _bedImgCache.state = "loading";
  const img = new Image();
  img.onload  = () => { _bedImgCache.img = img; _bedImgCache.state = "ready"; onReady(img); };
  img.onerror = () => { _bedImgCache.state = "failed"; onReady(null); };
  img.src = BED_IMG_DATA;
}

// ── Ground — sketch paper background ──────────────────────────────────────────
function _drawGround(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.clip();
  // Paper background — warm off-white
  ctx.fillStyle = "#f5f3ee"; ctx.fillRect(x, y, w, h);

  // Dense ground scribble — much darker, longer strokes, more coverage
  const gr2=_sketchSeededRand(99);
  ctx.lineCap="round"; ctx.lineJoin="round";
  for(let i=0;i<600;i++){
    const gx=x+gr2()*w, gy=y+gr2()*h;
    ctx.strokeStyle="#1a1a1a";
    ctx.lineWidth=0.5+gr2()*0.9;
    ctx.globalAlpha=0.10+gr2()*0.13;
    const segs=2+Math.floor(gr2()*3);
    ctx.beginPath(); ctx.moveTo(gx,gy);
    let cx2=gx,cy2=gy;
    for(let s=0;s<segs;s++){
      const a=gr2()*Math.PI*2, l=4+gr2()*12;
      cx2+=Math.cos(a)*l; cy2+=Math.sin(a)*l*0.55;
      ctx.lineTo(cx2,cy2);
    }
    ctx.stroke();
  }
  // Second pass — slightly longer arcing strokes for variation
  const gr3=_sketchSeededRand(77);
  for(let i=0;i<300;i++){
    const gx=x+gr3()*w, gy=y+gr3()*h;
    ctx.strokeStyle="#1a1a1a";
    ctx.lineWidth=0.3+gr3()*0.6;
    ctx.globalAlpha=0.06+gr3()*0.09;
    const len=8+gr3()*20;
    const a=gr3()*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(gx,gy);
    ctx.lineTo(gx+Math.cos(a)*len, gy+Math.sin(a)*len*0.4);
    ctx.stroke();
  }
  ctx.globalAlpha=1;
  ctx.restore();
}

// ── Sketch helpers (shared by all draw functions) ──────────────────────────────
function _sketchSeededRand(seed) {
  let s = seed;
  return function() { s=(s*16807+0)%2147483647; return (s-1)/2147483646; };
}
function _sketchEdge(ctx, x1, y1, x2, y2, rand, opts={}) {
  const {wobble=1.8,strokesPerUnit=0.10,lineWidth=1.5,alpha=0.82,color="#1a1a1a"}=opts;
  const len=Math.sqrt((x2-x1)**2+(y2-y1)**2);
  const strokes=Math.max(2,Math.floor(len*strokesPerUnit));
  const dx=(x2-x1)/strokes,dy=(y2-y1)/strokes;
  ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=lineWidth; ctx.lineCap="round"; ctx.globalAlpha=alpha;
  let px=x1+(rand()-0.5)*wobble*0.4,py=y1+(rand()-0.5)*wobble*0.4;
  for(let i=0;i<strokes;i++){
    const nx=x1+dx*(i+1)+(rand()-0.5)*wobble,ny=y1+dy*(i+1)+(rand()-0.5)*wobble;
    if(rand()>0.90){px=nx;py=ny;continue;}
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx,ny);ctx.stroke();px=nx;py=ny;
  }
  ctx.restore();
}
function _sketchRect(ctx, x, y, w, h, seed, opts={}) {
  const rand=_sketchSeededRand(seed);
  _sketchEdge(ctx,x,y,x+w,y,rand,opts);
  _sketchEdge(ctx,x+w,y,x+w,y+h,rand,opts);
  _sketchEdge(ctx,x+w,y+h,x,y+h,rand,opts);
  _sketchEdge(ctx,x,y+h,x,y,rand,opts);
}
function _sketchHachure(ctx, x, y, w, h, seed, opts={}) {
  const {alpha=0.10,density=0.018}=opts;
  const rand=_sketchSeededRand(seed+777);
  const count=Math.floor(w*h*density);
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); ctx.lineCap="round";
  for(let i=0;i<count;i++){
    const lx=x+rand()*w, ly=y+rand()*h;
    const angle=-0.7+rand()*1.4, len=4+rand()*18;
    const dc=rand();
    ctx.strokeStyle="#1a1a1a";
    ctx.lineWidth=dc>0.88?1.1+rand()*0.7:0.35+rand()*0.6;
    ctx.globalAlpha=dc>0.88?alpha*(1.8+rand()*1.2):alpha*(0.25+rand()*1.0);
    ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(lx+Math.cos(angle)*len,ly+Math.sin(angle)*len);ctx.stroke();
  }
  ctx.restore();
}

// ── Raised bed — pencil sketch style ──────────────────────────────────────────
function _drawBed(ctx, x, y, w, h, isSelected) {
  ctx.save();
  const seed  = Math.round(x*7+y*13+w*3+h*5);
  const DEPTH = 12; // fixed pixel depth — same for all beds regardless of size
  const DX    = -DEPTH * 0.6;
  const DY    = DEPTH * 0.8;
  const th    = h; // top face uses full height — no TILT distortion

  // ── Top face (white, hachured) ───────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(x,   y);
  ctx.lineTo(x+w, y);
  ctx.lineTo(x+w, y+th);
  ctx.lineTo(x,   y+th);
  ctx.closePath();
  ctx.fill();
  _sketchHachure(ctx, x, y, w, th, seed, {alpha:0.10, density:0.016});

  // ── Front face — trapezoid so bottom-left corner meets left face ──────────
  // Top-left of front = (x, y+th), bottom-left = (x+DX, y+th+DY)
  // Top-right of front = (x+w, y+th), bottom-right = (x+w, y+th+DEPTH)
  ctx.fillStyle = "#d0d0d0";
  ctx.beginPath();
  ctx.moveTo(x,    y+th);
  ctx.lineTo(x+w,  y+th);
  ctx.lineTo(x+w,  y+th+DEPTH);
  ctx.lineTo(x+DX, y+th+DY);
  ctx.closePath();
  ctx.fill();

  // ── Left face (darker grey) ──────────────────────────────────────────────
  ctx.fillStyle = "#b0b0b0";
  ctx.beginPath();
  ctx.moveTo(x,    y);
  ctx.lineTo(x+DX, y+DY);
  ctx.lineTo(x+DX, y+th+DY);
  ctx.lineTo(x,    y+th);
  ctx.closePath();
  ctx.fill();

  // ── Sketchy outlines ──────────────────────────────────────────────────────
  _sketchRect(ctx, x, y, w, th, seed, {wobble:2.0, strokesPerUnit:0.10, lineWidth:2.0, alpha:0.88, color:"#1a1a1a"});
  const T = Math.max(4, Math.min(8, Math.min(w,th)*0.07));
  _sketchRect(ctx, x+T, y+T, w-T*2, th-T*2, seed+10, {wobble:1.2, strokesPerUnit:0.07, lineWidth:0.9, alpha:0.35, color:"#1a1a1a"});
  // Front face edges — top and angled bottom
  const rf = _sketchSeededRand(seed+20);
  _sketchEdge(ctx, x,   y+th,      x+w,  y+th,      rf, {wobble:1.2, strokesPerUnit:0.08, lineWidth:1.4, alpha:0.70, color:"#1a1a1a"});
  _sketchEdge(ctx, x+w, y+th+DEPTH, x+DX, y+th+DY,  rf, {wobble:1.0, strokesPerUnit:0.07, lineWidth:1.2, alpha:0.60, color:"#1a1a1a"});
  _sketchEdge(ctx, x+w, y+th,      x+w,  y+th+DEPTH, rf, {wobble:1.0, strokesPerUnit:0.07, lineWidth:1.1, alpha:0.55, color:"#1a1a1a"});
  // Left face edges
  const rl = _sketchSeededRand(seed+30);
  _sketchEdge(ctx, x, y,    x+DX, y+DY,    rl, {wobble:1.4, strokesPerUnit:0.08, lineWidth:1.4, alpha:0.68, color:"#1a1a1a"});
  _sketchEdge(ctx, x, y+th, x+DX, y+th+DY, rl, {wobble:1.0, strokesPerUnit:0.07, lineWidth:1.1, alpha:0.55, color:"#1a1a1a"});

  // ── Corner post X marks ───────────────────────────────────────────────────
  const cs=5;
  [[x,y],[x+w,y],[x+w,y+th],[x,y+th]].forEach(([px,py])=>{
    ctx.save(); ctx.strokeStyle="#1a1a1a"; ctx.lineWidth=1.1; ctx.globalAlpha=0.50;
    ctx.beginPath();ctx.rect(px-cs/2,py-cs/2,cs,cs);ctx.stroke();
    ctx.globalAlpha=0.30;
    ctx.beginPath();ctx.moveTo(px-cs/2+1,py-cs/2+1);ctx.lineTo(px+cs/2-1,py+cs/2-1);ctx.stroke();
    ctx.beginPath();ctx.moveTo(px+cs/2-1,py-cs/2+1);ctx.lineTo(px-cs/2+1,py+cs/2-1);ctx.stroke();
    ctx.restore();
  });

  // ── Selection ring ────────────────────────────────────────────────────────
  if (isSelected) {
    ctx.strokeStyle="#2f5d50"; ctx.lineWidth=2.5; ctx.setLineDash([6,4]);
    ctx.beginPath();
    ctx.moveTo(x-4,    y-4);
    ctx.lineTo(x+w+4,  y-4);
    ctx.lineTo(x+w+4,  y+th+DEPTH+4);
    ctx.lineTo(x+DX-4, y+th+DY+4);
    ctx.lineTo(x+DX-4, y+DY-4);
    ctx.closePath();
    ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
  return { th }; // expose top-face height for label positioning
}

// ── Open ground — pencil sketch style ─────────────────────────────────────────
function _drawOpenGround(ctx, x, y, w, h, isSelected) {
  ctx.save();
  const seed = Math.round(x*11+y*7+w*5+h*3);

  // Light grey fill — soil
  ctx.fillStyle = "#e4e4e4";
  ctx.fillRect(x, y, w, h);

  // Heavier scatter hachure — suggests rough ground
  _sketchHachure(ctx, x, y, w, h, seed,   {alpha:0.13, density:0.022});
  _sketchHachure(ctx, x, y, w, h, seed+3, {alpha:0.07, density:0.010});

  // Sketchy border
  _sketchRect(ctx, x, y, w, h, seed, {wobble:2.0, strokesPerUnit:0.07, lineWidth:1.5, alpha:0.65, color:"#333"});

  // Dashed inner line
  ctx.save(); ctx.strokeStyle="#aaa"; ctx.lineWidth=0.9; ctx.globalAlpha=0.45; ctx.setLineDash([5,5]);
  const ins=5;
  ctx.beginPath(); ctx.rect(x+ins,y+ins,w-ins*2,h-ins*2); ctx.stroke();
  ctx.restore();

  if (isSelected) {
    ctx.strokeStyle="#2f5d50"; ctx.lineWidth=2.5; ctx.setLineDash([6,4]);
    ctx.beginPath(); ctx.rect(x-4,y-4,w+8,h+8); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

// ── Greenhouse ─────────────────────────────────────────────────────────────────
function _drawGreenhouse(ctx, x, y, w, h, isSelected) {
  ctx.save();
  const seed = Math.round(x*7+y*13+w*3+h*5);
  const DEPTH = 12, DX = -DEPTH*0.6, DY = DEPTH*0.8;

  // Glass body fill
  ctx.fillStyle = "#f4f9f8";
  ctx.fillRect(x, y, w, h);
  _sketchHachure(ctx, x, y, w, h, seed, {alpha:0.04, density:0.006});

  // Glass pane vertical lines
  const panes = Math.max(2, Math.floor(w/40));
  for(let i=1;i<panes;i++){
    const px = x + w*(i/panes);
    const rv = _sketchSeededRand(seed+i*10);
    _sketchEdge(ctx, px, y, px, y+h, rv, {wobble:0.7, strokesPerUnit:0.05, lineWidth:0.9, alpha:0.28, color:"#888"});
  }
  // Horizontal mid rail
  const rr = _sketchSeededRand(seed+99);
  _sketchEdge(ctx, x, y+h*0.46, x+w, y+h*0.46, rr, {wobble:0.5, strokesPerUnit:0.05, lineWidth:1.0, alpha:0.35, color:"#888"});

  // Wooden benches along top and bottom long edges
  const bDepth = h * 0.20, bFace = 5, bSeed = seed+200;
  // Back bench
  ctx.fillStyle = "#e8ddd0";
  ctx.fillRect(x+5, y+3, w-10, bDepth);
  _sketchHachure(ctx, x+5, y+3, w-10, bDepth, bSeed, {alpha:0.12, density:0.022});
  const planks = 4;
  for(let i=1;i<planks;i++){
    const py = y+3 + bDepth*(i/planks);
    const rp = _sketchSeededRand(bSeed+i*7);
    _sketchEdge(ctx, x+5, py, x+w-5, py, rp, {wobble:0.5, strokesPerUnit:0.05, lineWidth:0.7, alpha:0.25, color:"#7a6a5a"});
  }
  ctx.fillStyle = "#d4c8b8"; ctx.fillRect(x+5, y+3+bDepth, w-10, bFace);
  _sketchRect(ctx, x+5, y+3, w-10, bDepth+bFace, bSeed+1, {wobble:1.0, strokesPerUnit:0.07, lineWidth:1.1, alpha:0.60, color:"#5a4a3a"});
  // Front bench
  const fbY = y + h - bDepth - bFace - 3;
  ctx.fillStyle = "#e8ddd0";
  ctx.fillRect(x+5, fbY, w-10, bDepth);
  _sketchHachure(ctx, x+5, fbY, w-10, bDepth, bSeed+50, {alpha:0.12, density:0.022});
  for(let i=1;i<planks;i++){
    const py = fbY + bDepth*(i/planks);
    const rp = _sketchSeededRand(bSeed+50+i*7);
    _sketchEdge(ctx, x+5, py, x+w-5, py, rp, {wobble:0.5, strokesPerUnit:0.05, lineWidth:0.7, alpha:0.25, color:"#7a6a5a"});
  }
  ctx.fillStyle = "#d4c8b8"; ctx.fillRect(x+5, fbY+bDepth, w-10, bFace);
  _sketchRect(ctx, x+5, fbY, w-10, bDepth+bFace, bSeed+51, {wobble:1.0, strokesPerUnit:0.07, lineWidth:1.1, alpha:0.60, color:"#5a4a3a"});

  // Front depth face
  ctx.fillStyle = "#d0d0d0";
  ctx.beginPath();
  ctx.moveTo(x, y+h); ctx.lineTo(x+w, y+h);
  ctx.lineTo(x+w, y+h+DEPTH); ctx.lineTo(x+DX, y+h+DY);
  ctx.closePath(); ctx.fill();
  // Left depth face
  ctx.fillStyle = "#b8b8b8";
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x+DX, y+DY);
  ctx.lineTo(x+DX, y+h+DY); ctx.lineTo(x, y+h);
  ctx.closePath(); ctx.fill();

  // Outer frame sketch
  _sketchRect(ctx, x, y, w, h, seed, {wobble:1.6, strokesPerUnit:0.09, lineWidth:1.8, alpha:0.82, color:"#1a1a1a"});
  const T = 5;
  _sketchRect(ctx, x+T, y+T, w-T*2, h-T*2, seed+10, {wobble:0.8, strokesPerUnit:0.06, lineWidth:0.8, alpha:0.28, color:"#1a1a1a"});
  // Depth edges
  const rd = _sketchSeededRand(seed+30);
  _sketchEdge(ctx, x, y+h, x+DX, y+h+DY, rd, {wobble:1.0, strokesPerUnit:0.07, lineWidth:1.2, alpha:0.60, color:"#1a1a1a"});
  _sketchEdge(ctx, x+w, y+h, x+w, y+h+DEPTH, rd, {wobble:1.0, strokesPerUnit:0.07, lineWidth:1.1, alpha:0.55, color:"#1a1a1a"});
  _sketchEdge(ctx, x+w, y+h+DEPTH, x+DX, y+h+DY, rd, {wobble:1.0, strokesPerUnit:0.07, lineWidth:1.1, alpha:0.55, color:"#1a1a1a"});
  // Left depth
  const rl = _sketchSeededRand(seed+31);
  _sketchEdge(ctx, x, y, x+DX, y+DY, rl, {wobble:0.9, strokesPerUnit:0.08, lineWidth:1.2, alpha:0.58, color:"#1a1a1a"});
  _sketchEdge(ctx, x+DX, y+DY, x+DX, y+h+DY, rl, {wobble:0.9, strokesPerUnit:0.07, lineWidth:1.1, alpha:0.52, color:"#1a1a1a"});
  // Corner posts
  const cs=5;
  [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].forEach(([px,py])=>{
    ctx.save(); ctx.strokeStyle="#1a1a1a"; ctx.lineWidth=1.1; ctx.globalAlpha=0.50;
    ctx.beginPath();ctx.rect(px-cs/2,py-cs/2,cs,cs);ctx.stroke();
    ctx.globalAlpha=0.30;
    ctx.beginPath();ctx.moveTo(px-cs/2+1,py-cs/2+1);ctx.lineTo(px+cs/2-1,py+cs/2-1);ctx.stroke();
    ctx.beginPath();ctx.moveTo(px+cs/2-1,py-cs/2+1);ctx.lineTo(px-cs/2+1,py+cs/2-1);ctx.stroke();
    ctx.restore();
  });

  if (isSelected) {
    ctx.strokeStyle="#2f5d50"; ctx.lineWidth=2; ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.rect(x-4,y-4,w+8,h+8); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

// ── Container / pot — pencil sketch style ─────────────────────────────────────
function _drawContainer(ctx, x, y, w, h, isSelected, cropEmojis) {
  ctx.save();

  // Three-pot cluster — painter's order: back-left, back-right (large), front-centre small
  // Matches the sketch design: different-sized pots grouped together with TILT perspective.
  const TILT = 0.55;
  const baseSeed = Math.round(x*9+y*11+w*7+h*3);
  const unit = Math.min(w, h) * 0.28;

  // Pot positions as fractions of bounding box [cxFrac, cyFrac, rxScale, labelIndex, seedOffset]
  // drawn back-to-front so front pot overlaps correctly
  const pots = [
    { cxF:0.30, cyF:0.38, rxS:0.80, labelIdx:1, s:1001 }, // back-left medium
    { cxF:0.62, cyF:0.30, rxS:1.10, labelIdx:0, s:1002 }, // back-right large (main)
    { cxF:0.48, cyF:0.62, rxS:0.56, labelIdx:2, s:1003 }, // front-centre small
  ];

  function drawOnePot(pcx, pcy, rx, label, potSeed) {
    const sry  = rx * TILT;   // squashed rim — perspective
    const cylH = sry * 2.0;   // cylinder body height
    const iRx  = rx  * 0.72;
    const iRy  = sry * 0.68;
    const N    = 40;

    // Cylinder body fill
    ctx.save(); ctx.beginPath(); ctx.rect(pcx-rx,pcy,rx*2,cylH); ctx.fillStyle="#f0f0f0"; ctx.fill(); ctx.restore();
    // Top rim fill
    ctx.save(); ctx.beginPath(); ctx.ellipse(pcx,pcy,rx,sry,0,0,Math.PI*2); ctx.fillStyle="#f0f0f0"; ctx.fill(); ctx.restore();
    // Inner soil fill
    ctx.save(); ctx.beginPath(); ctx.ellipse(pcx,pcy,iRx,iRy,0,0,Math.PI*2); ctx.fillStyle="#e0e0e0"; ctx.fill(); ctx.restore();
    // Soil hachure
    _sketchHachure(ctx, pcx-iRx, pcy-iRy, iRx*2, iRy*2, potSeed+5, {alpha:0.10, density:0.014});

    // Cross-hatch shadow on left side — drawn AFTER fills so it shows
    ctx.save();
    ctx.beginPath();
    ctx.rect(pcx - rx, pcy, rx * 0.65, cylH);
    ctx.clip();
    const sh = _sketchSeededRand(potSeed+888);
    ctx.strokeStyle = "#1a1a1a"; ctx.lineCap = "round";
    const hSpacing = Math.max(3, rx * 0.18);
    for(let ox = -rx; ox < rx * 0.65 + cylH; ox += hSpacing){
      ctx.lineWidth = 0.6 + sh()*0.4; ctx.globalAlpha = 0.22 + sh()*0.14;
      ctx.beginPath();
      ctx.moveTo(pcx - rx + ox, pcy);
      ctx.lineTo(pcx - rx + ox - cylH*0.7, pcy + cylH);
      ctx.stroke();
    }
    for(let ox = -rx; ox < rx * 0.65 + cylH; ox += hSpacing){
      ctx.lineWidth = 0.5 + sh()*0.3; ctx.globalAlpha = 0.14 + sh()*0.10;
      ctx.beginPath();
      ctx.moveTo(pcx - rx + ox - cylH*0.7, pcy);
      ctx.lineTo(pcx - rx + ox, pcy + cylH);
      ctx.stroke();
    }
    ctx.restore();

    // Bottom-left arc shadow
    ctx.save();
    const sh2 = _sketchSeededRand(potSeed+999);
    ctx.strokeStyle="#1a1a1a"; ctx.lineCap="round";
    for(let i=0;i<14;i++){
      const t = i/14;
      const a = Math.PI + t * (Math.PI * 0.55);
      const bx = pcx + Math.cos(a)*rx, by = pcy + cylH + Math.sin(a)*sry*0.38;
      const ang = a + Math.PI*0.38, len = 3 + sh2()*7;
      ctx.lineWidth = 0.5+sh2()*0.5; ctx.globalAlpha = 0.16+sh2()*0.15;
      ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+Math.cos(ang)*len, by+Math.sin(ang)*len); ctx.stroke();
    }
    ctx.restore();

    // Wobbly ellipse outlines
    function sketchEll(erx,ery,sOff,lw,al){
      const r=_sketchSeededRand(potSeed+sOff);
      for(let i=0;i<N;i++){
        const a1=(i/N)*Math.PI*2, a2=((i+1)/N)*Math.PI*2;
        const rw1=1+(r()-0.5)*0.11, rw2=1+(r()-0.5)*0.11;
        if(r()>0.94) continue;
        ctx.save(); ctx.strokeStyle="#1a1a1a"; ctx.lineCap="round";
        ctx.lineWidth=lw+(r()-0.5)*0.38; ctx.globalAlpha=al+(r()-0.5)*0.14;
        ctx.beginPath();
        ctx.moveTo(pcx+Math.cos(a1)*erx*rw1, pcy+Math.sin(a1)*ery*rw1);
        ctx.lineTo(pcx+Math.cos(a2)*erx*rw2, pcy+Math.sin(a2)*ery*rw2);
        ctx.stroke(); ctx.restore();
      }
    }
    sketchEll(rx,sry,10,1.8,0.82);   // outer rim
    sketchEll(iRx,iRy,20,1.1,0.52);  // inner rim / soil

    // Bottom arc — front half only
    const rb=_sketchSeededRand(potSeed+30);
    for(let i=0;i<N/2;i++){
      const a1=(i/(N/2))*Math.PI, a2=((i+1)/(N/2))*Math.PI;
      if(rb()>0.95) continue;
      ctx.save(); ctx.strokeStyle="#1a1a1a"; ctx.lineCap="round";
      ctx.lineWidth=1.4+(rb()-0.5)*0.3; ctx.globalAlpha=0.70+(rb()-0.5)*0.15;
      ctx.beginPath();
      ctx.moveTo(pcx+Math.cos(a1)*rx, pcy+cylH+Math.sin(a1)*sry*0.38);
      ctx.lineTo(pcx+Math.cos(a2)*rx, pcy+cylH+Math.sin(a2)*sry*0.38);
      ctx.stroke(); ctx.restore();
    }

    // Side lines
    const rv=_sketchSeededRand(potSeed+40);
    _sketchEdge(ctx,pcx-rx,pcy,pcx-rx,pcy+cylH,rv,{wobble:1.6,strokesPerUnit:0.08,lineWidth:1.6,alpha:0.80,color:"#1a1a1a"});
    _sketchEdge(ctx,pcx+rx,pcy,pcx+rx,pcy+cylH,rv,{wobble:1.6,strokesPerUnit:0.08,lineWidth:1.1,alpha:0.55,color:"#1a1a1a"});

    // Label inside soil ellipse — handwritten pencil style with clear background
    if(label){
      ctx.save();
      const sz=Math.max(8, Math.min(14, rx*0.55));
      const lr=_sketchSeededRand(potSeed+77);
      const rot=(lr()-0.5)*0.07;
      ctx.translate(pcx, pcy+iRy*0.12);
      ctx.rotate(rot);
      ctx.font=`${sz}px 'Caveat',cursive`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillStyle="#2a2a2a"; ctx.globalAlpha=0.80;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  // Labels: main pot gets first crop name, others get subsequent (or nothing)
  const labels = cropEmojis && cropEmojis.length > 0
    ? [cropEmojis[0]||null, cropEmojis[1]||null, cropEmojis[2]||null]
    : [null, null, null];

  // Draw back-to-front
  for(const p of pots){
    drawOnePot(x + w*p.cxF, y + h*p.cyF, unit*p.rxS, labels[p.labelIdx], baseSeed+p.s);
  }

  if(isSelected){
    ctx.strokeStyle="#2f5d50"; ctx.lineWidth=2; ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.rect(x-4,y-4,w+8,h+8); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

// ── Polytunnel ─────────────────────────────────────────────────────────────────
function _drawPolytunnel(ctx, x, y, w, h, isSelected) {
  ctx.save();
  const TILT=0.45, DX=-16, DY=14, seed=Math.round(x*7+y*13+w*3+h*5);
  const th=h*TILT;
  const TL=[x,y], TR=[x+w,y], BR=[x+w,y+th], BL=[x,y+th];
  const archH=th*0.9, ridgeY=y-archH;
  const nHoops=Math.max(4,Math.floor(w/36));
  const skinColour="rgba(238,238,238,0.60)";

  // Base front face
  ctx.fillStyle="#c0c0c0";
  ctx.beginPath();
  ctx.moveTo(BL[0],BL[1]);ctx.lineTo(BR[0],BR[1]);
  ctx.lineTo(BR[0]+DX,BR[1]+DY);ctx.lineTo(BL[0]+DX,BL[1]+DY);
  ctx.closePath();ctx.fill();
  // Base top soil
  ctx.fillStyle="#dedad4";
  ctx.beginPath();
  ctx.moveTo(TL[0],TL[1]);ctx.lineTo(TR[0],TR[1]);
  ctx.lineTo(BR[0],BR[1]);ctx.lineTo(BL[0],BL[1]);
  ctx.closePath();ctx.fill();
  _sketchHachure(ctx,x,y,w,th,seed+10,{alpha:0.09,density:0.014});
  // Left depth face — full height to ridge
  ctx.fillStyle="#b0b0b0";
  ctx.beginPath();
  ctx.moveTo(TL[0],ridgeY);ctx.lineTo(TL[0]+DX,ridgeY+DY);
  ctx.lineTo(BL[0]+DX,BL[1]+DY);ctx.lineTo(BL[0],BL[1]);
  ctx.lineTo(TL[0],TL[1]);ctx.closePath();ctx.fill();
  _sketchHachure(ctx,TL[0]+DX-2,ridgeY,Math.abs(DX)+4,BL[1]+DY-ridgeY,seed+77,{alpha:0.11,density:0.018});

  // Plastic skin fills
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(TL[0],TL[1]);ctx.lineTo(TL[0],ridgeY);
  ctx.lineTo(TR[0],ridgeY);ctx.lineTo(TR[0],TR[1]);
  ctx.closePath();ctx.fillStyle=skinColour;ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(TR[0],TR[1]);ctx.lineTo(TR[0],ridgeY);
  ctx.lineTo(BR[0],ridgeY);ctx.lineTo(BR[0],BR[1]);
  ctx.closePath();ctx.fillStyle=skinColour;ctx.fill();
  ctx.restore();

  // Interior hoops — curved arches
  for(let i=1;i<nHoops;i++){
    const t=i/nHoops;
    const topX=TL[0]+w*t,topY=TL[1];
    const botX=BL[0]+w*t,botY=BL[1];
    const midX=(topX+botX)/2;
    const rh=_sketchSeededRand(seed+i*17);
    ctx.save();ctx.strokeStyle="#1a1a1a";ctx.lineCap="round";
    ctx.lineWidth=1.2+(rh()-0.5)*0.25;ctx.globalAlpha=0.55+(rh()-0.5)*0.10;
    ctx.beginPath();
    ctx.moveTo(topX,topY);
    ctx.quadraticCurveTo(midX+(rh()-0.5)*3,ridgeY+(rh()-0.5)*3,midX,ridgeY);
    ctx.quadraticCurveTo(midX+(rh()-0.5)*3,ridgeY+(rh()-0.5)*3,botX,botY);
    ctx.stroke();ctx.restore();
  }

  // Ridge line
  const rr=_sketchSeededRand(seed+99);
  _sketchEdge(ctx,TL[0],ridgeY,TR[0],ridgeY,rr,{wobble:0.8,strokesPerUnit:0.07,lineWidth:1.5,alpha:0.78,color:"#1a1a1a"});

  // Front end cap
  ctx.save();ctx.strokeStyle="#1a1a1a";ctx.lineCap="round";ctx.lineWidth=1.8;ctx.globalAlpha=0.82;
  ctx.beginPath();
  ctx.moveTo(TR[0],TR[1]);
  ctx.quadraticCurveTo(TR[0]+10,(TR[1]+ridgeY)/2,TR[0],ridgeY);
  ctx.quadraticCurveTo(TR[0]+10,(ridgeY+BR[1])/2,BR[0],BR[1]);
  ctx.stroke();ctx.restore();

  // Back end cap
  ctx.save();ctx.strokeStyle="#1a1a1a";ctx.lineCap="round";ctx.lineWidth=1.7;ctx.globalAlpha=0.78;
  ctx.beginPath();
  ctx.moveTo(TL[0],TL[1]);
  ctx.quadraticCurveTo(TL[0]-18,(TL[1]+ridgeY)/2,TL[0],ridgeY);
  ctx.quadraticCurveTo(BL[0]-18,(ridgeY+BL[1])/2,BL[0],BL[1]);
  ctx.stroke();ctx.restore();

  // Left face outline
  const rl=_sketchSeededRand(seed+31);
  _sketchEdge(ctx,TL[0],ridgeY,TL[0]+DX,ridgeY+DY,rl,{wobble:0.9,strokesPerUnit:0.08,lineWidth:1.3,alpha:0.65,color:"#1a1a1a"});
  _sketchEdge(ctx,TL[0]+DX,ridgeY+DY,BL[0]+DX,BL[1]+DY,rl,{wobble:0.9,strokesPerUnit:0.07,lineWidth:1.2,alpha:0.58,color:"#1a1a1a"});

  // Base outline
  const rb=_sketchSeededRand(seed+30);
  _sketchEdge(ctx,TL[0],TL[1],TR[0],TR[1],rb,{wobble:1.4,strokesPerUnit:0.09,lineWidth:1.9,alpha:0.86,color:"#1a1a1a"});
  _sketchEdge(ctx,BL[0],BL[1],BR[0],BR[1],rb,{wobble:1.4,strokesPerUnit:0.09,lineWidth:1.9,alpha:0.86,color:"#1a1a1a"});
  _sketchEdge(ctx,BL[0]+DX,BL[1]+DY,BR[0]+DX,BR[1]+DY,rb,{wobble:1.1,strokesPerUnit:0.08,lineWidth:1.4,alpha:0.68,color:"#1a1a1a"});
  _sketchEdge(ctx,BL[0],BL[1],BL[0]+DX,BL[1]+DY,rb,{wobble:0.9,strokesPerUnit:0.08,lineWidth:1.3,alpha:0.62,color:"#1a1a1a"});
  _sketchEdge(ctx,BR[0],BR[1],BR[0]+DX,BR[1]+DY,rb,{wobble:0.9,strokesPerUnit:0.08,lineWidth:1.3,alpha:0.62,color:"#1a1a1a"});
  _sketchEdge(ctx,TL[0],TL[1],TL[0]+DX,TL[1]+DY,rb,{wobble:0.9,strokesPerUnit:0.08,lineWidth:1.2,alpha:0.58,color:"#1a1a1a"});

  if (isSelected) {
    ctx.strokeStyle="#2f5d50"; ctx.lineWidth=2; ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.rect(x-4,y-4,w+8,h+8); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

// ── Tree (apple/pear/fruit) ────────────────────────────────────────────────────
function _drawTree(ctx, x, y, w, h) {
  ctx.save();
  const cx = x + w/2;
  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath(); ctx.ellipse(cx+3, y+h-3, w*.3, h*.065, 0, 0, Math.PI*2); ctx.fill();
  // trunk
  const tg = ctx.createLinearGradient(cx-5, 0, cx+5, 0);
  tg.addColorStop(0, "#906040"); tg.addColorStop(.5, "#7A5030"); tg.addColorStop(1, "#5A3820");
  ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(cx-4.5, y+h*.52, 9, h*.46, 2.5); ctx.fill();
  ctx.strokeStyle = "#7A5030"; ctx.lineWidth = 1.8; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx-4, y+h*.9); ctx.lineTo(cx-w*.22, y+h-.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+3, y+h*.9); ctx.lineTo(cx+w*.2, y+h-.4); ctx.stroke();
  // canopy layers
  ctx.fillStyle = "#3E6D35"; ctx.beginPath(); ctx.arc(cx, y+h*.28, w*.38, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#527845"; ctx.beginPath(); ctx.arc(cx-w*.18, y+h*.22, w*.28, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#628850"; ctx.beginPath(); ctx.arc(cx+w*.15, y+h*.18, w*.26, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(130,185,100,0.18)"; ctx.beginPath(); ctx.arc(cx-w*.1, y+h*.14, w*.17, 0, Math.PI*2); ctx.fill();
  // fruit
  [{dx:-12,dy:18,r:5,c:"#BC2018"},{dx:10,dy:24,r:4.5,c:"#CC3020"},{dx:2,dy:8,r:4,c:"#C02018"},{dx:18,dy:14,r:3.5,c:"#D49020"}].forEach(f => {
    ctx.fillStyle = "rgba(0,0,0,0.11)"; ctx.beginPath(); ctx.arc(cx+f.dx+1.5, y+f.dy+2, f.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(cx+f.dx, y+f.dy, f.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(cx+f.dx-1.2, y+f.dy-1.2, f.r*.32, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

// ── Bush / berry ───────────────────────────────────────────────────────────────
function _drawBush(ctx, x, y, w, h) {
  ctx.save();
  const cx = x+w/2, cy = y+h*.55;
  ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.beginPath(); ctx.ellipse(cx+2, y+h-3, w*.35, h*.07, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#3E6D35"; ctx.beginPath(); ctx.arc(cx, cy, w*.42, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#527845"; ctx.beginPath(); ctx.arc(cx-w*.2, cy-h*.08, w*.3, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#628850"; ctx.beginPath(); ctx.arc(cx+w*.18, cy-h*.1, w*.26, 0, Math.PI*2); ctx.fill();
  // berries
  [[-.25,.1],[.15,.22],[.32,-.04],[-.05,.32],[.24,-.28]].forEach(([bx,by]) => {
    ctx.fillStyle = "#5A2890"; ctx.beginPath(); ctx.arc(cx+bx*w, cy+by*h, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(120,60,180,0.45)"; ctx.beginPath(); ctx.arc(cx+bx*w-1.5, cy+by*h-1.5, 1.8, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

// ── Crop sprite system ─────────────────────────────────────────────────────────
// Each function draws one crop instance at (cx, cy) with scale sc

function _cropCarrot(ctx, cx, cy, sc) {
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.beginPath(); ctx.ellipse(cx+1, cy+8*sc, 4.5*sc, 1.4, 0, 0, Math.PI*2); ctx.fill();
  // stems with slight lean variation
  for (let s = -1; s <= 1; s++) {
    const lean = _jit(cx*s+cy, 1.5);
    ctx.strokeStyle = s === 0 ? K.l3 : K.l1d; ctx.lineWidth = 1*sc; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cx+s*2.5*sc, cy+4*sc);
    ctx.quadraticCurveTo(cx+s*4*sc+lean, cy-1*sc, cx+s*1.5*sc+lean, cy-7*sc); ctx.stroke();
  }
  ctx.fillStyle = "#588040"; ctx.globalAlpha = .88;
  ctx.beginPath(); ctx.ellipse(cx-2.5*sc, cy-7*sc, 2.5*sc, 5*sc, -.4+_jit(cx+11,.3), 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#6A9850"; ctx.beginPath();
  ctx.ellipse(cx+1.5*sc, cy-8*sc, 2*sc, 4.5*sc, .3+_jit(cy+13,.25), 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
}

function _cropPotato(ctx, cx, cy, sc) {
  ctx.fillStyle = "rgba(0,0,0,0.13)"; ctx.beginPath(); ctx.ellipse(cx+1.5, cy+2, 7*sc, 3, 0, 0, Math.PI*2); ctx.fill();
  const pg = ctx.createRadialGradient(cx-2*sc, cy-2*sc, 1, cx+1*sc, cy+1*sc, 8*sc);
  pg.addColorStop(0, "#C8A465"); pg.addColorStop(.5, "#A07C38"); pg.addColorStop(1, "#7A5828");
  ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(cx, cy, 8*sc, 6.5*sc, _jit(cx+cy,.4), 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.beginPath(); ctx.ellipse(cx-2.5*sc, cy-2*sc, 2*sc, 1.5*sc, -.35, 0, Math.PI*2); ctx.fill();
}

function _cropOnion(ctx, cx, cy, sc) {
  ctx.fillStyle = "rgba(0,0,0,0.11)"; ctx.beginPath(); ctx.ellipse(cx+1, cy+2, 6*sc, 2.4, 0, 0, Math.PI*2); ctx.fill();
  const og = ctx.createRadialGradient(cx-1.5*sc, cy-1*sc, 0, cx+1*sc, cy+1*sc, 6.5*sc);
  og.addColorStop(0, "#D0A848"); og.addColorStop(.55, "#A88020"); og.addColorStop(1, "#806010");
  ctx.fillStyle = og; ctx.beginPath(); ctx.ellipse(cx, cy, 6.5*sc, 5.5*sc, _jit(cx*cy,.3), 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#4A7038"; ctx.lineWidth = .9*sc; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx+_jit(cx,.8), cy-5.5*sc);
  ctx.quadraticCurveTo(cx+1.5*sc, cy-10*sc, cx+_jit(cx+1,1)*sc, cy-14*sc); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.ellipse(cx-2*sc, cy-1.5*sc, 1.8*sc, 1.2*sc, -.3, 0, Math.PI*2); ctx.fill();
}

function _cropLettuce(ctx, cx, cy, sc) {
  ctx.fillStyle = "rgba(0,0,0,0.09)"; ctx.beginPath(); ctx.ellipse(cx+1, cy+2, 8*sc, 3, 0, 0, Math.PI*2); ctx.fill();
  const angles = [-55,-22,12,44,75,-85];
  angles.forEach((a, i) => {
    const rad = a * Math.PI / 180;
    ctx.fillStyle = i%2 === 0 ? "#5A8842" : "#6E9C56";
    ctx.globalAlpha = .85;
    ctx.beginPath();
    ctx.ellipse(cx+Math.sin(rad)*4.5*sc, cy-Math.cos(rad)*4.5*sc, 4.5*sc, 7.5*sc, rad+_jit(i*7,.15), 0, Math.PI*2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.08)"; ctx.beginPath(); ctx.arc(cx, cy, 3.5*sc, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(185,230,150,0.65)"; ctx.beginPath(); ctx.arc(cx, cy, 2.5*sc, 0, Math.PI*2); ctx.fill();
}

// Generic leafy fallback — for brassicas, herbs, salad, legumes etc
function _cropLeafy(ctx, cx, cy, sc) {
  ctx.fillStyle = "rgba(0,0,0,0.09)"; ctx.beginPath(); ctx.ellipse(cx+1, cy+2, 7*sc, 2.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = K.l3; ctx.beginPath(); ctx.ellipse(cx, cy, 6*sc, 8*sc, _jit(cx,.25), 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = K.l2; ctx.beginPath(); ctx.ellipse(cx-3*sc, cy-2*sc, 4*sc, 6*sc, -.3+_jit(cy,.2), 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = K.l1; ctx.beginPath(); ctx.ellipse(cx+3*sc, cy-3*sc, 3.5*sc, 5.5*sc, .4+_jit(cx+cy,.2), 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "rgba(170,225,130,0.5)"; ctx.beginPath(); ctx.arc(cx, cy-1*sc, 2*sc, 0, Math.PI*2); ctx.fill();
}

// Tomato plant
function _cropTomato(ctx, cx, cy, sc) {
  ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.beginPath(); ctx.ellipse(cx+1, cy+9*sc, 5*sc, 2, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#8B6B3D"; ctx.lineWidth = 1.5*sc;
  ctx.beginPath(); ctx.moveTo(cx+6*sc, cy+8*sc); ctx.lineTo(cx+6*sc, cy-8*sc); ctx.stroke();
  ctx.fillStyle = K.l3; ctx.beginPath(); ctx.ellipse(cx, cy, 5*sc, 7*sc, -.15, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = K.l2; ctx.beginPath(); ctx.ellipse(cx-4*sc, cy-2*sc, 3.5*sc, 5*sc, .2, 0, Math.PI*2); ctx.fill();
  [{x:-5,y:2,r:3,c:"#CC2A1A"},{x:3,y:-1,r:2.5,c:"#E03A20"},{x:-1,y:-7,r:2,c:"#FF6030"}].forEach(t => {
    ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.beginPath(); ctx.arc(cx+t.x*sc+1, cy+t.y*sc+1.5, t.r*sc, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = t.c; ctx.beginPath(); ctx.arc(cx+t.x*sc, cy+t.y*sc, t.r*sc, 0, Math.PI*2); ctx.fill();
  });
}

// Crop family → sprite function mapping
function _getCropSprite(name) {
  const n = (name||"").toLowerCase();
  if (/carrot|parsnip|beetroot|radish|turnip|swede/.test(n)) return _cropCarrot;
  if (/potato/.test(n)) return _cropPotato;
  if (/onion|garlic|leek|shallot/.test(n)) return _cropOnion;
  if (/lettuce|salad|rocket|spinach|chard|endive|sorrel/.test(n)) return _cropLettuce;
  if (/tomato|pepper|chilli/.test(n)) return _cropTomato;
  return _cropLeafy;
}

// ── Crop grid renderer ─────────────────────────────────────────────────────────
// Draws a tiled grid of one crop sprite inside a clipped region with organic variation
function _drawCropGrid(ctx, x, y, w, h, cropName, cellW, cellH) {
  const emoji = getCropEmoji(cropName);
  const emojiSize = Math.max(10, Math.min(15, Math.min(cellW, cellH) * 0.78));
  const PAD = 1;
  const usableW = w - PAD * 2;
  const usableH = h - PAD * 2;
  const cols = Math.max(1, Math.floor(usableW / (emojiSize + 2)));
  const rows = Math.max(1, Math.min(3, Math.floor(usableH / (emojiSize + 2))));
  const cw = usableW / cols;
  const ch = usableH / rows;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.font = `${emojiSize}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const seed = r * 19 + c * 37;
      const jx = _jit(seed, 1.2);
      const jy = _jit(seed + 1, 1.2);
      ctx.fillText(emoji, x + PAD + c * cw + cw / 2 + jx, y + PAD + r * ch + ch / 2 + jy);
    }
  }
  ctx.restore();
}

// ── Area renderer — dispatches to correct drawing function ────────────────────
function _drawAreaShape(ctx, area, x, y, w, h, isSelected, areaCrops) {
  switch(area.type) {
    case "raised_bed":   _drawBed(ctx, x, y, w, h, isSelected); break;
    case "open_ground":  _drawOpenGround(ctx, x, y, w, h, isSelected); break;
    case "greenhouse":   _drawGreenhouse(ctx, x, y, w, h, isSelected); break;
    case "container":    _drawContainer(ctx, x, y, w, h, isSelected, (areaCrops||[]).filter(c=>c.status!=="planned").map(c=>c.name)); break;
    case "polytunnel":   _drawPolytunnel(ctx, x, y, w, h, isSelected); break;
    default:             _drawBed(ctx, x, y, w, h, isSelected);
  }
}

// ── Crops inside an area — sketch style text label ────────────────────────────
function _drawAreaCrops(ctx, area, x, y, w, h, areaCrops) {
  const activeCrops = areaCrops.filter(c => c.status !== "planned");
  if (!activeCrops.length) return;
  if (area.type === "container") return;

  const unique = [];
  const seen = new Set();
  for (const c of activeCrops) { if (!seen.has(c.name)) { seen.add(c.name); unique.push(c); } }
  if (!unique.length) return;

  // Strip parenthetical suffixes e.g. "(from seed)", "(variety)" — show just the crop name
  const cleanName = (name) => name.replace(/\s*\(.*?\)\s*/g, "").trim();

  // Always show crop names — join with line break if multiple, never "N crops"
  const lines = unique.slice(0, 3).map(c => cleanName(c.name));

  // Top face uses full height — no TILT distortion
  const isBed = area.type === "raised_bed";
  const topH  = h;

  // Rotate along longest axis
  const isPortrait = topH > w * 1.4;
  const maxDim = isPortrait ? topH : w;

  // Size font to fit — measure against available width, scale down if needed
  let fs = Math.max(10, Math.min(18, maxDim * 0.16));
  // Rough check: if longest line would overflow, reduce
  const availW = isPortrait ? topH * 0.85 : w * 0.85;
  const approxCharW = fs * 0.55;
  const longestChars = Math.max(...lines.map(l => l.length));
  if (longestChars * approxCharW > availW) {
    fs = Math.max(8, Math.floor(availW / (longestChars * 0.55)));
  }

  // Centre point is within the top face
  const cy = isBed ? y + topH * 0.50 : y + h * 0.50;
  const cx = x + w / 2;

  const labelSeed = _sketchSeededRand(Math.round(x*3+y*7+w*2));
  const wobble = (labelSeed() - 0.5) * 0.05;
  const rot = isPortrait ? -Math.PI/2 + wobble : wobble;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.font = `${fs}px 'Caveat', cursive`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Measure text block so we can clear the hachure behind it
  const lineH = fs * 1.15;
  const totalH = lines.length === 1 ? fs : lineH * lines.length;
  const maxTextW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const padX = fs * 0.6, padY = fs * 0.35;

  // Draw text directly — no background
  ctx.fillStyle = "#111111";
  ctx.globalAlpha = 1.0;

  if (lines.length === 1) {
    ctx.fillText(lines[0], 0, 0);
  } else {
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, -totalH/2 + lineH*i + lineH/2);
    });
  }
  ctx.restore();
}


// ── Label — only on selected area, subtle pill inside soil ──────────────────────
function _drawAreaLabel(ctx, area, x, y, w, h, name) {
  const isLandscape = w >= h;
  const T = Math.max(5, Math.min(8, w*.06));
  const fs = Math.max(7, Math.min(9, Math.min(w,h) * .07));
  ctx.save();
  ctx.font = `700 ${fs}px sans-serif`;
  ctx.textAlign = "center";
  if (isLandscape) {
    const textW = Math.min(ctx.measureText(name).width + 10, w - T*2 - 10);
    const pillH = fs + 5;
    const px = x + w/2, py = y + h - T - 4 - pillH/2;
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath();
    ctx.roundRect(px - textW/2, py - pillH/2, textW, pillH, pillH/2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.textBaseline = "middle";
    ctx.fillText(name, px, py, textW - 6);
  } else {
    const maxLen = h - T*2 - 10;
    const textW = Math.min(ctx.measureText(name).width + 10, maxLen);
    const pillH = fs + 5;
    ctx.translate(x + T + 4 + pillH/2, y + h/2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath();
    ctx.roundRect(-textW/2, -pillH/2, textW, pillH, pillH/2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.textBaseline = "middle";
    ctx.fillText(name, 0, 0, textW - 6);
  }
  ctx.restore();
}

// ── Main Konva canvas component ────────────────────────────────────────────────
function GardenKonvaCanvas({ areas, crops, pxPerM, canvasW, canvasH, stageW, stageH, stageScale, activeBlock, onTap, onDragEnd, onRotate, onZoomChange, zoom }) {
  const stageRef = useRef(null);
  const lastDistRef = useRef(null);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (_textureCache.state !== "ready")     _ensureBarkTexture(() => forceUpdate(n => n + 1));
    if (_soilTextureCache.state !== "ready") _ensureSoilTexture(() => forceUpdate(n => n + 1));
    if (_bedImgCache.state !== "ready")      _ensureBedImg(() => forceUpdate(n => n + 1));
    if (_potImgCache.state !== "ready")      _ensurePotImg(() => forceUpdate(n => n + 1));
  }, []);
  const { Stage, Layer, Shape, Rect, Group, Text } = window.KonvaReact || {};

  // Load bark texture on mount — force re-render once it's ready so canvas repaints
  useEffect(() => {
    if (_textureCache.state === "ready") return;
    _ensureBarkTexture(() => forceUpdate(n => n + 1));
  }, []);

  if (!Stage) return (
    <div style={{ height: canvasH, display: "flex", alignItems: "center", justifyContent: "center", background: K.g1, color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
      Preparing your garden…
    </div>
  );

  const PAD = 24;
  const cropsByArea = {};
  for (const area of areas) cropsByArea[area.id] = crops.filter(c => c.area_id === area.id);

  // Pinch-to-zoom
  const handleTouchMove = (e) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) { lastDistRef.current = null; return; }
    e.evt.preventDefault();
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (lastDistRef.current !== null && onZoomChange) onZoomChange(dist - lastDistRef.current);
    lastDistRef.current = dist;
  };
  const handleTouchEnd = () => { lastDistRef.current = null; };

  const sc = stageScale || 1;

  return (
    <Stage
      ref={stageRef}
      width={stageW || canvasW}
      height={stageH || canvasH}
      scaleX={sc} scaleY={sc}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Layer>
        {/* Ground */}
        <Shape
          sceneFunc={(ctx) => { _drawGround(ctx, 0, 0, canvasW, canvasH); }}
          width={canvasW} height={canvasH}
          listening={false}
        />

        {/* Areas */}
        {areas.map(area => {
          const rot90 = area.rotation === 90 || area.rotation === 270;
          const w = (rot90 ? (area.length_m||2) : (area.width_m||2)) * pxPerM;
          const h = (rot90 ? (area.width_m||2) : (area.length_m||2)) * pxPerM;
          const ax = PAD + (area.layout_x||0) * pxPerM;
          const ay = PAD + (area.layout_y||0) * pxPerM;
          const isSelected = activeBlock === area.id;
          const areaCrops = cropsByArea[area.id] || [];
          const name = area.name.replace(/^"|"$/g, "").toUpperCase();

          const handleR = 14;
          const handleX = w + 6;
          const handleY = -6;

          // Special area types that use tree/bush rendering instead of crop grid
          const isTree = area.type === "tree" || /apple|pear|plum|cherry|fig/.test((area.name||"").toLowerCase());
          const isBush = /berry|bush|blueberry|raspberry|gooseberry|currant/.test((area.name||"").toLowerCase());

          return (
            <Group key={area.id}
              x={ax} y={ay}
              draggable
              onDragEnd={e => {
                const nx = (e.target.x() - PAD) / pxPerM;
                const ny = (e.target.y() - PAD) / pxPerM;
                onDragEnd(area.id, Math.max(0,nx), Math.max(0,ny));
              }}
              onClick={() => onTap(area.id)}
              onTap={() => onTap(area.id)}
            >
              {/* Explicit hit rect — constrain to bed bounds only */}
              <Rect x={0} y={0} width={w} height={h} fill="transparent" />

              {/* Area shape */}
              <Shape
                sceneFunc={(ctx) => {
                  if (isTree) {
                    _drawTree(ctx, 0, 0, w, h);
                  } else if (isBush) {
                    _drawBush(ctx, 0, 0, w, h);
                  } else {
                    _drawAreaShape(ctx, area, 0, 0, w, h, isSelected, areaCrops);
                  }
                }}
                width={w} height={h}
                listening={false}
              />

              {/* Crops */}
              {!isTree && !isBush && (
                <Shape
                  sceneFunc={(ctx) => { _drawAreaCrops(ctx, area, 0, 0, w, h, areaCrops); }}
                  width={w} height={h}
                  listening={false}
                />
              )}

              {/* Label removed */}

              {/* Rotate handle — in non-listening wrapper so it doesn't expand hit area */}
              {isSelected && onRotate && (
                <Group listening={false}>
                  <Group
                    x={handleX} y={handleY}
                    draggable
                    listening={true}
                    dragBoundFunc={() => ({ x: ax + handleX, y: ay + handleY })}
                    onDragMove={e => {
                      const stage = e.target.getStage();
                      const pos = stage.getPointerPosition();
                      const centrX = ax + w/2, centrY = ay + h/2;
                      const angle = Math.atan2(pos.y - centrY, pos.x - centrX) * 180 / Math.PI;
                      const normalised = ((Math.round(angle/45)*45 % 360) + 360) % 360;
                      onRotate(area.id, normalised, false);
                    }}
                    onDragEnd={e => {
                      const stage = e.target.getStage();
                      const pos = stage.getPointerPosition();
                      const centrX = ax + w/2, centrY = ay + h/2;
                      const angle = Math.atan2(pos.y - centrY, pos.x - centrX) * 180 / Math.PI;
                      const normalised = ((Math.round(angle/45)*45 % 360) + 360) % 360;
                      onRotate(area.id, normalised, true);
                      e.target.x(handleX); e.target.y(handleY);
                    }}
                  >
                    <Shape
                      sceneFunc={(ctx, shape) => {
                        ctx.beginPath(); ctx.arc(0, 0, handleR, 0, Math.PI*2);
                        ctx.fillStyle = "#2F5D50"; ctx.fill();
                        ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1.5; ctx.stroke();
                        ctx.font = `bold ${handleR}px sans-serif`;
                        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        ctx.fillText("↻", 0, 1);
                        ctx.fillStrokeShape(shape);
                      }}
                      width={handleR*2} height={handleR*2}
                      x={-handleR} y={-handleR}
                    />
                  </Group>
                </Group>
              )}

              {/* Empty state */}
              {!isTree && !isBush && areaCrops.filter(c => c.status !== "planned").length === 0 && (
                <Text
                  x={0} y={h/2-7} width={w} align="center"
                  text="Empty" fontSize={9}
                  fill="rgba(255,255,255,0.22)" fontStyle="italic"
                  listening={false}
                />
              )}
            </Group>
          );
        })}
      </Layer>
    </Stage>
  );
}
// ── Konva loader ──────────────────────────────────────────────────────────────
function useKonva() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.KonvaReact) { setReady(true); return; }
    import("react-konva").then(mod => {
      window.KonvaReact = mod;
      setReady(true);
    }).catch(e => console.error("[Konva] load failed:", e));
  }, []);
  return ready;
}

// ── Area detail sheet ─────────────────────────────────────────────────────────
function AreaDetailSheet({ area, crops, onClose }) {
  const baseColor = {
    raised_bed: K.timber, open_ground: K.groundLight,
    greenhouse: K.ghFrame, container: K.pot, polytunnel: K.tunnelHoop,
  }[area.type] || K.groundLight;
  const hasDimensions = area.width_m && area.length_m;
  const sqm = hasDimensions ? (area.width_m * area.length_m).toFixed(1) : null;
  const statusColor = { growing:C.leaf, sown_indoors:C.amber, sown_outdoors:C.amber, transplanted:C.forest, planned:C.stone, harvested:C.stone };
  const statusLabel = { growing:"Growing", sown_indoors:"Indoors", sown_outdoors:"Outdoors", transplanted:"Transplanted", planned:"Planned", harvested:"Harvested" };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:900, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480, maxHeight:"82vh", display:"flex", flexDirection:"column" }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 0" }}>
          <div style={{ width:36, height:4, borderRadius:2, background:"#ddd" }} />
        </div>
        <div style={{ margin:"12px 16px 0", borderRadius:14, padding:"14px 16px",
          background:`linear-gradient(135deg, ${baseColor}dd, ${baseColor}99)` }}>
          <div style={{ fontFamily:"serif", fontSize:18, fontWeight:700, color:"rgba(255,255,255,0.9)" }}>
            {area.name.replace(/^"|"$/g,"")}
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", marginTop:2 }}>
            {(area.type||"area").replace(/_/g," ")}
            {sqm?` · ${area.width_m}m × ${area.length_m}m · ${sqm}m²`:" · dimensions not set"}
          </div>
        </div>
        {!hasDimensions && (
          <div style={{ margin:"10px 16px 0", background:"#fff8e6", border:"1px solid #f0d080", borderRadius:10, padding:"8px 12px", fontSize:12, color:"#7a5c00", fontWeight:600 }}>
            📐 Add dimensions in Garden tab for accurate scale
          </div>
        )}
        <div style={{ overflowY:"auto", flex:1, padding:"12px 20px 40px" }}>
          {crops.length===0 ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:C.stone }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🌱</div>
              <div style={{ fontFamily:"serif", fontSize:15, fontWeight:700, marginBottom:4 }}>Empty bed</div>
              <div style={{ fontSize:13 }}>Nothing planted here this season</div>
            </div>
          ) : crops.map(crop=>(
            <div key={crop.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:22, flexShrink:0 }}>{getCropEmoji(crop.name)}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, color:"#1a1a1a", fontFamily:"serif" }}>{crop.name}</div>
                {crop.variety && <div style={{ fontSize:12, color:C.stone }}>{typeof crop.variety==="object"?crop.variety.name:crop.variety}</div>}
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:statusColor[crop.status]||C.stone, background:(statusColor[crop.status]||C.stone)+"18", borderRadius:20, padding:"3px 10px", flexShrink:0 }}>
                {statusLabel[crop.status]||crop.status||"Growing"}
              </div>
            </div>
          ))}
          <div style={{ marginTop:20, background:"#F7F8F5", border:"1px solid #E3E7E1", borderRadius:14, padding:"14px 16px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.stone, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Area insights</div>
            <div style={{ display:"flex", gap:8 }}>
              {[["📊","Yield"],["🔄","Rotation"],["📐","Space"]].map(([icon,label])=>(
                <div key={label} style={{ flex:1, background:"#fff", border:"1px solid #E3E7E1", borderRadius:10, padding:"10px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:16, marginBottom:4, opacity:0.55 }}>{icon}</div>
                  <div style={{ fontSize:10, color:C.stone, marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:C.stone }}>🔒 Pro</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Plan helpers ──────────────────────────────────────────────────────────────
const PLAN_STATUS_LABEL = { draft: "Draft", committed: "Committed", archived: "Archived" };
const PLAN_STATUS_COLOUR = { draft: "#D9A441", committed: "#2F5D50", archived: "#9E9E9E" };

function PlanBadge({ status }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
      textTransform: "uppercase", padding: "2px 7px", borderRadius: 20,
      background: PLAN_STATUS_COLOUR[status] + "22",
      color: PLAN_STATUS_COLOUR[status], border: `1px solid ${PLAN_STATUS_COLOUR[status]}44`,
    }}>
      {PLAN_STATUS_LABEL[status]}
    </span>
  );
}

// Sheet to create a new plan
// ── Plan creation flow: goal picker → generate → compare → select ─────────────

const PLAN_GOALS = [
  { id: "rotate_mine",   emoji: "🔄", label: "Rotate what I grow",  desc: "Keep your current crops but move them to the right beds" },
  { id: "best_rotation", emoji: "🔁", label: "Best rotation",        desc: "Protect soil health by moving crop families around" },
  { id: "max_yield",     emoji: "🌾", label: "Max yield",            desc: "Get the most food from your space this season" },
  { id: "favourites",    emoji: "❤️",  label: "My favourites",       desc: "Prioritise the crops you love growing most" },
  { id: "easy",          emoji: "🧘", label: "Easy season",          desc: "Low maintenance crops, less work" },
  { id: "balanced",      emoji: "⚖️",  label: "Balanced",            desc: "A bit of everything — yield, rotation and ease" },
];

function ScoreBar({ label, value, max = 10, colour = C.forest }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <div style={{ fontSize:10, fontWeight:700, color:C.stone, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>
        <div style={{ fontSize:10, fontWeight:700, color:colour }}>{value}/{max}</div>
      </div>
      <div style={{ height:4, borderRadius:99, background:"#E8EDE8", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${(value/max)*100}%`, background:colour, borderRadius:99, transition:"width 0.4s" }} />
      </div>
    </div>
  );
}

function PlanOptionCard({ option, index, selected, onSelect, recommended }) {
  const colours    = [C.forest, "#2D6E9E", "#7B5EA7"];
  const colour     = colours[index] || C.forest;
  const isSelected = selected === index;
  const m          = option.metrics || {};

  return (
    <div onClick={() => onSelect(index)}
      style={{ borderRadius:16, border:`2px solid ${isSelected ? colour : C.border}`, background: isSelected ? colour+"08" : "#fff", padding:"16px 14px", cursor:"pointer", transition:"border-color 0.15s, background 0.15s", marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontFamily:"serif", fontSize:15, fontWeight:700, color:"#1a1a1a" }}>{option.name}</div>
          {recommended && (
            <div style={{ fontSize:10, fontWeight:700, color:"#fff", background:C.forest, borderRadius:99, padding:"2px 7px" }}>Recommended</div>
          )}
        </div>
        <div style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${isSelected ? colour : C.border}`, background: isSelected ? colour : "#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {isSelected && <div style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }} />}
        </div>
      </div>

      {(option.summary || option.explanation) && (
        <div style={{ fontSize:12, color:C.stone, lineHeight:1.5, marginBottom:12 }}>{option.summary || option.explanation}</div>
      )}

      {/* Performance strip — show if new metrics exist, else fall back to score bars */}
      {m.harvest_kg != null ? (
        <div style={{ display:"flex", background:"#f8faf8", borderRadius:10, marginBottom:12, overflow:"hidden", border:`1px solid ${C.border}` }}>
          {[
            { label:"Harvest",    value: `${m.harvest_kg}kg` },
            { label:"Shop Value", value: m.shop_value_gbp != null ? `£${Math.round(m.shop_value_gbp)}` : "—" },
            { label:"Space Use",  value: m.space_use_delta_pct != null ? `${m.space_use_delta_pct>0?"+":""}${m.space_use_delta_pct}%` : "—" },
            { label:"Effort",     value: m.effort_level || "—",
              color: m.effort_level==="Easy"?"#2a7a40":m.effort_level==="High"?"#b84c00":colour },
          ].map((item, i, arr) => (
            <div key={i} style={{ flex:1, padding:"8px 4px", textAlign:"center", borderRight: i<arr.length-1?`1px solid ${C.border}`:"none" }}>
              <div style={{ fontSize:14, fontWeight:700, color:item.color||colour, fontFamily:"serif", letterSpacing:-0.3 }}>{item.value}</div>
              <div style={{ fontSize:9, color:"#999", fontWeight:600, textTransform:"uppercase", letterSpacing:0.4, marginTop:1 }}>{item.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <ScoreBar label="Rotation" value={(option.scores||{}).rotation||0} colour={colour} />
          <ScoreBar label="Yield"    value={(option.scores||{}).yield||0}    colour={colour} />
          <ScoreBar label="Ease"     value={(option.scores||{}).ease||0}     colour={colour} />
        </>
      )}

      <div style={{ marginTop:10, borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
        {option.assignments.map(a => (
          <div key={a.area_id} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
            <span style={{ fontSize:14 }}>{a.crop_emoji || "🌱"}</span>
            <span style={{ fontSize:12, color:C.stone }}>{a.area_name}</span>
            <span style={{ fontSize:12, fontWeight:600, color:"#1a1a1a" }}>→ {a.crop_name}</span>
          </div>
        ))}
        {option.fixed_areas && option.fixed_areas.length > 0 && (
          <div style={{ fontSize:11, color:C.stone, marginTop:4, fontStyle:"italic" }}>
            {option.fixed_areas.map(a => a.area_name).join(", ")} — kept as-is
          </div>
        )}
      </div>
    </div>
  );
}

// ── Plan Performance Strip ────────────────────────────────────────────────────
function PlanPerformanceStrip({ plan }) {
  if (!plan) return null;
  const m = plan.metrics || {};
  const items = [
    { label:"Harvest",    value: m.harvest_kg     != null ? `${m.harvest_kg}kg`                                               : "—" },
    { label:"Shop Value", value: m.shop_value_gbp  != null ? `£${Math.round(m.shop_value_gbp)}`                               : "—" },
    { label:"Space Use",  value: m.space_use_delta_pct != null ? `${m.space_use_delta_pct>0?"+":""}${m.space_use_delta_pct}%` : "—" },
    { label:"Effort",     value: m.effort_level   || "—",
      color: m.effort_level==="Easy"?"#2a7a40":m.effort_level==="High"?"#b84c00":"#2f5d50" },
  ];
  return (
    <div style={{ display:"flex", borderTop:"1px solid rgba(0,0,0,0.08)", background:"#f8faf8", borderRadius:"0 0 14px 14px" }}>
      {items.map((item, i) => (
        <div key={i} style={{ flex:1, padding:"10px 8px", textAlign:"center",
          borderRight: i<items.length-1 ? "1px solid rgba(0,0,0,0.07)" : "none" }}>
          <div style={{ fontSize:17, fontWeight:700, color:item.color||"#2f5d50", fontFamily:"serif", letterSpacing:-0.3 }}>
            {item.value}
          </div>
          <div style={{ fontSize:10, color:"#888", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5, marginTop:2 }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Compare Plans Sheet ───────────────────────────────────────────────────────
function ComparePlansSheet({ options, selectedIdx, onSelect, onClose, recommendedId }) {
  if (!options?.length) return null;

  const EFFORT_RANK_UI   = { "Easy":0, "Moderate":1, "High":2 };
  const ROTATION_RANK_UI = { "Excellent":3, "Good":2, "Fair":1, "Weak":0 };
  const SPREAD_RANK_UI   = { "Excellent":3, "Good":2, "Short Peak":1, "Heavy Mid-Season":0 };

  const rows = [
    { key:"harvest_kg",            label:"Harvest",        fmt:v=>v!=null?`${v}kg`:"—",                              bestFn: vals => Math.max(...vals.filter(v=>v!=null)) },
    { key:"shop_value_gbp",        label:"Shop Value",     fmt:v=>v!=null?`£${Math.round(v)}`:"—",                   bestFn: vals => Math.max(...vals.filter(v=>v!=null)) },
    { key:"space_use_delta_pct",   label:"Space Use",      fmt:v=>v!=null?`${v>0?"+":""}${v}%`:"—",                  bestFn: vals => Math.max(...vals.filter(v=>v!=null)) },
    { key:"effort_level",          label:"Effort",         fmt:v=>v||"—",   isStr:true,
      bestFn: vals => { const r=vals.map(v=>EFFORT_RANK_UI[v]??99); const min=Math.min(...r); return vals[r.indexOf(min)]; } },
    { key:"rotation_level",        label:"Rotation",       fmt:v=>v||"—",   isStr:true,
      bestFn: vals => { const r=vals.map(v=>ROTATION_RANK_UI[v]??-1); const max=Math.max(...r); return vals[r.indexOf(max)]; } },
    { key:"harvest_spread_level",  label:"Harvest Spread", fmt:v=>v||"—",   isStr:true,
      bestFn: vals => { const r=vals.map(v=>SPREAD_RANK_UI[v]??-1); const max=Math.max(...r); return vals[r.indexOf(max)]; } },
  ];

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9100, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-end" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:"20px 16px 36px", boxSizing:"border-box", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ width:36, height:4, background:"#ddd", borderRadius:99, margin:"0 auto 16px" }} />
        <div style={{ fontFamily:"serif", fontSize:17, fontWeight:700, marginBottom:16 }}>Compare plans</div>

        {/* Plan selector buttons */}
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {options.map((opt, i) => (
            <button key={i} onClick={() => { onSelect(i); onClose(); }}
              style={{ flex:1, padding:"10px 4px", borderRadius:10, border:"none", cursor:"pointer",
                background: i===selectedIdx ? "#2f5d50" : "#f0f4f0",
                color: i===selectedIdx ? "#fff" : "#1a1a1a",
                fontSize:12, fontWeight:700 }}>
              {opt.name}
              {opt.id===recommendedId && (
                <div style={{ fontSize:9, opacity:0.85, marginTop:2 }}>★ Recommended</div>
              )}
            </button>
          ))}
        </div>

        {/* Comparison table */}
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <tbody>
            {rows.map(({ key, label, fmt, bestFn, isStr }) => {
              const vals    = options.map(o => o.metrics?.[key]);
              const bestVal = bestFn(vals);
              return (
                <tr key={key} style={{ borderBottom:"1px solid rgba(0,0,0,0.06)" }}>
                  <td style={{ padding:"9px 0", color:"#888", fontWeight:600, width:"32%", fontSize:12 }}>{label}</td>
                  {options.map((opt, i) => {
                    const val    = opt.metrics?.[key];
                    const isBest = isStr ? val===bestVal : val!=null && val===bestVal;
                    return (
                      <td key={i} style={{ padding:"9px 4px", textAlign:"center",
                        fontWeight: isBest?700:400,
                        color: isBest?"#2f5d50":"#1a1a1a" }}>
                        {fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop:14, fontSize:11, color:"#aaa", textAlign:"center" }}>
          Based on typical UK shop prices for when your crops are likely to be ready.
        </div>
      </div>
    </div>
  );
}

function CreatePlanSheet({ locationId, locationName, onSave, onClose }) {
  const [step,          setStep]         = useState("goal");
  const [goal,          setGoal]         = useState(null);
  const [options,       setOptions]      = useState([]);
  const [selected,      setSelected]     = useState(0);
  const [recommendedId, setRecommendedId]= useState(null);
  const [saving,        setSaving]       = useState(false);
  const [err,           setErr]          = useState(null);
  const [genErr,        setGenErr]       = useState(null);
  const [showCompare,   setShowCompare]  = useState(false);

  const handleGoalSelect = async (goalId) => {
    setGoal(goalId);
    setStep("generating");
    setGenErr(null);
    try {
      const result = await apiFetch("/plans/generate", {
        method: "POST",
        body: JSON.stringify({ location_id: locationId, goal: goalId }),
      });
      const opts = result.options || [];
      setOptions(opts);
      setRecommendedId(result.recommended_plan_id || null);
      // Pre-select recommended plan if present
      const recIdx = opts.findIndex(o => o.id === result.recommended_plan_id);
      setSelected(recIdx >= 0 ? recIdx : 0);
      setStep("compare");
    } catch(e) {
      setGenErr(e.message);
      setStep("goal");
    }
  };

  const handleChoose = async () => {
    const chosen = options[selected];
    if (!chosen) return;
    setSaving(true); setErr(null);
    try {
      const plan = await apiFetch("/plans", {
        method: "POST",
        body: JSON.stringify({ location_id: locationId, name: chosen.name }),
      });
      // Sequential saves to avoid race condition with useEffect assignment fetch
      const savedAssignments = [];
      for (const a of chosen.assignments) {
        const saved = await apiFetch(`/plans/${plan.id}/assignments`, {
          method: "POST",
          body: JSON.stringify({
            area_id:            a.area_id,
            crop_definition_id: a.crop_definition_id || null,
            crop_name:          a.crop_name,
          }),
        });
        savedAssignments.push(saved);
      }
      onSave(plan);
    } catch(e) { setErr(e.message); setSaving(false); }
  };

  // ── Goal picker ──
  if (step === "goal") return (
    <div style={{ position:"fixed", inset:0, zIndex:9000, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-end" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", boxSizing:"border-box", maxHeight:"85vh", overflowY:"auto" }}>
        <div style={{ width:36, height:4, background:"#ddd", borderRadius:99, margin:"0 auto 20px" }} />
        <div style={{ fontFamily:"serif", fontSize:18, fontWeight:700, marginBottom:4 }}>New plan</div>
        <div style={{ fontSize:12, color:C.stone, marginBottom:20 }}>For {locationName} — what's your goal this season?</div>
        {genErr && <div style={{ fontSize:12, color:C.red, marginBottom:12, padding:"10px 14px", background:"#FFF0F0", borderRadius:10 }}>Couldn't generate plans: {genErr}</div>}
        {PLAN_GOALS.map(g => (
          <button key={g.id} onClick={() => handleGoalSelect(g.id)}
            style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:14, border:`1.5px solid ${C.border}`, background:"#fff", marginBottom:8, cursor:"pointer", textAlign:"left" }}>
            <span style={{ fontSize:24, flexShrink:0 }}>{g.emoji}</span>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1a1a1a", marginBottom:2 }}>{g.label}</div>
              <div style={{ fontSize:12, color:C.stone }}>{g.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Generating ──
  if (step === "generating") return (
    <div style={{ position:"fixed", inset:0, zIndex:9000, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:20, padding:"36px 28px", textAlign:"center", maxWidth:280 }}>
        <div style={{ fontSize:36, marginBottom:12 }}>🌱</div>
        <div style={{ fontFamily:"serif", fontSize:17, fontWeight:700, marginBottom:8 }}>Planning your garden…</div>
        <div style={{ fontSize:13, color:C.stone, lineHeight:1.5 }}>Analysing your current crops and working out the best rotation options</div>
      </div>
    </div>
  );

  // ── Compare ──
  const chosenGoal = PLAN_GOALS.find(g => g.id === goal);
  return (
    <>
      <div style={{ position:"fixed", inset:0, zIndex:9000, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-end" }}
        onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
        <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:"20px 16px 36px", boxSizing:"border-box", maxHeight:"90vh", overflowY:"auto" }}>
          <div style={{ width:36, height:4, background:"#ddd", borderRadius:99, margin:"0 auto 16px" }} />
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
            <button onClick={() => setStep("goal")} style={{ background:"none", border:"none", color:C.stone, fontSize:20, cursor:"pointer", padding:0 }}>←</button>
            <div style={{ fontFamily:"serif", fontSize:17, fontWeight:700 }}>Choose a plan</div>
          </div>
          <div style={{ fontSize:12, color:C.stone, marginBottom:16, paddingLeft:30 }}>
            {chosenGoal?.emoji} {chosenGoal?.label} · {locationName}
          </div>

          {options.map((opt, i) => (
            <PlanOptionCard key={i} option={opt} index={i} selected={selected} onSelect={setSelected}
              recommended={opt.id === recommendedId} />
          ))}

          {err && <div style={{ fontSize:12, color:C.red, marginBottom:10 }}>{err}</div>}

          <button onClick={() => setShowCompare(true)}
            style={{ width:"100%", padding:"12px", borderRadius:14, border:`1.5px solid ${C.border}`, background:"#fff", color:"#1a1a1a", fontSize:14, fontWeight:600, cursor:"pointer", marginBottom:10 }}>
            Compare plans →
          </button>

          <button onClick={handleChoose} disabled={saving}
            style={{ width:"100%", padding:"15px", borderRadius:14, border:"none", background:C.forest, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
            {saving ? "Setting up plan…" : "Use this plan →"}
          </button>
        </div>
      </div>

      {showCompare && (
        <ComparePlansSheet
          options={options}
          selectedIdx={selected}
          onSelect={setSelected}
          onClose={() => setShowCompare(false)}
          recommendedId={recommendedId}
        />
      )}
    </>
  );
}

// Sheet to assign a crop to an area within a plan
function AssignCropSheet({ area, plan, currentAssignment, onSave, onClose }) {
  const [cropDefs,  setCropDefs]  = useState([]);
  const [query,     setQuery]     = useState(currentAssignment?.crop_name || "");
  const [selected,  setSelected]  = useState(currentAssignment?.crop_definition_id || null);
  const [saving,    setSaving]    = useState(false);
  const [removing,  setRemoving]  = useState(false);

  useEffect(() => {
    apiFetch("/crop-definitions").then(d => setCropDefs(d||[])).catch(()=>{});
  }, []);

  const filtered = query.trim().length > 1
    ? cropDefs.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : [];

  const selectedDef = cropDefs.find(c => c.id === selected);

  const handleSave = async () => {
    if (!selected && !query.trim()) { onClose(); return; }
    setSaving(true);
    try {
      const body = { area_id: area.id };
      if (selected) { body.crop_definition_id = selected; body.crop_name = selectedDef?.name || query.trim(); }
      else { body.crop_name = query.trim(); }
      const result = await apiFetch(`/plans/${plan.id}/assignments`, { method:"POST", body:JSON.stringify(body) });
      onSave(result);
    } catch(e) { setSaving(false); }
  };

  const handleRemove = async () => {
    if (!currentAssignment?.id) { onClose(); return; }
    setRemoving(true);
    try {
      await apiFetch(`/plans/${plan.id}/assignments/${currentAssignment.id}`, { method:"DELETE" });
      onSave(null);
    } catch(e) { setRemoving(false); }
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9100, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-end" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", background:"#fff", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", boxSizing:"border-box", maxHeight:"80vh", overflowY:"auto" }}>
        <div style={{ width:36, height:4, background:"#ddd", borderRadius:99, margin:"0 auto 20px" }} />
        <div style={{ fontFamily:"serif", fontSize:17, fontWeight:700, marginBottom:2 }}>Plan crop for {area.name}</div>
        <div style={{ fontSize:12, color:C.stone, marginBottom:20 }}>In: {plan.name}</div>

        {selectedDef && (
          <div style={{ display:"flex", alignItems:"center", gap:10, background:"#F0F5F3", borderRadius:12, padding:"10px 14px", marginBottom:14 }}>
            <div style={{ fontSize:22 }}>{selectedDef.emoji || "🌱"}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{selectedDef.name}</div>
              <div style={{ fontSize:11, color:C.stone }}>Selected</div>
            </div>
            <button onClick={()=>{ setSelected(null); setQuery(""); }} style={{ background:"none", border:"none", color:C.stone, fontSize:18, cursor:"pointer" }}>✕</button>
          </div>
        )}

        {!selectedDef && (
          <>
            <input
              value={query} onChange={e=>{ setQuery(e.target.value); setSelected(null); }}
              placeholder="Search crops…"
              autoFocus
              style={{ width:"100%", boxSizing:"border-box", padding:"12px 14px", borderRadius:12, border:`1.5px solid ${C.border}`, fontSize:14, outline:"none", marginBottom:8 }}
            />
            {filtered.length > 0 && (
              <div style={{ borderRadius:12, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:12 }}>
                {filtered.map((c,i) => (
                  <button key={c.id} onClick={()=>{ setSelected(c.id); setQuery(c.name); }}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", border:"none", borderTop:i>0?`1px solid ${C.border}`:"none", background:"#fff", cursor:"pointer", textAlign:"left" }}>
                    <span style={{ fontSize:18 }}>{c.emoji||"🌱"}</span>
                    <span style={{ fontSize:14, fontWeight:600 }}>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display:"flex", gap:8 }}>
          {currentAssignment?.id && (
            <button onClick={handleRemove} disabled={removing}
              style={{ flex:1, padding:"13px", borderRadius:14, border:`1.5px solid ${C.red}`, background:"#fff", color:C.red, fontSize:14, fontWeight:700, cursor:"pointer" }}>
              {removing ? "Removing…" : "Remove"}
            </button>
          )}
          <button onClick={handleSave} disabled={saving || (!selected && !query.trim())}
            style={{ flex:2, padding:"13px", borderRadius:14, border:"none", background:(selected||query.trim())?C.forest:"#ccc", color:"#fff", fontSize:14, fontWeight:700, cursor:(selected||query.trim())?"pointer":"default" }}>
            {saving ? "Saving…" : currentAssignment?.id ? "Update" : "Assign crop"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Commit plan confirmation modal
function CommitPlanModal({ plan, onConfirm, onClose }) {
  const [committing, setCommitting] = useState(false);
  const handleCommit = async () => {
    setCommitting(true);
    try {
      const updated = await apiFetch(`/plans/${plan.id}/commit`, { method:"POST" });
      onConfirm(updated);
    } catch(e) { setCommitting(false); }
  };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:9200, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", padding:"0 20px" }}>
      <div style={{ width:"100%", maxWidth:380, background:"#fff", borderRadius:20, padding:"28px 22px 22px", boxSizing:"border-box" }}>
        <div style={{ fontSize:32, textAlign:"center", marginBottom:12 }}>🌱</div>
        <div style={{ fontFamily:"serif", fontSize:18, fontWeight:700, textAlign:"center", marginBottom:10 }}>Commit this plan?</div>
        <div style={{ fontSize:14, color:C.stone, textAlign:"center", lineHeight:1.6, marginBottom:24 }}>
          Your current garden stays unchanged. Vercro will use <strong>{plan.name}</strong> to guide prep, sowing and planting tasks as areas become available.
        </div>
        <button onClick={handleCommit} disabled={committing}
          style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background:C.forest, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", marginBottom:10 }}>
          {committing ? "Committing…" : "Commit plan"}
        </button>
        <button onClick={onClose}
          style={{ width:"100%", padding:"12px", borderRadius:14, border:`1px solid ${C.border}`, background:"#fff", color:C.stone, fontSize:14, cursor:"pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main PlanScreen ───────────────────────────────────────────────────────────
// ── GardenSketchCanvas — pencil sketch garden renderer ────────────────────────
function GardenSketchCanvas({ areas, crops, activeBlock, onTap, width, height }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = width, H = height;
    canvas.width = W; canvas.height = H;

    // ── Seeded random ──────────────────────────────────────────────────────────
    function seededRand(seed) {
      let s = seed;
      return function() { s=(s*16807+0)%2147483647; return (s-1)/2147483646; };
    }

    // ── Sketch edge ────────────────────────────────────────────────────────────
    function sketchEdge(x1,y1,x2,y2,rand,opts={}) {
      const {wobble=2.0,strokesPerUnit=0.09,lineWidth=1.6,alpha=0.82,color="#1a1a1a"}=opts;
      const len=Math.sqrt((x2-x1)**2+(y2-y1)**2);
      const strokes=Math.max(3,Math.floor(len*strokesPerUnit));
      const dx=(x2-x1)/strokes,dy=(y2-y1)/strokes;
      ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=lineWidth; ctx.lineCap="round"; ctx.globalAlpha=alpha;
      let px=x1+(rand()-0.5)*wobble*0.5,py=y1+(rand()-0.5)*wobble*0.5;
      for(let i=0;i<strokes;i++){
        const nx=x1+dx*(i+1)+(rand()-0.5)*wobble,ny=y1+dy*(i+1)+(rand()-0.5)*wobble;
        if(rand()>0.88){px=nx;py=ny;continue;}
        ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(nx,ny);ctx.stroke();px=nx;py=ny;
      }
      ctx.restore();
    }

    function sketchPoly(points,seed,opts={}) {
      const rand=seededRand(seed);
      for(let i=0;i<points.length-1;i++) sketchEdge(points[i][0],points[i][1],points[i+1][0],points[i+1][1],rand,opts);
    }

    function fillPoly(points,color) {
      ctx.save(); ctx.fillStyle=color; ctx.beginPath();
      points.forEach((p,i)=>i===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1]));
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    function scatterHachure(points,seed,opts={}) {
      const {alpha=0.12,density=0.018}=opts;
      const rand=seededRand(seed+777);
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      const count=Math.floor((maxX-minX)*(maxY-minY)*density);
      ctx.save(); ctx.beginPath();
      points.forEach((p,i)=>i===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1]));
      ctx.closePath(); ctx.clip(); ctx.lineCap="round";
      for(let i=0;i<count;i++){
        const lx=minX+rand()*(maxX-minX),ly=minY+rand()*(maxY-minY);
        const angle=-0.7+rand()*1.4,len=4+rand()*22;
        const dc=rand();
        ctx.strokeStyle="#1a1a1a";
        ctx.lineWidth=dc>0.88?1.2+rand()*0.8:0.4+rand()*0.7;
        ctx.globalAlpha=dc>0.88?alpha*(1.8+rand()*1.4):alpha*(0.25+rand()*1.1);
        ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(lx+Math.cos(angle)*len,ly+Math.sin(angle)*len);ctx.stroke();
        if(rand()>0.60){
          const ox=lx+(rand()-0.5)*5,oy=ly+(rand()-0.5)*5,a2=angle+(rand()-0.5)*0.5,l2=3+rand()*14,dc2=rand();
          ctx.globalAlpha=dc2>0.85?alpha*(1.5+rand()):alpha*(0.2+rand()*0.65);
          ctx.lineWidth=dc2>0.85?1.0+rand()*0.6:0.35+rand()*0.5;
          ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(ox+Math.cos(a2)*l2,oy+Math.sin(a2)*l2);ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ── Perspective constants ──────────────────────────────────────────────────
    const TILT=0.55,SHEAR=0.18,DEPTH=18;

    function bedFaces(x,y,w,h){
      const th=h*TILT,sT=y*SHEAR,sB=(y+th)*SHEAR;
      const tl=[x+sT,y],tr=[x+w+sT,y],br=[x+w+sB,y+th],bl=[x+sB,y+th];
      const DX=-DEPTH*0.55,DY=DEPTH*0.85;
      const tll=[tl[0]+DX,tl[1]+DY],bll=[bl[0]+DX,bl[1]+DY];
      return {
        top:[tl,tr,br,bl,tl],
        front:[bl,br,[br[0]+DX,br[1]+DY],[bl[0]+DX,bl[1]+DY],bl],
        left:[tl,tll,bll,bl,tl]
      };
    }

    function drawRaisedBed(x,y,w,h,label,seed,selected){
      const {top,front,left}=bedFaces(x,y,w,h);
      fillPoly(top,"#ffffff"); scatterHachure(top,seed,{alpha:0.10,density:0.016});
      fillPoly(front,"#d8d8d8"); fillPoly(left,"#b8b8b8");
      const eOpts={wobble:2.2,strokesPerUnit:0.10,lineWidth:2.0,alpha:0.88,color:"#1a1a1a"};
      sketchPoly(top,seed,eOpts);
      sketchPoly(front,seed+30,{...eOpts,lineWidth:1.7,alpha:0.78});
      sketchPoly(left,seed+40,{...eOpts,lineWidth:1.5,alpha:0.68});
      // corner posts
      const cs=6;
      [top[0],top[1],top[2],top[3]].forEach(([px,py])=>{
        ctx.save(); ctx.strokeStyle="#1a1a1a"; ctx.lineWidth=1.2; ctx.globalAlpha=0.55;
        ctx.beginPath();ctx.rect(px-cs/2,py-cs/2,cs,cs);ctx.stroke();
        ctx.globalAlpha=0.35;
        ctx.beginPath();ctx.moveTo(px-cs/2+1,py-cs/2+1);ctx.lineTo(px+cs/2-1,py+cs/2-1);ctx.stroke();
        ctx.beginPath();ctx.moveTo(px+cs/2-1,py-cs/2+1);ctx.lineTo(px-cs/2+1,py+cs/2-1);ctx.stroke();
        ctx.restore();
      });
      if(selected){
        ctx.save(); ctx.strokeStyle="#2f5d50"; ctx.lineWidth=2.5; ctx.setLineDash([6,4]);
        const tl=top[0],tr=top[1],br=top[2],bl=top[3];
        ctx.beginPath();ctx.moveTo(tl[0]-5,tl[1]-5);ctx.lineTo(tr[0]+5,tr[1]-5);
        ctx.lineTo(br[0]+5,br[1]+DEPTH+5);ctx.lineTo(tl[0]-DEPTH*0.55-5,bl[1]+DEPTH+5);
        ctx.closePath();ctx.stroke();ctx.restore();
      }
      const tcx=(top[0][0]+top[1][0]+top[2][0]+top[3][0])/4;
      const tcy=(top[0][1]+top[1][1]+top[2][1]+top[3][1])/4;
      ctx.save();
      ctx.font=`${Math.min(19,Math.max(12,w/7))}px 'Caveat',cursive`;
      ctx.fillStyle="#1a1a1a"; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText(label||"",tcx+tcy*SHEAR*0.3,tcy);
      ctx.restore();
    }

    function drawOpenGround(x,y,w,h,label,seed){
      const {top}=bedFaces(x,y,w,h);
      fillPoly(top,"#e4e4e4");
      scatterHachure(top,seed,{alpha:0.13,density:0.022});
      scatterHachure(top,seed+3,{alpha:0.07,density:0.010});
      sketchPoly(top,seed,{wobble:2.2,strokesPerUnit:0.07,lineWidth:1.6,alpha:0.68,color:"#333"});
      ctx.save(); ctx.strokeStyle="#aaa"; ctx.lineWidth=0.9; ctx.globalAlpha=0.45; ctx.setLineDash([5,5]);
      const pts=top.slice(0,4),ins=4;
      ctx.beginPath();ctx.moveTo(pts[0][0]+ins,pts[0][1]+ins);ctx.lineTo(pts[1][0]-ins,pts[1][1]+ins);
      ctx.lineTo(pts[2][0]-ins,pts[2][1]-ins);ctx.lineTo(pts[3][0]+ins,pts[3][1]-ins);ctx.closePath();ctx.stroke();
      ctx.restore();
      const tcx=(top[0][0]+top[1][0]+top[2][0]+top[3][0])/4;
      const tcy=(top[0][1]+top[1][1]+top[2][1]+top[3][1])/4;
      ctx.save(); ctx.font="12px 'Caveat',cursive"; ctx.fillStyle="#444";
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(label||"",tcx,tcy); ctx.restore();
    }

    function drawPot(cx,cy,rx,ry,label,seed){
      const rand=seededRand(seed);
      const scx=cx+cy*SHEAR,sry=ry*TILT,cylH=sry*2.2;
      const iRx=rx*0.72,iRy=sry*0.68;
      // shadow hatching
      const sh=seededRand(seed+888);
      ctx.save(); ctx.strokeStyle="#1a1a1a"; ctx.lineCap="round";
      for(let i=0;i<28;i++){
        const t=i/28;
        const sx=scx-rx*0.85+sh()*rx*0.5;
        const sy=cy+cylH*(0.42+t*0.52)+(sh()-0.5)*4;
        const outAngle=Math.PI*0.55+(sh()-0.5)*0.5,len=4+sh()*11;
        ctx.lineWidth=0.5+sh()*0.75; ctx.globalAlpha=0.16+sh()*0.22;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+Math.cos(outAngle)*len,sy+Math.sin(outAngle)*len);ctx.stroke();
        if(sh()>0.38){
          const ca=outAngle-0.9-sh()*0.5,cl=3+sh()*8;
          ctx.lineWidth=0.4+sh()*0.5; ctx.globalAlpha=0.10+sh()*0.13;
          ctx.beginPath();ctx.moveTo(sx+(sh()-0.5)*2,sy+(sh()-0.5)*2);ctx.lineTo(sx+Math.cos(ca)*cl,sy+Math.sin(ca)*cl);ctx.stroke();
        }
      }
      for(let i=0;i<20;i++){
        const t=i/20,a=Math.PI+t*(Math.PI*0.5);
        const sx=scx+Math.cos(a)*rx+(sh()-0.5)*3,sy=cy+cylH+Math.sin(a)*sry*0.4+1+sh()*3;
        const outAngle=a+Math.PI*0.4+(sh()-0.5)*0.4,len=3+sh()*9;
        ctx.lineWidth=0.45+sh()*0.65; ctx.globalAlpha=0.14+sh()*0.19;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+Math.cos(outAngle)*len,sy+Math.sin(outAngle)*len);ctx.stroke();
        if(sh()>0.42){
          const ca=outAngle-0.8-sh()*0.5,cl=2+sh()*7;
          ctx.lineWidth=0.35+sh()*0.4; ctx.globalAlpha=0.08+sh()*0.12;
          ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+Math.cos(ca)*cl,sy+Math.sin(ca)*cl);ctx.stroke();
        }
      }
      ctx.restore();
      // fills
      ctx.save(); ctx.beginPath(); ctx.rect(scx-rx,cy,rx*2,cylH); ctx.fillStyle="#f0f0f0"; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.ellipse(scx,cy,rx,sry,0,0,Math.PI*2); ctx.fillStyle="#f0f0f0"; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.ellipse(scx,cy,iRx,iRy,0,0,Math.PI*2); ctx.fillStyle="#e0e0e0"; ctx.fill(); ctx.restore();
      const soilPts=Array.from({length:32},(_,i)=>{const a=i/32*Math.PI*2;return[scx+Math.cos(a)*iRx,cy+Math.sin(a)*iRy];});
      scatterHachure(soilPts,seed+5,{alpha:0.10,density:0.013});
      // outlines
      const N=44;
      function sketchEll(ex,ey,erx,ery,sOff,lw,al){
        const r=seededRand(seed+sOff);
        for(let i=0;i<N;i++){
          const a1=(i/N)*Math.PI*2,a2=((i+1)/N)*Math.PI*2;
          const rw1=1+(r()-0.5)*0.12,rw2=1+(r()-0.5)*0.12;
          if(r()>0.94) continue;
          ctx.save(); ctx.strokeStyle="#1a1a1a"; ctx.lineCap="round";
          ctx.lineWidth=lw+(r()-0.5)*0.4; ctx.globalAlpha=al+(r()-0.5)*0.15;
          ctx.beginPath();ctx.moveTo(ex+Math.cos(a1)*erx*rw1,ey+Math.sin(a1)*ery*rw1);
          ctx.lineTo(ex+Math.cos(a2)*erx*rw2,ey+Math.sin(a2)*ery*rw2);ctx.stroke();ctx.restore();
        }
      }
      sketchEll(scx,cy,rx,sry,10,1.8,0.82);
      sketchEll(scx,cy,iRx,iRy,20,1.1,0.55);
      const rb=seededRand(seed+30);
      for(let i=0;i<N/2;i++){
        const a1=(i/(N/2))*Math.PI,a2=((i+1)/(N/2))*Math.PI;
        const rw1=1+(rb()-0.5)*0.09,rw2=1+(rb()-0.5)*0.09;
        if(rb()>0.95) continue;
        ctx.save(); ctx.strokeStyle="#1a1a1a"; ctx.lineCap="round";
        ctx.lineWidth=1.4+(rb()-0.5)*0.3; ctx.globalAlpha=0.72+(rb()-0.5)*0.15;
        ctx.beginPath();ctx.moveTo(scx+Math.cos(a1)*rx*rw1,cy+cylH+Math.sin(a1)*sry*0.4*rw1);
        ctx.lineTo(scx+Math.cos(a2)*rx*rw2,cy+cylH+Math.sin(a2)*sry*0.4*rw2);ctx.stroke();ctx.restore();
      }
      const rv=seededRand(seed+40);
      sketchEdge(scx-rx+(rv()-0.5)*1.5,cy,scx-rx+(rv()-0.5)*2,cy+cylH,rv,{wobble:1.8,strokesPerUnit:0.08,lineWidth:1.6,alpha:0.80,color:"#1a1a1a"});
      sketchEdge(scx+rx+(rv()-0.5)*1.5,cy,scx+rx+(rv()-0.5)*2,cy+cylH,rv,{wobble:1.8,strokesPerUnit:0.08,lineWidth:1.2,alpha:0.60,color:"#1a1a1a"});
      if(label){
        ctx.save(); ctx.font="13px 'Caveat',cursive"; ctx.fillStyle="#333";
        ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(label,scx,cy+iRy*0.2); ctx.restore();
      }
    }

    // ── Background ─────────────────────────────────────────────────────────────
    ctx.fillStyle="#faf8f4"; ctx.fillRect(0,0,W,H);
    const gr=seededRand(42);
    for(let i=0;i<220;i++){ctx.fillStyle="rgba(0,0,0,0.022)";ctx.beginPath();ctx.arc(gr()*W,gr()*H,gr()*1.8,0,Math.PI*2);ctx.fill();}
    const gr2=seededRand(99); ctx.save(); ctx.lineCap="round"; ctx.lineJoin="round";
    for(let i=0;i<280;i++){
      const gx=gr2()*W,gy=gr2()*H;
      ctx.strokeStyle="#1a1a1a"; ctx.lineWidth=0.5+gr2()*0.6; ctx.globalAlpha=0.055+gr2()*0.065;
      const segs=2+Math.floor(gr2()*3); ctx.beginPath(); ctx.moveTo(gx,gy);
      let cx2=gx,cy2=gy;
      for(let s=0;s<segs;s++){const a=gr2()*Math.PI*2,l=3+gr2()*8;cx2+=Math.cos(a)*l;cy2+=Math.sin(a)*l*0.55;ctx.lineTo(cx2,cy2);}
      ctx.stroke();
    }
    ctx.restore();

    // ── Layout areas ───────────────────────────────────────────────────────────
    if(!areas.length){
      ctx.save(); ctx.font="16px 'Caveat',cursive"; ctx.fillStyle="#999";
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("No areas yet",W/2,H/2); ctx.restore();
      return;
    }

    // Figure out bounding box of all areas to auto-fit
    const PAD=40;
    const rawW=areas.reduce((m,a)=>Math.max(m,(a.width_m||2)+(a.layout_x||0)),0)||6;
    const rawH=areas.reduce((m,a)=>Math.max(m,(a.length_m||2)+(a.layout_y||0)),0)||6;
    // Scale x and y independently to fill canvas, preserving real-world proportions
    const scaleX=(W-PAD*2)/rawW;
    const scaleY=(H-PAD*2)/(rawH*TILT+rawH*0.3); // account for TILT compression + depth
    const scale=Math.min(scaleX,scaleY,60);

    // Group container areas to draw as pot clusters
    const containerAreas=areas.filter(a=>a.area_type==="container"||a.area_type==="pot");
    const otherAreas=areas.filter(a=>a.area_type!=="container"&&a.area_type!=="pot");

    // Draw non-container areas
    otherAreas.forEach((area,idx)=>{
      const x=PAD+(area.layout_x||0)*scale;
      const y=PAD+(area.layout_y||0)*scale;
      const w=(area.width_m||2)*scale;   // width in x
      const h=(area.length_m||2)*scale;  // length in y — keeps rectangle proportions
      const areaCrops=crops.filter(c=>c.area_id===area.id);
      const label=areaCrops.length===1?areaCrops[0].name:(areaCrops.length>1?`${areaCrops.length} crops`:area.name||"");
      const seed=1000+idx*7;
      const selected=activeBlock===area.id;
      if(area.area_type==="open_ground"||area.area_type==="in_ground") drawOpenGround(x,y,w,h,label,seed);
      else drawRaisedBed(x,y,w,h,label,seed,selected);
    });

    // Draw container areas as pot clusters
    if(containerAreas.length>0){
      const potCrops=containerAreas.flatMap(a=>crops.filter(c=>c.area_id===a.id));
      const uniqueLabels=[...new Set(potCrops.map(c=>c.name))];
      const isSingle=uniqueLabels.length<=1;
      const label=uniqueLabels[0]||containerAreas[0]?.name||"";
      const potCX=W*0.45,potCY=H*0.72;
      // Position pots - give them proportional rx/ry for oval look
      const potScale=scale*0.8;
      drawPot(potCX-70,potCY+8,potScale*1.5,potScale*0.9,isSingle?null:uniqueLabels[1]||null,3002);
      drawPot(potCX,potCY,potScale*2.0,potScale*1.2,label,3001);
      drawPot(potCX+75,potCY+28,potScale*1.1,potScale*0.7,isSingle?null:uniqueLabels[2]||null,3003);
    }

  }, [areas, crops, activeBlock, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={Math.max(300, height)}
      style={{display:"block",width:"100%",height:"auto",fontFamily:"'Caveat',cursive",cursor:"pointer"}}
      onClick={e=>{
        if(!onTap||!areas.length) return;
        const rect=e.currentTarget.getBoundingClientRect();
        const scaleRatio=width/rect.width;
        const mx=(e.clientX-rect.left)*scaleRatio;
        const my=(e.clientY-rect.top)*scaleRatio;
        const PAD=40;
        const rawW=areas.reduce((m,a)=>Math.max(m,(a.width_m||2)+(a.layout_x||0)),0)||6;
        const rawH=areas.reduce((m,a)=>Math.max(m,(a.length_m||2)+(a.layout_y||0)),0)||6;
        const scale=Math.min((width-PAD*2)/rawW,(height-PAD*2)/rawH,60);
        const TILT=0.55,DEPTH=18;
        let hit=null;
        areas.filter(a=>a.area_type!=="container"&&a.area_type!=="pot").forEach(area=>{
          const x=PAD+(area.layout_x||0)*scale;
          const y=PAD+(area.layout_y||0)*scale;
          const w=(area.width_m||2)*scale;
          const th=(area.length_m||2)*scale*TILT;
          if(mx>=x&&mx<=x+w&&my>=y&&my<=y+th+DEPTH) hit=area.id;
        });
        onTap(hit);
      }}
    />
  );
}

function PlanScreen() {
  const PLAN_VIEW_CACHE = "vercro_plan_view_v1";
  const _savedView = (() => { try { const v = localStorage.getItem(PLAN_VIEW_CACHE); return v ? JSON.parse(v) : null; } catch(e) { return null; } })();

  const [locations,    setLocations]    = useState([]);
  const [crops,        setCrops]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [selectedLoc,  setSelectedLoc]  = useState(_savedView?.selectedLoc || null);
  const [areas,        setAreas]        = useState([]);
  const [activeBlock,  setActiveBlock]  = useState(null);
  const [detailArea,   setDetailArea]   = useState(null);
  const [savedToast,   setSavedToast]   = useState(false);
  const [zoom,         setZoom]         = useState(_savedView?.zoom || 0.82);

  // Plan state
  const [plans,             setPlans]             = useState([]);
  const [selectedPlanId,    setSelectedPlanId]    = useState("live");
  const [assignments,       setAssignments]       = useState([]);
  const [showCreatePlan,    setShowCreatePlan]    = useState(false);
  const [assignArea,        setAssignArea]        = useState(null);
  const [showCommit,        setShowCommit]        = useState(false);
  const [planToast,         setPlanToast]         = useState(null);
  const [deletingPlanId,    setDeletingPlanId]    = useState(null); // plan being deleted
  const [confirmDeleteId,   setConfirmDeleteId]   = useState(null); // plan awaiting confirm

  const containerRef    = useRef(null);
  const autoLayoutDone  = useRef(false);
  const initialAreasRef = useRef(null);
  const [containerW,    setContainerW] = useState(360);
  const konvaReady      = useKonva();

  const { isPro, isMark } = useProStatus();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerW(el.clientWidth||360);
    const ro = new ResizeObserver(e=>setContainerW(e[0].contentRect.width));
    ro.observe(el);
    return ()=>ro.disconnect();
  }, []);

  useEffect(() => {
    Promise.all([apiFetch("/locations"), apiFetch("/areas"), apiFetch("/crops"), apiFetch("/plans")])
      .then(([locs, areasData, cropsData, plansData]) => {
        setCrops(cropsData||[]);
        setPlans(plansData||[]);
        const locsWithAreas = (locs||[]).map(loc => ({
          ...loc,
          growing_areas: (areasData||[]).filter(a => a.location_id === loc.id),
        }));
        setLocations(locsWithAreas);
        if (locsWithAreas.length) {
          const savedLocId = _savedView?.selectedLoc;
          const restoredLoc = savedLocId ? locsWithAreas.find(l => l.id === savedLocId) : null;
          const activeLoc = restoredLoc || locsWithAreas[0];
          setSelectedLoc(activeLoc.id);
          const firstAreas = activeLoc.growing_areas||[];
          setAreas(firstAreas);
          initialAreasRef.current = firstAreas;
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loc = locations.find(l => l.id === selectedLoc);

  // Plans filtered to current location
  const locPlans = plans.filter(p => p.location_id === selectedLoc && p.status !== "archived");
  const selectedPlan = locPlans.find(p => p.id === selectedPlanId) || null;

  // Ref to skip useEffect fetch when assignments were just loaded manually (avoids race)
  const skipAssignmentFetch = useRef(false);

  // Load assignments when plan changes
  useEffect(() => {
    if (!selectedPlanId || selectedPlanId === "live") { setAssignments([]); return; }
    if (skipAssignmentFetch.current) { skipAssignmentFetch.current = false; return; }
    apiFetch(`/plans/${selectedPlanId}/assignments`)
      .then(d => setAssignments(d||[]))
      .catch(() => setAssignments([]));
  }, [selectedPlanId]);

  // Reset plan selection when location changes
  useEffect(() => {
    setSelectedPlanId("live");
    setAssignments([]);
    setActiveBlock(null);
  }, [selectedLoc]);

  useEffect(() => {
    if (!loc) return;
    autoLayoutDone.current = false;
    setActiveBlock(null);
    setAreas(loc.growing_areas||[]);
  }, [selectedLoc]);

  useEffect(()=>{
    if(!areas.length||autoLayoutDone.current) return;
    const maxSane=Math.max(50,(loc?.width_m||20)*5);
    const hasStale=areas.some(a=>a.layout_x!=null&&Math.abs(a.layout_x)>maxSane);
    const needLayout=areas.filter(a=>a.layout_x==null||hasStale);
    if(!needLayout.length) return;
    autoLayoutDone.current=true;
    let x=0.4,y=0.4,rowH=0;
    const GAP=0.5;
    const maxRow=(loc?.width_m||12)-0.5;
    const updated=areas.map(area=>{
      if(area.layout_x!=null&&!hasStale) return area;
      const w=area.width_m||1.5,h=area.length_m||1.5;
      const placed={...area,layout_x:x,layout_y:y};
      x+=w+GAP; rowH=Math.max(rowH,h);
      if(x>maxRow){x=0.4;y+=rowH+GAP;rowH=0;}
      return placed;
    });
    setAreas(updated);
    if(hasStale) areas.forEach(a=>apiFetch(`/areas/${a.id}`,{method:"PUT",body:JSON.stringify({layout_x:null,layout_y:null})}).catch(()=>{}));
  },[areas.length,selectedLoc]);


  // Canvas geometry
  const _staticAreas = initialAreasRef.current || areas;
  const gardenW = loc?.width_m  || (areas.length ? Math.max(..._staticAreas.map(a=>(a.layout_x||0)+(a.width_m||2)))+1  : 6);
  const gardenH = loc?.length_m || (areas.length ? Math.max(..._staticAreas.map(a=>(a.layout_y||0)+(a.length_m||2)))+1 : 6);
  const CANVAS_PAD = 24;
  const pxPerM  = Math.max(20,(containerW-CANVAS_PAD*2)/gardenW);
  const canvasW = gardenW*pxPerM+CANVAS_PAD*2;
  const canvasH = gardenH*pxPerM+CANVAS_PAD*2;
  // Cap stageW to content width — no dead white space when garden is narrow
  const stageW  = Math.min(containerW, Math.ceil(canvasW*zoom));
  const stageH  = Math.max(300, canvasH*zoom);

  // Derived display values
  const totalCrops        = crops.filter(c => areas.some(a => a.id === c.area_id)).length;
  const activeAreaName    = activeBlock ? areas.find(a => a.id === activeBlock)?.name?.replace(/^"|"$/g,"") : null;
  const selectedAreaObj   = detailArea ? areas.find(a => a.id === detailArea) : null;
  const selectedAreaCrops = detailArea ? crops.filter(c => c.area_id === detailArea) : [];

  // Plan mode
  const isPlanMode    = selectedPlanId !== "live";
  const assignmentMap = Object.fromEntries(assignments.map(a => [a.area_id, a]));

  const planCrops = isPlanMode
    ? areas.flatMap(area => {
        const a = assignmentMap[area.id];
        if (!a) return [];
        return [{ id:`plan-${area.id}`, area_id:area.id, name:a.crop_name||a.crop_definition?.name||"?", emoji:a.crop_definition?.emoji||"🌱", _isPlanCrop:true }];
      })
    : crops;

  const handleDragEnd = async (areaId, x, y) => {
    if (isPlanMode) return;
    setAreas(prev => prev.map(a => a.id===areaId ? {...a,layout_x:x,layout_y:y} : a));
    try {
      await apiFetch(`/areas/${areaId}`, {method:"PUT", body:JSON.stringify({layout_x:x,layout_y:y})});
      setSavedToast(true); setTimeout(()=>setSavedToast(false),1500);
    } catch(e) { console.error("[Visualiser] save failed:", e.message); }
  };

  const handleRotate = async (areaId, angle, save) => {
    if (isPlanMode) return;
    const area = areas.find(a => a.id===areaId);
    if (!area) return;
    const newR = angle !== undefined ? angle : ((area.rotation||0)+90)%360;
    setAreas(prev => prev.map(a => a.id===areaId ? {...a,rotation:newR} : a));
    if (save !== false) {
      try { await apiFetch(`/areas/${areaId}`, {method:"PUT", body:JSON.stringify({rotation:newR})}); }
      catch(e) { console.error("[Visualiser] rotate failed:", e.message); }
    }
  };

  const handleZoomChange = (delta) => {
    setZoom(z => {
      const nz = Math.min(2.5, Math.max(0.4, +(z+delta*0.01).toFixed(2)));
      try { localStorage.setItem(PLAN_VIEW_CACHE, JSON.stringify({zoom:nz,selectedLoc})); } catch(e) {}
      return nz;
    });
  };

  const handleAreaTapInPlanMode = (areaId) => {
    if (selectedPlan?.status !== "draft") return;
    const area = areas.find(a => a.id===areaId);
    if (area) setAssignArea(area);
  };

  if (loading) return (
    <div style={{textAlign:"center",padding:"60px 0"}}>
      <div style={{fontSize:40,marginBottom:12}}>🗺️</div>
      <div style={{fontFamily:"serif",fontSize:16,fontWeight:700,color:C.forest}}>Loading your garden…</div>
    </div>
  );
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div style={{paddingBottom:16}}>

      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.forest} 0%,#1e3d33 100%)`,borderRadius:16,padding:"16px 18px 14px",marginBottom:14,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-20,right:-20,width:90,height:90,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
        <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>
              {isPlanMode ? "Garden Plan" : "Garden Visualiser"}
            </div>
            <div style={{fontFamily:"serif",fontSize:19,fontWeight:700,color:"#fff"}}>
              {isPlanMode ? selectedPlan?.name : (loc?.name||"My garden")}{!isPlanMode&&loc?.width_m&&loc?.length_m?` · ${loc.width_m}×${loc.length_m}m`:""}
            </div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:2,display:"flex",alignItems:"center",gap:6}}>
              {isPlanMode
                ? <><PlanBadge status={selectedPlan?.status}/><span>{assignments.length} area{assignments.length!==1?"s":""} planned</span></>
                : <>{areas.length} area{areas.length!==1?"s":""} · {totalCrops} crop{totalCrops!==1?"s":""}</>
              }
            </div>
          </div>
          <div style={{display:"flex",gap:4,background:"rgba(255,255,255,0.1)",backdropFilter:"blur(8px)",borderRadius:12,padding:"4px 6px"}}>
            {[["+",z=>Math.min(2.5,+(z+0.25).toFixed(2))],["−",z=>Math.max(0.4,+(z-0.25).toFixed(2))],["Fit",()=>1]].map(([label,fn])=>(
              <button key={label} onClick={()=>setZoom(z=>{ const nz=fn(z); try{localStorage.setItem(PLAN_VIEW_CACHE,JSON.stringify({zoom:nz,selectedLoc}));}catch(e){} return nz; })}
                style={{minWidth:30,height:30,borderRadius:8,border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",fontSize:label==="Fit"?11:18,fontWeight:700,cursor:"pointer",padding:label==="Fit"?"0 10px":0}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Location tabs */}
      {locations.length > 1 && (
        <div style={{display:"flex",gap:8,marginBottom:12,overflowX:"auto",paddingBottom:2}}>
          {locations.map(l => (
            <button key={l.id} onClick={()=>{ setSelectedLoc(l.id); try{localStorage.setItem(PLAN_VIEW_CACHE,JSON.stringify({zoom,selectedLoc:l.id}));}catch(e){} }}
              style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1px solid ${selectedLoc===l.id?C.forest:C.border}`,background:selectedLoc===l.id?C.forest:"#fff",color:selectedLoc===l.id?"#fff":"#1a1a1a",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* Plan selector */}
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,position:"relative"}}>
            <select
              value={selectedPlanId}
              onChange={e => setSelectedPlanId(e.target.value)}
              style={{width:"100%",padding:"10px 36px 10px 14px",borderRadius:12,border:`1.5px solid ${isPlanMode?C.forest:C.border}`,background:"#fff",fontSize:13,fontWeight:600,color:"#1a1a1a",appearance:"none",cursor:"pointer",outline:"none"}}>
              <option value="live">📍 Current garden</option>
              {locPlans.length > 0 && <option disabled>──────────────────</option>}
              {locPlans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.status==="committed"?"✅":"📋"} {p.name}
                </option>
              ))}
            </select>
            <div style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:C.stone,fontSize:12}}>▾</div>
          </div>
          <button onClick={()=>setShowCreatePlan(true)}
            style={{flexShrink:0,padding:"10px 14px",borderRadius:12,border:`1.5px solid ${C.forest}`,background:"#fff",color:C.forest,fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            + New plan
          </button>
        </div>

        {isPlanMode && selectedPlan && (
          <div style={{marginTop:8,display:"flex",gap:8,alignItems:"center"}}>
            <div style={{fontSize:11,color:C.stone,flex:1,lineHeight:1.5}}>
              {selectedPlan.status==="committed"
                ? "✅ Committed — engine will guide tasks as areas become available"
                : "📋 Draft — tap areas on the canvas or list below to assign crops"}
            </div>
            {selectedPlan.status==="draft" && (
              <button onClick={()=>setShowCommit(true)}
                style={{flexShrink:0,padding:"7px 14px",borderRadius:10,border:"none",background:C.forest,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                Commit
              </button>
            )}
            {confirmDeleteId === selectedPlan.id ? (
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontSize:11,color:C.red}}>Delete?</span>
                <button onClick={async()=>{
                  setDeletingPlanId(selectedPlan.id);
                  try {
                    await apiFetch(`/plans/${selectedPlan.id}`,{method:"DELETE"});
                    setPlans(prev=>prev.filter(p=>p.id!==selectedPlan.id));
                    setSelectedPlanId("live");
                    setAssignments([]);
                    setPlanToast("Plan deleted");
                    setTimeout(()=>setPlanToast(null),1800);
                  } catch(e){} finally { setDeletingPlanId(null); setConfirmDeleteId(null); }
                }} disabled={!!deletingPlanId}
                  style={{padding:"5px 10px",borderRadius:8,border:"none",background:C.red,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  {deletingPlanId===selectedPlan.id?"…":"Yes, delete"}
                </button>
                <button onClick={()=>setConfirmDeleteId(null)}
                  style={{padding:"5px 8px",borderRadius:8,border:`1px solid ${C.border}`,background:"#fff",color:C.stone,fontSize:11,cursor:"pointer"}}>
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={()=>setConfirmDeleteId(selectedPlan.id)}
                style={{flexShrink:0,padding:"7px 10px",borderRadius:10,border:`1px solid ${C.border}`,background:"#fff",color:C.stone,fontSize:13,cursor:"pointer"}}>
                🗑
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live mode toolbar */}
      {!isPlanMode && (
        <div style={{minHeight:38,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
          {activeBlock ? (
            <>
              <div style={{fontSize:13,fontFamily:"serif",fontWeight:700,color:"#1a1a1a",flex:1}}>{activeAreaName}</div>
              <button onClick={()=>handleRotate(activeBlock)}
                style={{background:C.forest,color:"#fff",border:"none",borderRadius:10,padding:"8px 18px",fontSize:14,fontWeight:700,cursor:"pointer"}}>↻ Rotate</button>
              <button onClick={()=>setDetailArea(activeBlock)}
                style={{background:"#fff",color:C.forest,border:`1.5px solid ${C.forest}`,borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Detail</button>
              <button onClick={()=>setActiveBlock(null)}
                style={{background:"none",color:C.stone,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 10px",fontSize:13,cursor:"pointer"}}>✕</button>
            </>
          ) : (
            <>
              <div style={{fontSize:11,color:C.stone,flex:1}}>Tap an area to select · drag to reposition</div>
              <button onClick={()=>{ try{localStorage.setItem(PLAN_VIEW_CACHE,JSON.stringify({zoom,selectedLoc}));}catch(e){} setSavedToast(true); setTimeout(()=>setSavedToast(false),1500); }}
                style={{background:C.forest,color:"#fff",border:"none",borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                🔒 Save view
              </button>
            </>
          )}
        </div>
      )}

      {/* Plan mode hint */}
      {isPlanMode && (
        <div style={{minHeight:30,marginBottom:10,display:"flex",alignItems:"center"}}>
          <div style={{fontSize:11,color:C.stone}}>
            {selectedPlan?.status==="committed" ? "View only — plan is committed" : "Tap any area to assign a planned crop"}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} style={{width:"100%",display:"flex",justifyContent:"center"}}>
      <div style={{width:stageW,borderRadius:18,overflow:"hidden",border:`1px solid ${isPlanMode?"rgba(47,93,80,0.3)":"rgba(0,0,0,0.1)"}`,boxShadow:"0 4px 24px rgba(0,0,0,0.14)",position:"relative"}}>
        {(savedToast||planToast) && (
          <div style={{position:"absolute",top:12,left:"50%",transform:"translateX(-50%)",background:"rgba(47,93,80,0.92)",color:"#fff",borderRadius:20,padding:"5px 16px",fontSize:12,fontWeight:600,backdropFilter:"blur(8px)",whiteSpace:"nowrap",zIndex:100}}>
            {planToast||"✓ Layout saved"}
          </div>
        )}
        {konvaReady ? (
          <GardenKonvaCanvas
            areas={areas}
            crops={planCrops}
            pxPerM={pxPerM} canvasW={canvasW} canvasH={canvasH}
            stageW={stageW} stageH={stageH} stageScale={zoom}
            activeBlock={isPlanMode ? null : activeBlock}
            onTap={isPlanMode ? handleAreaTapInPlanMode : id=>setActiveBlock(id===activeBlock?null:id)}
            onDragEnd={handleDragEnd}
            onRotate={handleRotate}
            onZoomChange={handleZoomChange}
            zoom={zoom}
          />
        ) : (
          <div style={{height:300,display:"flex",alignItems:"center",justifyContent:"center",background:"#faf8f4",color:"#999",fontSize:14}}>
            Loading…
          </div>
        )}
      </div>
      </div>

      {/* Scale bar */}
      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:5,marginTop:5}}>
        <div style={{width:Math.min(pxPerM,50),height:2,background:"rgba(0,0,0,0.2)",borderRadius:1}}/>
        <div style={{fontSize:9,color:"rgba(0,0,0,0.35)",fontWeight:700}}>1m</div>
      </div>

      {/* Locked metrics */}
      <div style={{display:"flex",gap:8,marginTop:14}}>
        {[["📊","Yield estimate"],["🔄","Rotation score"],["📐","Space efficiency"]].map(([icon,label])=>(
          <div key={label} style={{flex:1,background:"#F7F8F5",border:"1px solid #E3E7E1",borderRadius:14,padding:"10px 8px",textAlign:"center"}}>
            <div style={{fontSize:15,marginBottom:3,opacity:0.5}}>{icon}</div>
            <div style={{fontSize:9,fontWeight:700,color:C.stone,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{label}</div>
            <div style={{fontSize:9,color:C.stone,opacity:0.7}}>🔒 Pro</div>
          </div>
        ))}
      </div>

      {/* Area assignment list — plan mode only */}
      {isPlanMode && areas.length > 0 && (
        <div style={{marginTop:16}}>
          <div style={{fontSize:11,fontWeight:700,color:C.stone,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Area assignments</div>
          {areas.map(area => {
            const assignment = assignmentMap[area.id];
            return (
              <div key={area.id}
                onClick={selectedPlan?.status==="draft" ? ()=>setAssignArea(area) : undefined}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:14,border:`1px solid ${assignment?C.forest+"44":C.border}`,background:assignment?"#F0F5F3":"#FAFAFA",marginBottom:8,cursor:selectedPlan?.status==="draft"?"pointer":"default"}}>
                <div style={{fontSize:20,minWidth:24,textAlign:"center"}}>{assignment?.crop_definition?.emoji||(assignment?"🌱":"⬜")}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#1a1a1a"}}>{area.name}</div>
                  {assignment
                    ? <div style={{fontSize:12,color:C.forest,marginTop:1}}>{assignment.crop_name||assignment.crop_definition?.name}</div>
                    : <div style={{fontSize:12,color:C.stone,marginTop:1}}>No crop planned</div>
                  }
                </div>
                {selectedPlan?.status==="draft" && (
                  <div style={{fontSize:12,color:C.stone,flexShrink:0}}>{assignment?"Edit ›":"+ Assign"}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sheets & modals */}
      {selectedAreaObj && !isPlanMode && (
        <AreaDetailSheet
          area={selectedAreaObj}
          crops={selectedAreaCrops}
          onClose={()=>{ setDetailArea(null); setActiveBlock(null); }}
        />
      )}

      {showCreatePlan && loc && (
        <CreatePlanSheet
          locationId={selectedLoc}
          locationName={loc.name}
          onSave={async (plan) => {
            setPlans(prev => [plan, ...prev]);
            setShowCreatePlan(false);
            // Fetch assignments, set them, then tell useEffect to skip its fetch
            try {
              const fresh = await apiFetch(`/plans/${plan.id}/assignments`);
              setAssignments(fresh || []);
            } catch(e) { setAssignments([]); }
            skipAssignmentFetch.current = true;
            setSelectedPlanId(plan.id);
          }}
          onClose={()=>setShowCreatePlan(false)}
        />
      )}

      {assignArea && selectedPlan && (
        <AssignCropSheet
          area={assignArea}
          plan={selectedPlan}
          currentAssignment={assignmentMap[assignArea.id]||null}
          onSave={result => {
            if (result) {
              setAssignments(prev => [...prev.filter(a=>a.area_id!==assignArea.id), result]);
              setPlanToast("✓ Crop assigned");
            } else {
              setAssignments(prev => prev.filter(a=>a.area_id!==assignArea.id));
              setPlanToast("✓ Removed");
            }
            setTimeout(()=>setPlanToast(null),1800);
            setAssignArea(null);
          }}
          onClose={()=>setAssignArea(null)}
        />
      )}

      {showCommit && selectedPlan && (
        <CommitPlanModal
          plan={selectedPlan}
          onConfirm={updated => {
            setPlans(prev => prev.map(p =>
              p.id===updated.id ? updated :
              (p.location_id===updated.location_id && p.status==="committed") ? {...p,status:"archived"} : p
            ));
            setShowCommit(false);
            setPlanToast("✅ Plan committed");
            setTimeout(()=>setPlanToast(null),2500);
          }}
          onClose={()=>setShowCommit(false)}
        />
      )}
    </div>
  );
}


const TABS = [
  { id: "dashboard", label: "Today",   icon: "◈" },
  { id: "garden",    label: "Garden",  icon: "⬡" },
  { id: "crops",     label: "Crops",   icon: "◉" },
  { id: "feeds",     label: "Feeds",   icon: "🧪" },
  { id: "profile",   label: "Profile", icon: "👤" },
];
// badges is not a nav tab — accessed from Profile and Today card

// ── Onboarding ────────────────────────────────────────────────────────────────
// Runs once after sign-up. Three steps: profile → location → area.
// Skipped entirely if the user already has at least one location.

// =============================================================================
// ONBOARDING — Phase 1 rebuild
// 4 steps: identity → crops → stage → area type
// Calls /onboarding/complete which creates everything and runs rule engine.
// User lands on Today with real tasks. Never an empty screen.
// =============================================================================

const ONBOARDING_CROPS = [
  { name: "Tomatoes",     emoji: "🍅" },
  { name: "Potatoes",     emoji: "🥔" },
  { name: "Carrots",      emoji: "🥕" },
  { name: "Lettuce",      emoji: "🥬" },
  { name: "Onions",       emoji: "🧅" },
  { name: "Peas",         emoji: "🫛" },
  { name: "Beans",        emoji: "🫘" },
  { name: "Garlic",       emoji: "🧄" },
  { name: "Courgette",    emoji: "🥒" },
  { name: "Strawberries", emoji: "🍓" },
  { name: "Spinach",      emoji: "🥬" },
  { name: "Cabbage",      emoji: "🥦" },
];

const STAGES = [
  { id: "not_sown",    label: "Not sown yet",     desc: "I'm planning to grow this" },
  { id: "just_sown",   label: "Just sown",         desc: "Sown in the last week or so" },
  { id: "growing",     label: "Growing already",   desc: "Seedlings or plants are up" },
  { id: "near_harvest",label: "Near harvest",      desc: "Almost ready to pick" },
];

const AREA_TYPES = [
  { id: "raised_bed",   label: "Raised bed",        emoji: "🪴" },
  { id: "container",    label: "Pots / containers",  emoji: "🪣" },
  { id: "greenhouse",   label: "Greenhouse",         emoji: "🏠" },
  { id: "open_ground",  label: "In-ground bed",      emoji: "🌱" },
];

function OnboardingScreen({ onComplete }) {
  const [step,          setStep]         = useState(0);
  // step 0 = identity, 1 = crops, 2 = stage, 3 = area, 4 = loading
  const [name,          setName]         = useState("");
  const [postcode,      setPostcode]     = useState("");
  const [selectedCrops, setSelectedCrops]= useState([]); // [{name, emoji}]
  const [stage,         setStage]        = useState(null);
  const [areaType,      setAreaType]     = useState(null);
  const [error,         setError]        = useState(null);
  const [loadingMsg,    setLoadingMsg]   = useState("");

  const toggleCrop = (crop) => {
    setSelectedCrops(prev =>
      prev.find(c => c.name === crop.name)
        ? prev.filter(c => c.name !== crop.name)
        : [...prev, crop]
    );
  };

  const canAdvance = () => {
    if (step === 0) return name.trim().length > 0 && postcode.trim().length > 0;
    if (step === 1) return selectedCrops.length > 0;
    if (step === 2) return stage !== null;
    if (step === 3) return areaType !== null;
    return false;
  };

  const next = () => {
    setError(null);
    if (step < 3) { setStep(s => s + 1); return; }
    // Step 3 → submit
    submit();
  };

  const submit = async () => {
    setStep(4); // loading screen
    const msgs = [
      "Setting up your first crops...",
      "Checking local weather...",
      "Generating your tasks...",
    ];
    let i = 0;
    setLoadingMsg(msgs[0]);
    const interval = setInterval(() => {
      i = (i + 1) % msgs.length;
      setLoadingMsg(msgs[i]);
    }, 900);

    try {
      // Look up crop_def_ids for selected crops
      const defs = await apiFetch("/crop-definitions");
      const cropsPayload = selectedCrops.map(c => {
        const def = defs?.find(d => d.name.toLowerCase() === c.name.toLowerCase());
        return { name: c.name, crop_def_id: def?.id || null, stage };
      });

      await apiFetch("/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          postcode: postcode.trim().toUpperCase(),
          crops: cropsPayload,
          area_type: areaType,
        }),
      });

      clearInterval(interval);
      // Small deliberate pause so loading feels intentional
      await new Promise(r => setTimeout(r, 600));
      onComplete();
    } catch (e) {
      clearInterval(interval);
      setError(e.message || "Something went wrong. Please try again.");
      setStep(3);
    }
  };

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div style={{ minHeight: "100vh", background: C.offwhite, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", fontFamily: "serif" }}>
        <div style={{ fontSize: 52, marginBottom: 24 }}>🌱</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.forest, marginBottom: 12, textAlign: "center" }}>Building your garden plan...</div>
        <div style={{ fontSize: 15, color: C.stone, textAlign: "center", minHeight: 24 }}>{loadingMsg}</div>
      </div>
    );
  }

  const stepLabels = ["About you", "Your crops", "Growth stage", "Where you're growing"];
  const progress = ((step + 1) / 4) * 100;

  return (
    <div style={{ background: C.offwhite, minHeight: "100vh", maxWidth: 440, margin: "0 auto", fontFamily: "Georgia, serif", paddingBottom: 40 }}>

      {/* Progress bar */}
      <div style={{ height: 3, background: C.border }}>
        <div style={{ height: "100%", width: `${progress}%`, background: C.forest, transition: "width 0.35s ease" }} />
      </div>

      <div style={{ padding: "28px 24px 0" }}>
        <div style={{ fontSize: 11, color: C.stone, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
          Step {step + 1} of 4
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.forest, marginBottom: 4 }}>
          {stepLabels[step]}
        </div>

        {error && (
          <div style={{ background: "#fff0f0", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginTop: 12, fontSize: 13, color: C.red }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: "24px 24px 0" }}>

        {/* ── Step 0: Identity ─────────────────────────────────────────────── */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.5, marginBottom: 4 }}>
              We'll use your postcode for local weather and task timing.
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.stone, letterSpacing: 1.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>First name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sarah"
                autoFocus
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.stone, letterSpacing: 1.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Postcode</label>
              <input
                value={postcode}
                onChange={e => setPostcode(e.target.value.toUpperCase())}
                placeholder="e.g. TS22"
                style={{ ...inputStyle, width: "100%" }}
              />
              <div style={{ fontSize: 11, color: C.stone, marginTop: 5 }}>First part only — e.g. TS22, not TS22 5BQ</div>
            </div>
          </div>
        )}

        {/* ── Step 1: Crop selection ───────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 14, color: C.stone, marginBottom: 18, lineHeight: 1.5 }}>
              Pick at least one — you can add more later.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {ONBOARDING_CROPS.map(crop => {
                const selected = selectedCrops.find(c => c.name === crop.name);
                return (
                  <button key={crop.name} onClick={() => toggleCrop(crop)}
                    style={{
                      background: selected ? C.forest : "#fff",
                      border: `2px solid ${selected ? C.forest : C.border}`,
                      borderRadius: 12,
                      padding: "14px 12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: "all 0.15s",
                    }}>
                    <span style={{ fontSize: 24 }}>{crop.emoji}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "serif", color: selected ? "#fff" : "#1a1a1a" }}>
                      {crop.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Growth stage (one answer for all crops) ──────────────── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 14, color: C.stone, marginBottom: 18, lineHeight: 1.5 }}>
              A rough answer is fine — we'll build your plan from this.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {STAGES.map(s => (
                <button key={s.id} onClick={() => setStage(s.id)}
                  style={{
                    background: stage === s.id ? C.forest : "#fff",
                    border: `2px solid ${stage === s.id ? C.forest : C.border}`,
                    borderRadius: 12,
                    padding: "16px 18px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "serif", color: stage === s.id ? "#fff" : "#1a1a1a", marginBottom: 3 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 13, color: stage === s.id ? "rgba(255,255,255,0.7)" : C.stone }}>
                    {s.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Area type ────────────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 14, color: C.stone, marginBottom: 18, lineHeight: 1.5 }}>
              This helps us tailor watering, frost alerts and planting timings.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {AREA_TYPES.map(a => (
                <button key={a.id} onClick={() => setAreaType(a.id)}
                  style={{
                    background: areaType === a.id ? C.forest : "#fff",
                    border: `2px solid ${areaType === a.id ? C.forest : C.border}`,
                    borderRadius: 12,
                    padding: "18px 14px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.15s",
                  }}>
                  <span style={{ fontSize: 28 }}>{a.emoji}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "serif", color: areaType === a.id ? "#fff" : "#1a1a1a", textAlign: "center" }}>
                    {a.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Continue / Submit button ─────────────────────────────────────── */}
        <button
          onClick={next}
          disabled={!canAdvance()}
          style={{
            width: "100%",
            marginTop: 28,
            padding: 16,
            background: canAdvance() ? C.forest : C.border,
            color: canAdvance() ? "#fff" : C.stone,
            border: "none",
            borderRadius: 12,
            fontSize: 16,
            fontWeight: 700,
            cursor: canAdvance() ? "pointer" : "not-allowed",
            fontFamily: "serif",
            transition: "background 0.2s",
          }}>
          {step === 3 ? "Build my plan 🌱" : "Continue →"}
        </button>

        {step > 0 && (
          <button onClick={() => { setStep(s => s - 1); setError(null); }}
            style={{ background: "none", border: "none", color: C.stone, fontSize: 13, cursor: "pointer", textDecoration: "underline", marginTop: 14, display: "block" }}>
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}


function IOSInstallBanner({ onDismiss }) {
  return (
    <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 408, background: "#1a2e28", borderRadius: 16, padding: "16px 18px", zIndex: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.25)", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ fontSize: 28, flexShrink: 0 }}>🌱</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Add Vercro to your home screen</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
          Tap <strong style={{ color: "rgba(255,255,255,0.85)" }}>Share ⎋</strong> then <strong style={{ color: "rgba(255,255,255,0.85)" }}>"Add to Home Screen"</strong> for the full experience including camera features.
        </div>
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer", flexShrink: 0, padding: 0, lineHeight: 1 }}>×</button>
    </div>
  );
}

export default function GrowSmart() {
  const router = useRouter();
  const [session,     setSession]     = useState(undefined); // undefined = loading
  const [onboarding,  setOnboarding]  = useState(null);      // null = checking, true/false = resolved
  const [tab,         setTab]         = useState("dashboard");
  const [addPrefill,  setAddPrefill]  = useState(null);
  const [prevTab,     setPrevTab]     = useState("dashboard");
  const [editCropFocus, setEditCropFocus] = useState(null);
  const [openTimeAway,  setOpenTimeAway]  = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));

    // Register service worker for push notifications
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then(reg => console.log("[SW] Registered:", reg.scope))
        .catch(err => console.warn("[SW] Registration failed:", err));
    }

    return () => subscription.unsubscribe();
  }, []);

  // Once we have a session, check whether onboarding is needed
  useEffect(() => {
    if (!session) { setOnboarding(null); return; }
    // Show onboarding if user has no locations yet
    apiFetch("/locations")
      .then(locs => setOnboarding(locs.length === 0))
      .catch(() => setOnboarding(false));
  }, [session]);

  const isAdmin  = session?.user?.email === "mark@wynyardadvisory.co.uk";
  const isViewer = session?.user?.id === "448095f2-d379-4232-90f2-6ac7cebe1c70";
  const [isDemo, setIsDemo] = useState(false);

  // Fetch is_demo flag from profile
  useEffect(() => {
    if (!session) { setIsDemo(false); return; }
    apiFetch("/auth/profile")
      .then(p => setIsDemo(p?.is_demo === true))
      .catch(() => setIsDemo(false));
  }, [session]);
  const [showFeedback,         setShowFeedback]         = useState(false);
  const [showGlobalPlantCheck, setShowGlobalPlantCheck] = useState(false);
  const showGlobalPlantCheckEnabled = usePlantCheckEnabled();
  const navEnabled = useNavEnabled();
  const [subscribedToast, setSubscribedToast] = useState(false);

  // Handle Stripe redirect back after successful checkout
  // Uses Next.js router for reliable query param detection and cleanup
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.subscribed !== "true") return;

    setSubscribedToast(true);
    try { localStorage.removeItem("vercro_is_pro"); } catch(e) {}

    // Remove ?subscribed=true from URL without reloading
    const { subscribed, ...rest } = router.query;
    router.replace(
      { pathname: router.pathname, query: rest },
      undefined,
      { shallow: true }
    );

    const timer = setTimeout(() => setSubscribedToast(false), 3500);
    return () => clearTimeout(timer);
  }, [router.isReady, router.query.subscribed]); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS install prompt — show if on iOS Safari and not installed as PWA
  const isIOS        = typeof window !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone = typeof window !== "undefined" && window.navigator.standalone === true;
  const isSafari     = typeof window !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const [showIOSBanner, setShowIOSBanner] = useState(false);

  useEffect(() => {
    if (isIOS && isSafari && !isInStandalone && !sessionStorage.getItem("ios-banner-dismissed")) {
      setShowIOSBanner(true);
    }
  }, []);

  const dismissIOSBanner = () => {
    sessionStorage.setItem("ios-banner-dismissed", "1");
    setShowIOSBanner(false);
  };

  if (session === undefined || (session && onboarding === null)) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: C.stone, fontSize: 14 }}>Loading…</div>;
  }
  if (!session)   return <AuthScreen onAuth={setSession} />;
  if (onboarding) return <OnboardingScreen onComplete={() => setOnboarding(false)} />;

  return (
    <div style={{ background: C.offwhite, minHeight: "100vh", fontFamily: "Georgia, serif", maxWidth: 440, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ background: C.offwhite, borderBottom: `1px solid ${C.border}`, padding: "16px 20px 12px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a" }}>Vercro 🌱</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 20px 110px" }}>
        {tab === "dashboard" && <Dashboard isDemo={isDemo} onTabChange={(newTab, payload) => { if (payload?.editCropId) setEditCropFocus({ cropId: payload.editCropId, editCropField: payload.editCropField }); if (payload?.openTimeAway) setOpenTimeAway(true); setTab(newTab); }} />}
        {tab === "garden"    && <GardenView onNavigateAdd={(prefill) => { setPrevTab("garden"); setAddPrefill(prefill); setTab("add"); }} />}
        {tab === "crops"     && <CropList isDemo={isDemo} navEnabled={navEnabled} onAddCrop={() => { setPrevTab("crops"); setTab("add"); }} editCropId={editCropFocus?.cropId} editCropField={editCropFocus?.field} onEditOpened={() => setEditCropFocus(null)} />}
        {tab === "add"       && <AddCrop prefill={addPrefill} onPrefillConsumed={() => setAddPrefill(null)} onCancel={() => { setAddPrefill(null); setTab(prevTab); }} />}
        {tab === "badges"    && <BadgesPage />}
        {tab === "feeds"     && !navEnabled && <FeedsScreen />}
        {tab === "plan"      && navEnabled   && <PlanScreen />}
        {tab === "profile"   && <ProfileScreen session={session} onTabChange={setTab} openTimeAway={openTimeAway} onTimeAwayOpened={() => setOpenTimeAway(false)} />}
        {tab === "admin"     && (isAdmin || isDemo) && <AdminScreen isDemo={isDemo} />}
        {tab === "admin"     && isViewer && !isAdmin && !isDemo && <ViewerAdminScreen />}
      </div>

      {/* iOS install banner */}
      {showIOSBanner && <IOSInstallBanner onDismiss={dismissIOSBanner} />}

      {/* Floating Plant Check button — Today tab only */}
      {tab === "dashboard" && showGlobalPlantCheckEnabled && !showFeedback && !showIOSBanner && (
        <button
          onClick={() => setShowGlobalPlantCheck(true)}
          style={{ position: "fixed", bottom: 90, left: 20, width: 48, height: 48, borderRadius: "50%", background: C.forest, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, transition: "transform 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          🔍
        </button>
      )}
      {showGlobalPlantCheckEnabled && showGlobalPlantCheck && (
        <PlantCheck
          entry="today"
          prefillCrop={null}
          onClose={() => setShowGlobalPlantCheck(false)}
          onDone={() => setShowGlobalPlantCheck(false)}
        />
      )}

      {/* Floating feedback button */}
      {!showFeedback && tab !== "admin" && !showIOSBanner && (
        <button onClick={() => setShowFeedback(true)}
          style={{ position: "fixed", bottom: 90, right: 20, width: 48, height: 48, borderRadius: "50%", background: C.forest, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, transition: "transform 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          💬
        </button>
      )}
      {showFeedback && <FeedbackSheet onClose={() => setShowFeedback(false)} />}

      {/* Subscribed success toast — shown after Stripe redirect */}
      {subscribedToast && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 1000, background: "#1E3D33", color: "#fff", padding: "12px 16px", borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", fontSize: 14, fontWeight: 600, maxWidth: "calc(100vw - 32px)", textAlign: "center" }}>
          Pro unlocked successfully 🌱
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 440, background: "rgba(247,246,242,0.96)", borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 20 }}>
        {[...(navEnabled
    ? [
        { id: "dashboard", label: "Today",   icon: "◈" },
        { id: "garden",    label: "Garden",  icon: "⬡" },
        { id: "plan",      label: "Plan",    icon: "◫" },
        { id: "crops",     label: "Crops",   icon: "◉" },
        { id: "profile",   label: "Profile", icon: "👤" },
      ]
    : TABS
  ), ...((isAdmin || isDemo) ? [{ id: "admin", label: "Admin", icon: "⚙️" }] : []), ...(isViewer && !isAdmin ? [{ id: "admin", label: "Admin", icon: "⚙️" }] : [])].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, border: "none", background: "transparent", padding: "10px 4px 14px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: tab === t.id ? C.forest : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: t.id === "add" ? 22 : 16, color: tab === t.id ? "#fff" : C.stone, transition: "all 0.2s" }}>{t.icon}</div>
            <div style={{ fontSize: 10, color: tab === t.id ? C.forest : C.stone, fontFamily: "sans-serif", fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</div>
          </button>
        ))}
      </div>
      <Analytics />
    </div>
  );
}