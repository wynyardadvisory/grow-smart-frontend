import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const C = {
  forest:     "#2F5D50",
  forestDark: "#1e3d33",
  sage:       "#8BAF98",
  offwhite:   "#F4F8F2",
  stone:      "#6E6E6E",
  leaf:       "#6FAF63",
  amber:      "#D9A441",
  border:     "#D4E8CE",
  cardBg:     "#FFFFFF",
  red:        "#c65a5a",
};

// ── App mockup ────────────────────────────────────────────────────────────────
function AppMockup() {
  return (
    <div style={{
      width: 260,
      background: "#f4f8f2",
      borderRadius: 36,
      boxShadow: "0 32px 80px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.6)",
      overflow: "hidden",
      border: "8px solid #1a2e26",
      fontFamily: "Georgia, serif",
    }}>
      <div style={{ background: "#1a2e26", height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 80, height: 10, background: "#0d1f1a", borderRadius: 99 }} />
      </div>
      <div style={{ background: C.offwhite, padding: "8px 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", fontFamily: "sans-serif" }}>9:41</span>
      </div>
      <div style={{ background: C.offwhite, borderBottom: `1px solid ${C.border}`, padding: "10px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Vercro 🌱</span>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.forest, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>👤</div>
      </div>
      <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.forestDark} 100%)`, margin: "10px 10px 0", borderRadius: 14, padding: "14px 14px 12px", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ fontSize: 9, opacity: 0.65, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2, fontFamily: "sans-serif" }}>Today in your garden</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Good morning, Mark 👋</div>
        <div style={{ marginTop: 10, background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>⛅</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>8°C</span>
          <span style={{ fontSize: 10, opacity: 0.7, fontFamily: "sans-serif" }}>Frost risk: Low</span>
        </div>
      </div>
      <div style={{ padding: "10px 10px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div style={{ height: 2, width: 10, background: C.amber, borderRadius: 99 }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.stone, textTransform: "uppercase", fontFamily: "sans-serif" }}>Today's tasks</span>
        </div>
        {[
          { emoji: "🍅", name: "Tomatoes",   variety: "Gardener's Delight", action: "Sow indoors — ideal time now",          urgency: C.amber },
          { emoji: "🥕", name: "Carrots",    variety: "Nantes 2",           action: "Thin seedlings to 5cm apart",           urgency: C.leaf  },
          { emoji: "🧅", name: "Onion sets", variety: "Sturon",             action: "Plant out — soil temperature ideal",    urgency: C.amber },
        ].map((task, i) => (
          <div key={i} style={{ background: "#fff", border: `1px solid ${task.urgency}44`, borderLeft: `3px solid ${task.urgency}`, borderRadius: 10, padding: "9px 10px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{task.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", marginBottom: 1 }}>{task.name} <span style={{ color: C.stone, fontWeight: 400 }}>· {task.variety}</span></div>
              <div style={{ fontSize: 10, color: C.stone, lineHeight: 1.3, fontFamily: "sans-serif" }}>{task.action}</div>
            </div>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${C.border}`, flexShrink: 0 }} />
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 10px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <div style={{ height: 2, width: 10, background: C.leaf, borderRadius: 99 }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: C.stone, textTransform: "uppercase", fontFamily: "sans-serif" }}>Harvest forecast</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { emoji: "🥬", name: "Lettuce", window: "Apr — May", pct: 65 },
            { emoji: "🫛", name: "Peas",    window: "Jun — Jul", pct: 30 },
          ].map((h, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{h.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>{h.name}</span>
              </div>
              <div style={{ fontSize: 9, color: C.stone, marginBottom: 5, fontFamily: "sans-serif" }}>{h.window}</div>
              <div style={{ height: 4, background: C.border, borderRadius: 99 }}>
                <div style={{ height: "100%", width: h.pct + "%", background: C.amber, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: "rgba(244,248,242,0.96)", borderTop: `1px solid ${C.border}`, display: "flex", marginTop: 10, padding: "8px 4px 12px" }}>
        {[
          { icon: "◈", label: "Today",   active: true  },
          { icon: "⬡", label: "Garden",  active: false },
          { icon: "◉", label: "Crops",   active: false },
          { icon: "+", label: "Add",     active: false },
          { icon: "👤", label: "Profile", active: false },
        ].map(t => (
          <div key={t.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: t.active ? C.forest : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: t.label === "Add" ? 16 : 12, color: t.active ? "#fff" : C.stone }}>
              {t.icon}
            </div>
            <span style={{ fontSize: 8, color: t.active ? C.forest : C.stone, fontFamily: "sans-serif", fontWeight: t.active ? 700 : 400 }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Signup form ───────────────────────────────────────────────────────────────
function SignupForm({ compact = false }) {
  const [step,        setStep]        = useState("form");
  const [showEmail,   setShowEmail]   = useState(false);
  const [magicSent,   setMagicSent]   = useState(false);
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [name,        setName]        = useState("");
  const [mode,        setMode]        = useState("signup");
  const [errorMsg,    setErrorMsg]    = useState("");
  const [magicEmail,  setMagicEmail]  = useState("");

  const canSubmit = email.trim() && password.length >= 6;

  const submit = async () => {
    setStep("submitting"); setErrorMsg("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() || null } },
        });
        if (error) throw error;
        if (data?.session) {
          window.location.href = "https://app.vercro.com";
        } else {
          setStep("done");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        window.location.href = "https://app.vercro.com";
      }
    } catch (e) {
      setErrorMsg(e.message || "Something went wrong. Please try again.");
      setStep("form");
    }
  };

  const googleSignup = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://app.vercro.com" },
    });
  };

  const appleSignup = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: "https://app.vercro.com" },
    });
  };

  const sendMagicLink = async () => {
    if (!magicEmail.trim()) return;
    setStep("submitting");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: magicEmail.trim(),
        options: { emailRedirectTo: "https://app.vercro.com" },
      });
      if (error) throw error;
      setMagicSent(true);
      setStep("form");
    } catch (e) {
      setErrorMsg(e.message);
      setStep("form");
    }
  };

  const inputStyle = {
    width: "100%", padding: compact ? "11px 14px" : "13px 16px",
    border: `1.5px solid ${C.border}`, borderRadius: 12,
    fontSize: compact ? 14 : 15, background: "#fff", color: "#1a1a1a",
    outline: "none", boxSizing: "border-box",
    fontFamily: "'DM Sans', sans-serif",
  };

  if (step === "done") return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.forest, marginBottom: 8, fontFamily: "'Playfair Display', serif" }}>Check your email</div>
      <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6 }}>Click the link we sent you to open your garden plan.</div>
    </div>
  );

  if (magicSent) return (
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✉️</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.forest, marginBottom: 8, fontFamily: "'Playfair Display', serif" }}>Magic link sent!</div>
      <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6 }}>Check your inbox — tap the link to open your garden plan instantly. No password needed.</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Google — dominant, full width, green */}
      <button onClick={googleSignup}
        style={{
          width: "100%", padding: compact ? "13px" : "16px",
          borderRadius: 12, border: "none",
          background: C.forest, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          fontSize: compact ? 15 : 16, fontWeight: 700,
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          boxShadow: "0 4px 16px rgba(47,93,80,0.3)",
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.92"}
        onMouseLeave={e => e.currentTarget.style.opacity = "1"}
      >
        <svg width="20" height="20" viewBox="0 0 18 18">
          <path fill="#fff" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" opacity=".9"/>
          <path fill="#fff" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" opacity=".8"/>
          <path fill="#fff" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" opacity=".7"/>
          <path fill="#fff" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" opacity=".6"/>
        </svg>
        Continue with Google — instant access
      </button>

      <div style={{ fontSize: 11, color: C.stone, textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
        One tap · No password · Straight into your garden
      </div>

      {/* Apple */}
      <button onClick={appleSignup}
        style={{
          width: "100%", padding: compact ? "13px" : "16px",
          borderRadius: 12, border: "none",
          background: "#000", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          fontSize: compact ? 15 : 16, fontWeight: 700,
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
        onMouseLeave={e => e.currentTarget.style.opacity = "1"}
      >
        <svg width="18" height="18" viewBox="0 0 814 1000" fill="white" style={{ flexShrink: 0 }}>
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.2 0 128.8 45.7 172.1 45.7 41.5 0 106.6-48.3 185.2-48.3zM657.3 19.8c32.6-38.7 56.3-92.7 56.3-146.7 0-7.4-.6-14.9-1.9-21.1-53.4 2-116.8 35.5-155.5 80.3-29.9 33.9-59.1 87.2-59.1 141.9 0 8.1 1.3 16.2 1.9 18.8 3.2.6 8.4 1.3 13.6 1.3 47.8 0 107.6-31.9 144.7-74.5z"/>
        </svg>
        Continue with Apple
      </button>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <span style={{ fontSize: 11, color: C.stone }}>or</span>
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>

      {/* Magic link — secondary but prominent */}
      {!showEmail && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="email" value={magicEmail}
            onChange={e => setMagicEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMagicLink()}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Email — get a magic link"
          />
          <button onClick={sendMagicLink}
            disabled={!magicEmail.trim() || step === "submitting"}
            style={{
              flexShrink: 0, padding: "0 16px", borderRadius: 12, border: "none",
              background: magicEmail.trim() ? C.leaf : C.border,
              color: magicEmail.trim() ? "#1a2e26" : C.stone,
              fontWeight: 700, fontSize: 13, cursor: magicEmail.trim() ? "pointer" : "default",
              fontFamily: "'DM Sans', sans-serif",
            }}>
            {step === "submitting" ? "..." : "Send →"}
          </button>
        </div>
      )}

      {/* Email/password toggle */}
      {!showEmail ? (
        <button onClick={() => setShowEmail(true)}
          style={{ background: "none", border: "none", color: C.stone, fontSize: 12, cursor: "pointer", textAlign: "center", padding: "2px 0", fontFamily: "'DM Sans', sans-serif" }}>
          Use email + password instead
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "signup" && (
            <input value={name} onChange={e => setName(e.target.value)}
              style={inputStyle} placeholder="Your name (optional)" />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            style={inputStyle} placeholder="Email address" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && canSubmit && submit()}
            style={inputStyle} placeholder={mode === "signup" ? "Create a password (6+)" : "Password"} />
          {errorMsg && (
            <div style={{ fontSize: 13, color: C.red, background: "#fff5f5", borderRadius: 8, padding: "8px 12px" }}>{errorMsg}</div>
          )}
          <button onClick={submit} disabled={!canSubmit || step === "submitting"}
            style={{
              width: "100%", padding: "13px", borderRadius: 12, border: "none",
              background: canSubmit ? C.leaf : C.border,
              color: canSubmit ? "#1a2e26" : C.stone,
              fontWeight: 700, fontSize: 15, cursor: canSubmit ? "pointer" : "not-allowed",
              fontFamily: "'Playfair Display', serif",
            }}>
            {step === "submitting" ? "..." : mode === "signup" ? "Get my garden plan →" : "Log in →"}
          </button>
          <div style={{ textAlign: "center", fontSize: 12, color: C.stone }}>
            {mode === "signup" ? (
              <button onClick={() => setMode("login")} style={{ background: "none", border: "none", color: C.forest, fontWeight: 600, cursor: "pointer", fontSize: 12, padding: 0 }}>Already have an account? Log in</button>
            ) : (
              <button onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: C.forest, fontWeight: 600, cursor: "pointer", fontSize: 12, padding: 0 }}>Create a free account</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Funnel step component ─────────────────────────────────────────────────────
function FunnelStep({ num, label, title, desc, tag, tagColor, isLast }) {
  const colors = {
    red:    { bg: "rgba(239,68,68,.08)",   border: "rgba(239,68,68,.25)",   text: "#f87171" },
    amber:  { bg: "rgba(245,158,11,.08)",  border: "rgba(245,158,11,.25)",  text: "#fbbf24" },
    green:  { bg: "rgba(111,175,99,.10)",  border: "rgba(111,175,99,.3)",   text: "#86efac" },
    bright: { bg: "rgba(111,175,99,.15)",  border: "rgba(111,175,99,.45)",  text: "#bbf7d0" },
  };
  const col = colors[tagColor] || colors.green;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: "0 18px", alignItems: "start" }}>
      {/* Left: number + connector line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
          background: col.bg, border: `2px solid ${col.border}`, color: col.text,
          position: "relative", zIndex: 1,
        }}>{num}</div>
        {!isLast && (
          <div style={{
            width: 2, flexGrow: 1, minHeight: 32,
            background: "linear-gradient(180deg, rgba(111,175,99,.25), rgba(111,175,99,.04))",
            margin: "4px 0",
          }} />
        )}
      </div>
      {/* Right: content */}
      <div style={{ paddingBottom: isLast ? 0 : 36, paddingTop: 4 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: col.text, fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 7, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.62)", lineHeight: 1.65, marginBottom: 10 }}>{desc}</div>
        <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "4px 13px", borderRadius: 50, background: col.bg, color: col.text, border: `1px solid ${col.border}` }}>{tag}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const signupRef       = useRef(null);
  const [stickyVisible, setStickyVisible] = useState(false);

  const scrollToSignup = () =>
    signupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = "https://app.vercro.com";
    });
  }, []);

  // Sticky bar — show after hero, hide when footer is in viewport
  useEffect(() => {
    const onScroll = () => {
      const footer = document.querySelector("footer");
      if (!footer) { setStickyVisible(window.scrollY > 600); return; }
      const footerTop = footer.getBoundingClientRect().top;
      setStickyVisible(window.scrollY > 600 && footerTop > window.innerHeight);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <Head>
        <title>Vercro — Know exactly what to do in your garden, every day</title>
        <meta name="description" content="Vercro plans, tracks and tells you exactly what to do — every day. From seed to harvest, automatically. Not a calendar. A plan. Free for UK growers." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#2F5D50" />
        <meta property="og:title" content="Vercro — Know exactly what to do in your garden, every day" />
        <meta property="og:description" content="Personalised daily tasks, weather-aware advice, and crop guidance — built for UK home growers and allotment holders. Free to start." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://vercro.com" />
        {/* Meta Pixel */}
        <script dangerouslySetInnerHTML={{ __html: `
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '906824945419683');
          fbq('track', 'PageView');
        `}} />
        <noscript dangerouslySetInnerHTML={{ __html: `
          <img height="1" width="1" style="display:none"
          src="https://www.facebook.com/tr?id=906824945419683&ev=PageView&noscript=1" />
        `}} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html { scroll-behavior: smooth; }
          body { background: ${C.offwhite}; }

          @keyframes fadeUp   { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
          @keyframes floatPhone { 0%,100% { transform:translateY(0) rotate(2deg); } 50% { transform:translateY(-12px) rotate(2deg); } }
          @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
          @keyframes slideUp  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

          .hero-text   { animation: fadeUp 0.65s ease both; }
          .hero-text-2 { animation: fadeUp 0.65s 0.12s ease both; }
          .hero-text-3 { animation: fadeUp 0.65s 0.25s ease both; }
          .hero-card   { animation: fadeUp 0.65s 0.18s ease both; }
          .phone-float { animation: floatPhone 5s ease-in-out infinite; }
          .fade-in     { animation: fadeIn 0.8s 0.35s ease both; }
          .sticky-bar  { animation: slideUp 0.25s ease both; }

          .feature-card { transition: transform 0.2s, box-shadow 0.2s; }
          .feature-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(47,93,80,0.12) !important; }
          .step-card { transition: transform 0.2s; }
          .step-card:hover { transform: translateY(-2px); }

          @media (max-width: 768px) {
            .hero-inner   { flex-direction: column !important; text-align: center !important; }
            .hero-phone   { margin-top: 40px; }
            .features-grid { grid-template-columns: 1fr 1fr !important; }
            .steps-grid   { grid-template-columns: 1fr !important; }
            .two-col      { grid-template-columns: 1fr !important; }
            .hide-mobile  { display: none !important; }
          }
          @media (max-width: 480px) {
            .features-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </Head>

      <div style={{ fontFamily: "'DM Sans', sans-serif", color: "#1a1a1a", maxWidth: "100vw", overflowX: "hidden" }}>

        {/* ── Sticky CTA bar ── */}
        {stickyVisible && (
          <div className="sticky-bar" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200, background: C.forest, padding: "10px 20px 14px", borderTop: `1px solid ${C.forestDark}` }}>
            <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>Free · No card · 2 min setup</span>
              <button onClick={scrollToSignup}
                style={{ flex: 1, background: C.leaf, color: "#1a2e26", border: "none", borderRadius: 12, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Playfair Display', serif" }}>
                Get my garden plan →
              </button>
            </div>
          </div>
        )}

        {/* ── Nav ── */}
        <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(244,248,242,0.95)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}`, padding: "14px 24px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: C.forest }}>Vercro 🌱</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <a href="https://app.vercro.com"
                style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.forest, textDecoration: "none" }}>
                Log in
              </a>
              <button onClick={scrollToSignup}
                style={{ background: C.forest, color: "#fff", border: "none", borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Start for free
              </button>
            </div>
          </div>
        </nav>

        {/* ══ HERO — signup card is HERE, above the fold ══════════════════════ */}
        {/* KEY CHANGE: hero now contains the signup form directly so users see
            it within 2 seconds of landing. Phone mockup sits alongside on desktop,
            below on mobile. No scrolling required to reach the CTA. */}
        <section style={{ background: `linear-gradient(160deg, ${C.forest} 0%, ${C.forestDark} 60%, #162e25 100%)`, color: "#fff", padding: "72px 24px 100px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -80, right: -80, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.03)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -60, left: -60, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.03)", pointerEvents: "none" }} />

          <div className="hero-inner" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "flex-start", gap: 56, justifyContent: "space-between" }}>

            {/* Left: headline + signup card */}
            <div style={{ flex: 1, maxWidth: 500 }}>
              <div className="hero-text" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.10)", borderRadius: 99, padding: "6px 16px", fontSize: 12, fontWeight: 600, marginBottom: 24, border: "1px solid rgba(255,255,255,0.15)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.leaf, display: "inline-block" }} />
                Join 1,000+ UK growers using Vercro
              </div>

              {/* KEY CHANGE: headline sharpened — creates mild tension that drives action */}
              <h1 className="hero-text-2" style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 16, letterSpacing: "-0.5px" }}>
                Know exactly what<br />to do in your garden<br />
                <span style={{ color: C.leaf, fontStyle: "italic" }}>every day.</span>
              </h1>

              <p className="hero-text-3" style={{ fontSize: 16, lineHeight: 1.7, opacity: 0.82, marginBottom: 8, maxWidth: 420 }}>
                Vercro plans, tracks, and tells you exactly what to do — every day.
              </p>
              <p className="hero-text-3" style={{ fontSize: 14, color: C.leaf, fontWeight: 600, marginBottom: 32 }}>
                From seed to harvest — automatically. Takes 2 minutes to set up.
              </p>

              {/* Signup card — directly in the hero, no scrolling needed */}
              <div className="hero-card" ref={signupRef} id="signup" style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", boxShadow: "0 24px 80px rgba(0,0,0,0.30)" }}>
                <SignupForm />
              </div>

              {/* Expectation line — sets immediate value expectation */}
              <div style={{ textAlign: "center", marginTop: 14, marginBottom: 6, fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>
                Add your first crops and see your first tasks straight away.
              </div>

              {/* Trust signals immediately below card */}
              <div className="hero-text-3" style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", marginTop: 20 }}>
                {["🇬🇧 UK growing conditions", "📍 Postcode weather", "🔔 Daily reminders", "🌱 Free, no card"].map((item, i) => (
                  <span key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 5 }}>{item}</span>
                ))}
              </div>
            </div>

            {/* Right: floating phone mockup */}
            <div className="hero-phone fade-in" style={{ flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 48 }}>
              <div className="phone-float" style={{ filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.4))" }}>
                <AppMockup />
              </div>
            </div>

          </div>
        </section>

        {/* ── Contrast strip ── */}
        <section style={{ background: "#1A2E28", padding: "56px 24px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            <div style={{ padding: "28px 32px", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.28)", fontWeight: 500, marginBottom: 14 }}>Other apps</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.25)", marginBottom: 20 }}>Tell you when to sow</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {["Generic sowing calendars", "Date reminders", "Advice you have to act on", "You're still left deciding what to do next", "Static plans that never change"].map((item, i) => (
                  <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", paddingLeft: 18, position: "relative" }}>
                    <span style={{ position: "absolute", left: 0, color: "rgba(255,255,255,0.15)" }}>—</span>{item}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: "28px 32px" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.sage, fontWeight: 500, marginBottom: 14 }}>Vercro</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Runs your garden for you</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {[
                  "Daily task plan for every bed you grow in",
                  "Rule engine — not just date offsets",
                  "Not advice. Actual actions.",
                  "Seed to harvest, fully managed",
                  { text: "Improves your garden over time", bold: true },
                ].map((item, i) => (
                  <div key={i} style={{ fontSize: 13, color: typeof item === "object" ? "#fff" : "rgba(255,255,255,0.85)", paddingLeft: 18, position: "relative", fontWeight: typeof item === "object" ? 600 : 400 }}>
                    <span style={{ position: "absolute", left: 0, color: C.sage, fontSize: 11 }}>✓</span>
                    {typeof item === "object" ? item.text : item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Boost Your Bed — new differentiator section ── */}
        <section style={{ padding: "80px 24px", background: C.offwhite }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }} className="two-col">
            <div>
              <div style={{ display: "inline-block", background: "rgba(74,140,111,0.12)", color: C.forest, fontSize: 10, fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase", borderRadius: 100, padding: "5px 14px", marginBottom: 20 }}>
                Boost your bed
              </div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 900, lineHeight: 1.1, color: "#1a1a1a", marginBottom: 16 }}>
                Your garden gets <em style={{ fontStyle: "italic", color: C.forest }}>better</em> over time.
              </h2>
              <p style={{ fontSize: 16, color: C.stone, lineHeight: 1.7, marginBottom: 28, fontWeight: 300 }}>
                Vercro doesn't just tell you what to do. It actively improves your garden — suggesting what to plant together to reduce pests, build soil health, and increase your yield. Built into your plan automatically.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {[
                  { icon: "🐛", text: "Reduce pest risk" },
                  { icon: "🌍", text: "Improve soil fertility" },
                  { icon: "📈", text: "Increase your yield" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: "#1a1a1a", fontWeight: 500 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(74,140,111,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{item.icon}</div>
                    {item.text}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: C.sage, fontStyle: "italic" }}>Based on what's already planted in your bed.</div>
            </div>

            <div style={{ background: "#fff", borderRadius: 20, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 20px 60px rgba(47,93,80,0.1)" }}>
              <div style={{ background: C.forest, padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 3 }}>Raised bed 1 · Tomatoes &amp; Carrots</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: "#fff", fontWeight: 700 }}>Boost this bed</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4, fontStyle: "italic" }}>Based on what's already planted here</div>
              </div>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: C.stone, marginBottom: 12 }}>Make this bed more productive</div>
                {[
                  { emoji: "🌼", name: "Marigold", tag: "+ Reduces pest risk", desc: "Repels whitefly and aphids that attack tomatoes. Plant at the bed edge for best effect." },
                  { emoji: "🫘", name: "Broad Bean", tag: "+ Improves soil fertility", desc: "Fixes nitrogen in the soil — your follow-on crops will benefit significantly next season." },
                  { emoji: "🧅", name: "Spring Onion", tag: "+ Deters carrot fly", desc: "Planted alongside carrots, naturally confuses carrot fly." },
                ].map((item, i) => (
                  <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 22 }}>{item.emoji}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{item.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: C.leaf, background: "rgba(74,140,111,0.1)", borderRadius: 100, padding: "2px 10px", marginLeft: "auto", whiteSpace: "nowrap" }}>{item.tag}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.stone, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section style={{ padding: "80px 24px", background: "#fff" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.forest, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>How it works</div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.2 }}>
                Up and growing in minutes
              </h2>
            </div>
            <div className="steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
              {[
                { step: "01", icon: "🌱", title: "Add your crops",    desc: "Tell Vercro what you're growing and where. Takes about 2 minutes." },
                { step: "02", icon: "📅", title: "Get your plan",     desc: "Vercro builds a personalised timeline and daily task list for every crop." },
                { step: "03", icon: "✅", title: "Follow daily tasks", desc: "Open the app each day to see exactly what needs doing — and tick it off." },
              ].map((s, i) => (
                <div key={i} className="step-card" style={{ background: C.offwhite, border: `1px solid ${C.border}`, borderRadius: 20, padding: "32px 28px", position: "relative" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.forest, letterSpacing: 2, marginBottom: 16, opacity: 0.6 }}>{s.step}</div>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>{s.icon}</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>{s.title}</div>
                  <div style={{ fontSize: 14, color: C.stone, lineHeight: 1.6 }}>{s.desc}</div>
                  {i < 2 && (
                    <div className="hide-mobile" style={{ position: "absolute", right: -16, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: C.border, zIndex: 1 }}>→</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Funnel map (new section) ── */}
        {/* This section makes the conversion logic visible and builds trust */}
        <section style={{ padding: "80px 24px", background: `linear-gradient(180deg, ${C.forest} 0%, ${C.forestDark} 100%)`, color: "#fff" }}>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 52 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.leaf, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Your journey</div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, lineHeight: 1.2, marginBottom: 12 }}>
                From sign up to first harvest — mapped
              </h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
                Here's exactly what happens after you tap "Get my garden plan."
              </p>
            </div>

            <FunnelStep num="01" label="You sign up" tagColor="green"
              title="One tap with Google — straight into your garden"
              desc="No email confirmation. No waiting. Google sign-in creates your account and opens your personalised dashboard in under 10 seconds."
              tag="⚡ No 'check your inbox' step" />

            <FunnelStep num="02" label="2 minutes" tagColor="green"
              title="Add your first crop"
              desc="Tell Vercro what you're growing, your postcode and roughly where it's at. Takes about 2 minutes. Vercro does the rest."
              tag="🌱 Works for any UK vegetable, herb or fruit" />

            <FunnelStep num="03" label="Immediately" tagColor="bright"
              title="See your personalised task list"
              desc="Your daily plan appears instantly — specific to your crops, your soil temperature and today's weather forecast. This is the moment it clicks."
              tag="✅ First task visible before you close the app" />

            <FunnelStep num="04" label="Day 2 onwards" tagColor="bright"
              title="8am nudge — open, tick, done"
              desc="A daily notification reminds you. You open the app, see exactly what to do, tick it off. Two minutes. Back to your day. Garden stays on track."
              tag="🔔 The habit that keeps you growing" isLast />

            <div style={{ background: "rgba(111,175,99,0.08)", border: "1px solid rgba(111,175,99,0.2)", borderRadius: 16, padding: 20, marginTop: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.leaf, marginBottom: 14 }}>Why this beats every other gardening app</div>
              {[
                { icon: "🇬🇧", text: "Built for UK seasons, not California sunshine" },
                { icon: "📍", text: "Your postcode = your actual local weather and frost dates" },
                { icon: "🧑‍🌾", text: "Built by a real gardener and dad, not a tech company" },
                { icon: "⭐", text: "No paywalls. Everything useful is free." },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < 3 ? 10 : 0, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section style={{ padding: "80px 24px", background: C.offwhite }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.forest, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>Features</div>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.2 }}>
                Not a calendar. A plan.
              </h2>
              <p style={{ fontSize: 15, color: C.leaf, fontWeight: 600, marginTop: 8 }}>Here's what that actually means for you:</p>
            </div>
            <div className="features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {[
                { icon: "🗓️", title: "Daily task engine",      desc: "Personalised tasks every day based on your crops, weather and growing stage." },
                { icon: "📈", title: "Smart crop timelines",   desc: "Sowing → harvest tracked automatically. Always know where each crop is in its journey." },
                { icon: "🌦️", title: "Weather-aware advice",   desc: "Frost alerts, watering reminders and task timing adjusted to your local forecast." },
                { icon: "🤖", title: "AI crop identification", desc: "Not sure what you have? Scan or describe a crop and Vercro fills in all the growing data." },
                { icon: "📸", title: "Growth diary",           desc: "Photo log every crop through its lifecycle. Track progress and spot problems early." },
                { icon: "🌿", title: "Boost your bed",          desc: "Smart suggestions for what to plant together — reduce pests, improve soil, increase yield. Built into your plan automatically." },
                { icon: "🏅", title: "Badges & challenges",    desc: "Monthly growing challenges and badges to keep you motivated through the season." },
                { icon: "📤", title: "Share your garden",      desc: "Generate beautiful cards to share your harvest and garden progress with friends." },
              ].map((f, i) => (
                <div key={i} className="feature-card" style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 20px", boxShadow: "0 2px 12px rgba(47,93,80,0.06)" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 8, lineHeight: 1.3 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: C.stone, lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Human / trust section ── */}
        <section style={{ padding: "80px 24px", background: "#fff" }}>
          <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>🌱</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.3, marginBottom: 20 }}>
              Built by a real gardener and dad — not a tech company
            </h2>
            <p style={{ fontSize: 16, color: C.stone, lineHeight: 1.8, marginBottom: 32, maxWidth: 560, margin: "0 auto 32px" }}>
              Vercro started because I kept forgetting what to do in my own garden. I wanted something that understood real UK growing conditions, real gardens, and real life — not a generic app built for California.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: C.offwhite, border: `1px solid ${C.border}`, borderRadius: 99, padding: "10px 20px" }}>
              <span style={{ fontSize: 13, color: C.forest, fontWeight: 600 }}>— Mark, founder of Vercro · Hartlepool, UK</span>
            </div>
          </div>
        </section>

        {/* ── Final signup section ── */}
        <section style={{ padding: "80px 24px 120px", background: `linear-gradient(160deg, ${C.forest} 0%, ${C.forestDark} 100%)` }}>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 900, color: "#fff", lineHeight: 1.2, marginBottom: 12 }}>
                Your plan starts today.
              </h2>
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
                Your best growing season starts this week. Free forever. Join 1,000+ UK growers already using Vercro.
              </p>
            </div>
            <div style={{ background: "#fff", borderRadius: 20, padding: "32px", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" }}>
              <SignupForm />
            </div>
            <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              Already have an account?{" "}
              <a href="https://app.vercro.com" style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>Log in →</a>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ background: "#0f1f19", color: "rgba(255,255,255,0.5)", padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Vercro 🌱</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
            <a href="/privacy"                          style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: 13 }}>Privacy policy</a>
            <a href="mailto:hello@vercro.com"           style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: 13 }}>hello@vercro.com</a>
            <a href="https://instagram.com/vercro.app"  style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: 13 }}>Instagram</a>
          </div>
          <div style={{ fontSize: 12 }}>© {new Date().getFullYear()} Vercro. Built for UK growers.</div>
        </footer>

      </div>
    </>
  );
}