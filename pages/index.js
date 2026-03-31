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

const BADGE_CATEGORIES = ["tasks","planning","sowing","harvest","photos","consistency","seasonal"];
const CATEGORY_LABELS  = { tasks:"Tasks", planning:"Planning", sowing:"Sowing", harvest:"Harvest", photos:"Photos & Sharing", consistency:"Consistency", seasonal:"Seasonal" };

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

          {/* Streak */}
          <div style={{ background:C.cardBg, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", marginTop:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:28 }}>🔥</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1a1a1a" }}>Current Streak</div>
                  <div style={{ fontSize:12, color:C.stone }}>Longest: {counters.longest_streak_days || 0} days</div>
                </div>
              </div>
              <div style={{ fontSize:28, fontWeight:700, fontFamily:"serif", color:C.forest }}>{counters.current_streak_days || 0}<span style={{ fontSize:14, fontWeight:400, color:C.stone }}> days</span></div>
            </div>
          </div>
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

function Dashboard({ onTabChange }) {
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
  const [engineRefreshing, setEngineRefreshing] = useState(false); // true when waiting for on-demand engine

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

  // Auto-refresh when Today is empty — backend runs engine on demand, we poll once after 1.5s
  // This makes empty screens feel like "loading your plan" not "app has nothing"
  useEffect(() => {
    if (!data || loading) return;
    const activeTasks = (data.tasks?.today || []).length +
                        (data.tasks?.this_week || []).length +
                        (data.tasks?.alerts || []).length;
    if (activeTasks === 0 && !engineRefreshing) {
      setEngineRefreshing(true);
      const timer = setTimeout(() => {
        load(true); // background reload
        setEngineRefreshing(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [data, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div style={{ padding: "0 0 80px" }}>
      {/* Skeleton header */}
      <div style={{ background: "linear-gradient(135deg, #2F5D50 0%, #1e3d33 100%)", borderRadius: 16, padding: "20px 20px 16px", marginBottom: 14, height: 100 }} />
      {/* Skeleton cards */}
      {[1,2,3].map(i => (
        <div key={i} style={{ background: "#f0f0f0", borderRadius: 12, height: 80, marginBottom: 12, animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
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

      {/* Standalone log activity button — always visible at bottom of Today */}
      <div style={{ padding: "12px 0 4px" }}>
        <button onClick={() => setShowLogActivity(true)}
          style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 16px", fontSize: 13, color: C.stone, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>📋</span> Log activity
        </button>
      </div>

      {allTasks.filter(t => !completed.has(t.id)).length === 0 && recentlyDone.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: C.stone }}>
          {engineRefreshing ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌱</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 6 }}>
                Checking what your garden needs today
              </div>
              <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.5 }}>
                Just a moment…
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "serif", color: "#1a1a1a", marginBottom: 6 }}>
                You're all caught up
              </div>
              <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.5 }}>
                Your garden is in good shape — check back tomorrow.
              </div>
            </>
          )}
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
    } catch(e) { console.error(e); setSaving(false); }
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

function CropList({ onAddCrop, editCropId, editCropField, onEditOpened }) {
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
          sown_date:  editForm.sown_date || null,   // never send empty string
          variety_id: isOther ? null : (editForm.variety_id || null),
          variety:    isOther ? (editForm.variety || null) : (editVarieties.find(v => v.id === editForm.variety_id)?.name || editForm.variety || null),
          status:     editForm.status || "growing",
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

      {/* Sign out */}
      <button
        onClick={() => supabase.auth.signOut()}
        style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px", fontWeight: 600, fontSize: 14, cursor: "pointer", color: C.stone, marginBottom: 8 }}>
        Sign Out
      </button>

      <div style={{ fontSize: 11, color: C.stone, textAlign: "center", marginTop: 8 }}>Vercro — version 1.0</div>
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
  const [showFeedback, setShowFeedback] = useState(false);

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
        {tab === "dashboard" && <Dashboard onTabChange={(newTab, payload) => { if (payload?.editCropId) setEditCropFocus({ cropId: payload.editCropId, editCropField: payload.editCropField }); if (payload?.openTimeAway) setOpenTimeAway(true); setTab(newTab); }} />}
        {tab === "garden"    && <GardenView onNavigateAdd={(prefill) => { setPrevTab("garden"); setAddPrefill(prefill); setTab("add"); }} />}
        {tab === "crops"     && <CropList onAddCrop={() => { setPrevTab("crops"); setTab("add"); }} editCropId={editCropFocus?.cropId} editCropField={editCropFocus?.field} onEditOpened={() => setEditCropFocus(null)} />}
        {tab === "add"       && <AddCrop prefill={addPrefill} onPrefillConsumed={() => setAddPrefill(null)} onCancel={() => { setAddPrefill(null); setTab(prevTab); }} />}
        {tab === "badges"    && <BadgesPage />}
        {tab === "feeds"     && <FeedsScreen />}
        {tab === "profile"   && <ProfileScreen session={session} onTabChange={setTab} openTimeAway={openTimeAway} onTimeAwayOpened={() => setOpenTimeAway(false)} />}
        {tab === "admin"     && (isAdmin || isDemo) && <AdminScreen isDemo={isDemo} />}
        {tab === "admin"     && isViewer && !isAdmin && !isDemo && <ViewerAdminScreen />}
      </div>

      {/* iOS install banner */}
      {showIOSBanner && <IOSInstallBanner onDismiss={dismissIOSBanner} />}

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

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 440, background: "rgba(247,246,242,0.96)", borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 20 }}>
        {[...TABS, ...((isAdmin || isDemo) ? [{ id: "admin", label: "Admin", icon: "⚙️" }] : []), ...(isViewer && !isAdmin ? [{ id: "admin", label: "Admin", icon: "⚙️" }] : [])].map(t => (
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