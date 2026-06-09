import { useState, useEffect, useRef } from "react";

const MOCK_TRACKS = [
  { id: 1, title: "Comptine d'un autre été", artist: "Yann Tiersen", album: "Amélie OST", duration: "2:21", cover: "🎹", genre: "Neoclassical" },
  { id: 2, title: "Experience", artist: "Ludovico Einaudi", album: "In a Time Lapse", duration: "5:13", cover: "🎼", genre: "Neoclassical" },
  { id: 3, title: "Intro", artist: "The xx", album: "xx", duration: "2:07", cover: "🌙", genre: "Indie" },
  { id: 4, title: "Re: Stacks", artist: "Bon Iver", album: "For Emma", duration: "4:47", cover: "🌲", genre: "Indie Folk" },
  { id: 5, title: "Motion Picture Soundtrack", artist: "Radiohead", album: "Kid A", duration: "7:02", cover: "📻", genre: "Art Rock" },
  { id: 6, title: "Everything In Its Right Place", artist: "Radiohead", album: "Kid A", duration: "4:11", cover: "🔮", genre: "Art Rock" },
];

const SESSIONS = [
  { id: 1, date: "Today, 2:14pm", track: MOCK_TRACKS[1], duration: "47 min", rating: "deep-flow", ratingLabel: "Deep flow" },
  { id: 2, date: "Today, 10:30am", track: MOCK_TRACKS[0], duration: "23 min", rating: "focused", ratingLabel: "Focused" },
  { id: 3, date: "Yesterday, 8:00pm", track: MOCK_TRACKS[2], duration: "1h 12 min", rating: "okay", ratingLabel: "Okay" },
  { id: 4, date: "Yesterday, 3:45pm", track: MOCK_TRACKS[3], duration: "34 min", rating: "deep-flow", ratingLabel: "Deep flow" },
  { id: 5, date: "Mon, 11:20am", track: MOCK_TRACKS[4], duration: "55 min", rating: "distracted", ratingLabel: "Distracted" },
  { id: 6, date: "Mon, 9:00am", track: MOCK_TRACKS[5], duration: "28 min", rating: "focused", ratingLabel: "Focused" },
];

// Warm minimal palette: cream base, terracotta + sage + dusty blue accents
const C = {
  bg:       "#f7f3ee",      // warm cream
  surface:  "#ede8e1",      // slightly darker cream for cards
  border:   "#ddd6cc",      // warm grey border
  borderSoft: "#e8e2da",
  text:     "#2c2520",      // dark warm brown
  textMid:  "#7a6e65",      // mid warm grey
  textSoft: "#a89f96",      // soft warm grey
  accent:   "#b5654a",      // terracotta — primary accent
  accentBg: "#f0e0d9",      // terracotta tint
  sage:     "#6b8f71",      // sage green — flow/positive
  sageBg:   "#deeadf",
  blue:     "#5d7fa3",      // dusty blue — focused
  blueBg:   "#dce7f2",
  amber:    "#b58a3a",      // muted amber — okay
  amberBg:  "#f0e6d0",
  rose:     "#c05c5c",      // muted rose — distracted
  roseBg:   "#f2dcdc",
};

const RATING_CONFIG = {
  "distracted": { label: "Distracted", color: C.rose,  bg: C.roseBg,  icon: "◌" },
  "okay":       { label: "Okay",       color: C.amber, bg: C.amberBg, icon: "◐" },
  "focused":    { label: "Focused",    color: C.blue,  bg: C.blueBg,  icon: "◕" },
  "deep-flow":  { label: "Deep flow",  color: C.sage,  bg: C.sageBg,  icon: "●" },
};

const INSIGHTS = [
  { label: "Best genre for focus", value: "Neoclassical", sub: "4× more flow sessions", icon: "★" },
  { label: "Peak focus window",    value: "9 – 11am",     sub: "avg. 58 min sessions",  icon: "◷" },
  { label: "Flow rate this week",  value: "68%",          sub: "↑ 12% from last week",  icon: "◈" },
  { label: "Longest streak",       value: "3 days",       sub: "Mon – Wed focused",      icon: "⬡" },
];

const font = "'Lora', Georgia, serif";
const fontSans = "'DM Sans', 'Helvetica Neue', sans-serif";

export default function FlowOS() {
  const [screen, setScreen]           = useState("connect");
  const [connected, setConnected]     = useState(null);
  const [activeTab, setTab]           = useState("sessions");
  const [sessionActive, setSession]   = useState(false);
  const [currentTrack, setTrack]      = useState(MOCK_TRACKS[1]);
  const [elapsed, setElapsed]         = useState(0);
  const [showCheckin, setCheckin]     = useState(false);
  const [checkinRating, setRating]    = useState(null);
  const [sessions, setSessions]       = useState(SESSIONS);
  const [justSaved, setJustSaved]     = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (sessionActive) timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [sessionActive]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const endSession = () => { setSession(false); setCheckin(true); };

  const submitRating = () => {
    setSessions([{ id: sessions.length + 1, date: "Just now", track: currentTrack, duration: fmt(elapsed), rating: checkinRating, ratingLabel: RATING_CONFIG[checkinRating]?.label }, ...sessions]);
    setJustSaved(true);
    setTimeout(() => { setCheckin(false); setRating(null); setElapsed(0); setJustSaved(false); setScreen("home"); setTab("sessions"); }, 1300);
  };

  // ── CONNECT ──────────────────────────────────────────────────────────────
  if (screen === "connect") return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: fontSans }}>
      <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ marginBottom: 6, fontSize: 10, letterSpacing: 4, color: C.accent, textTransform: "uppercase", fontWeight: 600 }}>flowOS</div>
        <h1 style={{ fontFamily: font, fontSize: 38, fontWeight: 700, lineHeight: 1.15, margin: "0 0 14px", color: C.text, letterSpacing: -0.5 }}>
          Music as a<br /><em style={{ fontStyle: "italic", color: C.accent }}>cognitive tool.</em>
        </h1>
        <p style={{ color: C.textMid, fontSize: 14, lineHeight: 1.7, margin: "0 0 40px" }}>
          Track how music shapes your focus — no journaling, no forms. Just a feeling.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[{ name: "Spotify", color: "#2d9e52", icon: "♫" }, { name: "Apple Music", color: C.rose, icon: "♪" }].map(s => (
            <button key={s.name} onClick={() => { setConnected(s.name); setScreen("home"); }}
              style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", color: C.text, fontFamily: fontSans, transition: "box-shadow 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, background: s.color + "18", border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: s.color }}>{s.icon}</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Connect {s.name}</div>
                <div style={{ color: C.textSoft, fontSize: 12, marginTop: 1 }}>Sync your listening history</div>
              </div>
              <div style={{ marginLeft: "auto", color: C.textSoft, fontSize: 16 }}>→</div>
            </button>
          ))}
        </div>
        <button onClick={() => { setConnected("Demo"); setScreen("home"); }}
          style={{ background: "none", border: "none", color: C.textSoft, fontSize: 12, marginTop: 20, cursor: "pointer", display: "block", margin: "20px auto 0", fontFamily: fontSans }}>
          Continue with demo data
        </button>
      </div>
    </div>
  );

  // ── CHECK-IN ─────────────────────────────────────────────────────────────
  if (showCheckin) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: fontSans }}>
      <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 360 }}>
        {justSaved ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.sageBg, border: `1px solid ${C.sage}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 22, color: C.sage }}>✓</div>
            <div style={{ fontFamily: font, fontSize: 24, fontWeight: 700, color: C.text }}>Session saved.</div>
            <div style={{ color: C.textMid, marginTop: 8, fontSize: 14 }}>Nice one.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10, letterSpacing: 4, color: C.accent, textTransform: "uppercase", fontWeight: 600, marginBottom: 20 }}>Quick check-in</div>
            <div style={{ fontSize: 13, color: C.textMid, marginBottom: 6 }}>{currentTrack.title} · {currentTrack.artist}</div>
            <h2 style={{ fontFamily: font, fontSize: 26, fontWeight: 700, margin: "0 0 28px", color: C.text, lineHeight: 1.3 }}>How was that session?</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
              {Object.entries(RATING_CONFIG).map(([key, cfg]) => (
                <button key={key} onClick={() => setRating(key)}
                  style={{ background: checkinRating === key ? cfg.bg : "#fff", border: `1px solid ${checkinRating === key ? cfg.color + "60" : C.border}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", color: checkinRating === key ? cfg.color : C.text, fontFamily: fontSans, transition: "all 0.15s", boxShadow: checkinRating === key ? "none" : "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{cfg.label}</span>
                </button>
              ))}
            </div>
            <button onClick={submitRating} disabled={!checkinRating}
              style={{ width: "100%", background: checkinRating ? C.accent : C.surface, border: `1px solid ${checkinRating ? C.accent : C.border}`, borderRadius: 12, padding: "15px", color: checkinRating ? "#fff" : C.textSoft, fontSize: 14, fontWeight: 600, cursor: checkinRating ? "pointer" : "not-allowed", fontFamily: fontSans, transition: "all 0.2s" }}>
              Save session →
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ── HOME ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: fontSans, color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 420, margin: "0 auto", paddingBottom: 48 }}>

        {/* Header */}
        <div style={{ padding: "32px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 4, color: C.accent, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>flowOS</div>
            <div style={{ fontSize: 12, color: C.textSoft }}>
              {connected} · <span style={{ color: C.sage }}>● live</span>
            </div>
          </div>
          <button style={{ width: 34, height: 34, borderRadius: 9, background: "#fff", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, cursor: "pointer", color: C.textMid, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>⚙</button>
        </div>

        {/* Now Playing */}
        <div style={{ margin: "22px 24px 0", padding: "22px", borderRadius: 18, background: "#fff", border: `1px solid ${C.border}`, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: sessionActive ? C.sage : C.textSoft, textTransform: "uppercase", fontWeight: 600, marginBottom: 16 }}>
            {sessionActive ? "● Now tracking" : "Ready to track"}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 20 }}>
            <div style={{ width: 50, height: 50, borderRadius: 12, background: C.accentBg, border: `1px solid ${C.accent}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              {currentTrack.cover}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: font, fontWeight: 600, fontSize: 16, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentTrack.title}</div>
              <div style={{ color: C.textMid, fontSize: 12, marginTop: 3 }}>{currentTrack.artist}</div>
              <div style={{ color: C.textSoft, fontSize: 11, marginTop: 1 }}>{currentTrack.genre}</div>
            </div>
            {sessionActive && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 700, color: C.accent, fontFamily: font }}>{fmt(elapsed)}</div>
                <div style={{ color: C.textSoft, fontSize: 10, marginTop: 2 }}>tracking</div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!sessionActive ? (
              <button onClick={() => setSession(true)}
                style={{ flex: 1, background: C.accent, border: "none", borderRadius: 11, padding: "13px", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: fontSans, letterSpacing: 0.2 }}>
                Start session
              </button>
            ) : (
              <button onClick={endSession}
                style={{ flex: 1, background: C.roseBg, border: `1px solid ${C.rose}40`, borderRadius: 11, padding: "13px", color: C.rose, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: fontSans }}>
                End + check-in
              </button>
            )}
            <button onClick={() => { const i = MOCK_TRACKS.indexOf(currentTrack); setTrack(MOCK_TRACKS[(i + 1) % MOCK_TRACKS.length]); }}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: "13px 15px", color: C.textMid, fontSize: 16, cursor: "pointer" }}>
              ⇄
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, margin: "22px 24px 0", background: C.surface, borderRadius: 13, padding: 4, border: `1px solid ${C.borderSoft}` }}>
          {["sessions", "insights"].map(tab => (
            <button key={tab} onClick={() => setTab(tab)}
              style={{ flex: 1, background: activeTab === tab ? "#fff" : "none", border: `1px solid ${activeTab === tab ? C.border : "transparent"}`, borderRadius: 10, padding: "10px", color: activeTab === tab ? C.text : C.textMid, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: fontSans, transition: "all 0.15s", textTransform: "capitalize", boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.07)" : "none" }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Sessions Tab */}
        {activeTab === "sessions" && (
          <div style={{ padding: "20px 24px 0" }}>
            <div style={{ color: C.textSoft, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600, marginBottom: 14 }}>Recent sessions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {sessions.map(s => {
                const cfg = RATING_CONFIG[s.rating];
                return (
                  <div key={s.id} style={{ background: "#fff", border: `1px solid ${C.borderSoft}`, borderRadius: 13, padding: "13px 15px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize: 20 }}>{s.track.cover}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: font, fontWeight: 600, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.track.title}</div>
                      <div style={{ color: C.textSoft, fontSize: 11, marginTop: 2 }}>{s.date} · {s.duration}</div>
                    </div>
                    <div style={{ padding: "4px 10px", borderRadius: 7, background: cfg?.bg, color: cfg?.color, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
                      {cfg?.icon} {s.ratingLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === "insights" && (
          <div style={{ padding: "20px 24px 0" }}>
            <div style={{ color: C.textSoft, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", fontWeight: 600, marginBottom: 14 }}>This week</div>

            {/* Flow distribution */}
            <div style={{ background: "#fff", border: `1px solid ${C.borderSoft}`, borderRadius: 16, padding: "18px 20px", marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.textMid, fontWeight: 500 }}>Flow distribution</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>14 sessions</div>
              </div>
              {Object.entries(RATING_CONFIG).map(([key, cfg]) => {
                const pct = { "deep-flow": 35, focused: 33, okay: 20, distracted: 12 }[key];
                return (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <div style={{ fontSize: 12, color: C.textMid }}>{cfg.icon} {cfg.label}</div>
                      <div style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{pct}%</div>
                    </div>
                    <div style={{ height: 5, background: C.surface, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: cfg.color, borderRadius: 3, opacity: 0.75 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {INSIGHTS.map((ins, i) => (
                <div key={i} style={{ background: "#fff", border: `1px solid ${C.borderSoft}`, borderRadius: 14, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: 18, marginBottom: 10, color: C.accent }}>{ins.icon}</div>
                  <div style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>{ins.value}</div>
                  <div style={{ color: C.textSoft, fontSize: 11, marginTop: 4 }}>{ins.label}</div>
                  <div style={{ color: C.sage, fontSize: 11, marginTop: 5, fontWeight: 600 }}>{ins.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
