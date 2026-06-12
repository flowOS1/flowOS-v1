import { useState, useEffect, useRef } from "react";

const CLIENT_ID = "fc1007724c2d4c7e8e174e501c180542";
const REDIRECT_URI = "https://flow-os-v1.vercel.app";
const SCOPES = ["user-read-currently-playing","user-read-recently-played","user-read-playback-state"].join(" ");

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function loginWithSpotify() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem("pkce_verifier", verifier);
  const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI, scope: SCOPES, code_challenge_method: "S256", code_challenge: challenge });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}
async function exchangeToken(code) {
  const verifier = localStorage.getItem("pkce_verifier");
  const res = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier }) });
  const data = await res.json();
  if (data.access_token) { localStorage.setItem("spotify_token", data.access_token); localStorage.setItem("spotify_refresh", data.refresh_token); localStorage.setItem("spotify_expiry", Date.now() + data.expires_in * 1000); }
  return data;
}
async function refreshToken() {
  const refresh = localStorage.getItem("spotify_refresh");
  if (!refresh) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: refresh }) });
  const data = await res.json();
  if (data.access_token) { localStorage.setItem("spotify_token", data.access_token); localStorage.setItem("spotify_expiry", Date.now() + data.expires_in * 1000); }
  return data.access_token;
}
async function getToken() {
  const expiry = parseInt(localStorage.getItem("spotify_expiry") || "0");
  if (Date.now() > expiry - 60000) return await refreshToken();
  return localStorage.getItem("spotify_token");
}
async function spotifyFetch(endpoint) {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json();
}

// Simple in-memory cache so we don't refetch genre for the same artist repeatedly
const genreCache = {};
async function getGenreForArtist(artistId) {
  if (!artistId) return "";
  if (genreCache[artistId]) return genreCache[artistId];
  const data = await spotifyFetch(`/artists/${artistId}`);
  const genre = data?.genres?.[0] || "";
  genreCache[artistId] = genre;
  return genre;
}
function formatGenre(genre) {
  if (!genre) return "";
  return genre.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const C = {
  bg:"#f7f3ee", surface:"#ede8e1", border:"#ddd6cc", borderSoft:"#e8e2da",
  text:"#2c2520", textMid:"#7a6e65", textSoft:"#a89f96",
  accent:"#b5654a", accentBg:"#f0e0d9",
  sage:"#6b8f71", sageBg:"#deeadf",
  blue:"#5d7fa3", blueBg:"#dce7f2",
  amber:"#b58a3a", amberBg:"#f0e6d0",
  rose:"#c05c5c", roseBg:"#f2dcdc",
};

const RATING_CONFIG = {
  "distracted": { label:"Distracted", color:C.rose,  bg:C.roseBg,  icon:"◌" },
  "okay":       { label:"Okay",       color:C.amber, bg:C.amberBg, icon:"◐" },
  "focused":    { label:"Focused",    color:C.blue,  bg:C.blueBg,  icon:"◕" },
  "deep-flow":  { label:"Deep flow",  color:C.sage,  bg:C.sageBg,  icon:"●" },
};

// Curated starter insights shown before user has personal data
const STARTER_INSIGHTS = [
  { icon:"🎹", heading:"Instrumental music", body:"Research shows instrumental tracks — classical, jazz, lo-fi — reduce cognitive load during deep work compared to music with lyrics." },
  { icon:"⏱", heading:"The 52/17 pattern", body:"High performers average 52 minutes of focus followed by a 17-minute break. flowOS will learn your natural rhythm." },
  { icon:"🔁", heading:"Familiarity matters", body:"Familiar music is less distracting than new music. Your brain stops processing it as stimuli and it becomes background texture." },
  { icon:"🌅", heading:"Morning vs evening", body:"Most people hit cognitive peak 2–4 hours after waking. flowOS will map when your music + focus alignment is strongest." },
];

const font = "'Lora', Georgia, serif";
const fontSans = "'DM Sans', 'Helvetica Neue', sans-serif";
const EMPTY_TRACK = { title:"Nothing playing", artist:"Open Spotify and play something", cover:null, genre:"" };

// Persist sessions in localStorage
function loadSessions() {
  try { return JSON.parse(localStorage.getItem("flowos_sessions") || "[]"); } catch { return []; }
}
function saveSessions(sessions) {
  try { localStorage.setItem("flowos_sessions", JSON.stringify(sessions)); } catch {}
}

export default function FlowOS() {
  const [screen, setScreen]         = useState("loading");
  const [activeTab, setTab]         = useState("sessions");
  const [sessionActive, setSession] = useState(false);
  const [currentTrack, setTrack]    = useState(EMPTY_TRACK);
  const [elapsed, setElapsed]       = useState(0);
  const [showCheckin, setCheckin]   = useState(false);
  const [checkinRating, setRating]  = useState(null);
  const [sessions, setSessions]     = useState([]);
  const [justSaved, setJustSaved]   = useState(false);
  const [userProfile, setProfile]   = useState(null);
  const [onboarded, setOnboarded]   = useState(false);
  const [copied, setCopied]         = useState(false);
  const timerRef = useRef(null);
  const pollRef  = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      window.history.replaceState({}, "", "/");
      exchangeToken(code).then(data => { if (data.access_token) initApp(); else setScreen("connect"); });
    } else if (localStorage.getItem("spotify_token")) {
      initApp();
    } else {
      setScreen("connect");
    }
  }, []);

  async function initApp() {
    const profile = await spotifyFetch("/me");
    if (profile) {
      setProfile(profile);
      const saved = loadSessions();
      setSessions(saved);
      const hasOnboarded = localStorage.getItem("flowos_onboarded");
      if (!hasOnboarded) { setScreen("onboarding"); }
      else { setScreen("home"); pollTrack(); }
    } else {
      localStorage.clear(); setScreen("connect");
    }
  }

  function completeOnboarding() {
    localStorage.setItem("flowos_onboarded", "1");
    setOnboarded(true);
    setScreen("home");
    pollTrack();
  }

  async function pollTrack() {
    const fetch = async () => {
      const data = await spotifyFetch("/me/player/currently-playing");
      if (data && data.item) {
        const artistId = data.item.artists?.[0]?.id;
        const cover = data.item.album.images[1]?.url || data.item.album.images[0]?.url;
        const title = data.item.name;
        const artist = data.item.artists.map(a => a.name).join(", ");
        const uri = data.item.uri;
        // Set track immediately with placeholder genre, then update once fetched
        setTrack(prev => ({ title, artist, cover, genre: prev.uri === uri ? prev.genre : "", uri }));
        const genre = await getGenreForArtist(artistId);
        setTrack(prev => prev.uri === uri ? { ...prev, genre: formatGenre(genre) } : prev);
      } else { setTrack(EMPTY_TRACK); }
    };
    fetch();
    pollRef.current = setInterval(fetch, 5000);
  }

  useEffect(() => () => { clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (sessionActive) timerRef.current = setInterval(() => setElapsed(e => e+1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [sessionActive]);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const endSession = () => { setSession(false); setCheckin(true); };

  const submitRating = () => {
    const newSession = { id:Date.now(), date:"Just now", track:currentTrack, duration:fmt(elapsed), rating:checkinRating, ratingLabel:RATING_CONFIG[checkinRating]?.label };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    setJustSaved(true);
    setTimeout(() => { setCheckin(false); setRating(null); setElapsed(0); setJustSaved(false); setTab("sessions"); }, 1300);
  };

  const logout = () => { localStorage.clear(); setScreen("connect"); clearInterval(pollRef.current); };

  const GF = { minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:fontSans };
  const FONTS = <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />;

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (screen === "loading") return (
    <div style={GF}>{FONTS}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:10, letterSpacing:4, color:C.accent, textTransform:"uppercase", fontWeight:600, marginBottom:12 }}>flowOS</div>
        <div style={{ color:C.textSoft, fontSize:13 }}>Connecting…</div>
      </div>
    </div>
  );

  // ── CONNECT ───────────────────────────────────────────────────────────────
  if (screen === "connect") return (
    <div style={GF}>{FONTS}
      <div style={{ width:"100%", maxWidth:380 }}>
        <div style={{ marginBottom:6, fontSize:10, letterSpacing:4, color:C.accent, textTransform:"uppercase", fontWeight:600 }}>flowOS</div>
        <h1 style={{ fontFamily:font, fontSize:38, fontWeight:700, lineHeight:1.15, margin:"0 0 14px", color:C.text, letterSpacing:-0.5 }}>
          Music as a<br /><em style={{ fontStyle:"italic", color:C.accent }}>cognitive tool.</em>
        </h1>
        <p style={{ color:C.textMid, fontSize:14, lineHeight:1.7, margin:"0 0 40px" }}>
          Track how music shapes your focus — no journaling, no forms. Just a feeling.
        </p>
        <button onClick={loginWithSpotify}
          style={{ width:"100%", background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 20px", display:"flex", alignItems:"center", gap:14, cursor:"pointer", color:C.text, fontFamily:fontSans, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}
          onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.10)"}
          onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.06)"}
        >
          <div style={{ width:38, height:38, borderRadius:10, background:"#2d9e5218", border:"1px solid #2d9e5230", display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, color:"#2d9e52" }}>♫</div>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontWeight:600, fontSize:14 }}>Connect Spotify</div>
            <div style={{ color:C.textSoft, fontSize:12, marginTop:1 }}>Sync your listening history</div>
          </div>
          <div style={{ marginLeft:"auto", color:C.textSoft, fontSize:16 }}>→</div>
        </button>
      </div>
    </div>
  );

  // ── ONBOARDING ────────────────────────────────────────────────────────────
  if (screen === "onboarding") return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:fontSans, color:C.text }}>{FONTS}
      <div style={{ maxWidth:420, margin:"0 auto", padding:"48px 24px 48px" }}>
        <div style={{ fontSize:10, letterSpacing:4, color:C.accent, textTransform:"uppercase", fontWeight:600, marginBottom:20 }}>flowOS</div>
        <h1 style={{ fontFamily:font, fontSize:30, fontWeight:700, lineHeight:1.2, margin:"0 0 8px", color:C.text }}>
          Hey {userProfile?.display_name?.split(" ")[0]} 👋
        </h1>
        <p style={{ color:C.textMid, fontSize:15, lineHeight:1.7, margin:"0 0 28px" }}>
          In a couple weeks, flowOS will be able to tell you things like <em style={{ fontStyle:"italic", color:C.text }}>"you hit deep flow 3× more often with instrumental music after 9am"</em> — based entirely on your own listening.
        </p>

        <div style={{ background:C.accentBg, border:`1px solid ${C.accent}30`, borderRadius:14, padding:"16px 18px", marginBottom:28 }}>
          <div style={{ fontFamily:font, fontWeight:600, fontSize:14, color:C.accent, marginBottom:4 }}>How it works</div>
          <div style={{ color:C.textMid, fontSize:13, lineHeight:1.7 }}>
            Play music → hit Start session → work → hit End + check-in → rate how it felt. 10 seconds per session. flowOS does the rest.
          </div>
        </div>

        <div style={{ fontSize:10, letterSpacing:3, color:C.textSoft, textTransform:"uppercase", fontWeight:600, marginBottom:12 }}>
          While your data builds, here's what the research already says
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 }}>
          {STARTER_INSIGHTS.map((ins, i) => (
            <div key={i} style={{ background:"#fff", border:`1px solid ${C.borderSoft}`, borderRadius:14, padding:"16px 18px", display:"flex", gap:14, alignItems:"flex-start", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize:22, flexShrink:0, marginTop:1 }}>{ins.icon}</div>
              <div>
                <div style={{ fontFamily:font, fontWeight:600, fontSize:14, color:C.text, marginBottom:4 }}>{ins.heading}</div>
                <div style={{ color:C.textMid, fontSize:13, lineHeight:1.6 }}>{ins.body}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={completeOnboarding}
          style={{ width:"100%", background:C.accent, border:"none", borderRadius:13, padding:"16px", color:"#fff", fontWeight:600, fontSize:15, cursor:"pointer", fontFamily:fontSans, letterSpacing:0.2, marginBottom:16 }}>
          Start tracking →
        </button>

        <div style={{ textAlign:"center" }}>
          <a href="https://forms.gle/REPLACE_WITH_YOUR_FORM_LINK" target="_blank" rel="noopener noreferrer"
            style={{ fontSize:12, color:C.textSoft, textDecoration:"underline" }}>
            Something broken or confusing? Tell us →
          </a>
        </div>
      </div>
    </div>
  );

  // ── CHECK-IN ──────────────────────────────────────────────────────────────
  if (showCheckin) return (
    <div style={GF}>{FONTS}
      <div style={{ width:"100%", maxWidth:360 }}>
        {justSaved ? (
          <div style={{ textAlign:"center" }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:C.sageBg, border:`1px solid ${C.sage}40`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", fontSize:22, color:C.sage }}>✓</div>
            <div style={{ fontFamily:font, fontSize:24, fontWeight:700, color:C.text }}>Session saved.</div>
            <div style={{ color:C.textMid, marginTop:8, fontSize:14 }}>Nice one.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize:10, letterSpacing:4, color:C.accent, textTransform:"uppercase", fontWeight:600, marginBottom:20 }}>Quick check-in</div>
            <div style={{ fontSize:13, color:C.textMid, marginBottom:6 }}>{currentTrack.title} · {currentTrack.artist}</div>
            <h2 style={{ fontFamily:font, fontSize:26, fontWeight:700, margin:"0 0 28px", color:C.text, lineHeight:1.3 }}>How was that session?</h2>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:28 }}>
              {Object.entries(RATING_CONFIG).map(([key,cfg]) => (
                <button key={key} onClick={() => setRating(key)}
                  style={{ background:checkinRating===key?cfg.bg:"#fff", border:`1px solid ${checkinRating===key?cfg.color+"60":C.border}`, borderRadius:12, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", color:checkinRating===key?cfg.color:C.text, fontFamily:fontSans, transition:"all 0.15s" }}>
                  <span style={{ fontSize:18 }}>{cfg.icon}</span>
                  <span style={{ fontWeight:600, fontSize:15 }}>{cfg.label}</span>
                </button>
              ))}
            </div>
            <button onClick={submitRating} disabled={!checkinRating}
              style={{ width:"100%", background:checkinRating?C.accent:C.surface, border:`1px solid ${checkinRating?C.accent:C.border}`, borderRadius:12, padding:"15px", color:checkinRating?"#fff":C.textSoft, fontSize:14, fontWeight:600, cursor:checkinRating?"pointer":"not-allowed", fontFamily:fontSans, transition:"all 0.2s" }}>
              Save session →
            </button>
          </>
        )}
      </div>
    </div>
  );

  // ── HOME ──────────────────────────────────────────────────────────────────
  const flowSessions   = sessions.filter(s => s.rating === "deep-flow" || s.rating === "focused");
  const flowRate       = sessions.length ? Math.round((flowSessions.length / sessions.length) * 100) : null;

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:fontSans, color:C.text }}>{FONTS}
      <div style={{ maxWidth:420, margin:"0 auto", paddingBottom:48 }}>

        {/* Header */}
        <div style={{ padding:"32px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:4, color:C.accent, textTransform:"uppercase", fontWeight:600, marginBottom:4 }}>flowOS</div>
            <div style={{ fontSize:12, color:C.textSoft }}>
              {userProfile?.display_name} · <span style={{ color:C.sage }}>● live</span>
            </div>
          </div>
          <button onClick={logout} style={{ fontSize:11, color:C.textSoft, background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", cursor:"pointer", fontFamily:fontSans }}>
            Log out
          </button>
        </div>

        {/* Flow rate banner — only shows once user has 3+ sessions */}
        {sessions.length >= 3 && flowRate !== null && (
          <div style={{ margin:"18px 24px 0", padding:"14px 18px", borderRadius:14, background:flowRate >= 60 ? C.sageBg : C.accentBg, border:`1px solid ${flowRate >= 60 ? C.sage+"40" : C.accent+"40"}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11, color:flowRate>=60?C.sage:C.accent, fontWeight:600, marginBottom:2 }}>Your flow rate</div>
              <div style={{ fontSize:13, color:C.textMid }}>Based on {sessions.length} sessions</div>
            </div>
            <div style={{ fontFamily:font, fontSize:28, fontWeight:700, color:flowRate>=60?C.sage:C.accent }}>{flowRate}%</div>
          </div>
        )}

        {/* Now Playing */}
        <div style={{ margin:"18px 24px 0", padding:"22px", borderRadius:18, background:"#fff", border:`1px solid ${C.border}`, boxShadow:"0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize:10, letterSpacing:3, color:sessionActive?C.sage:C.textSoft, textTransform:"uppercase", fontWeight:600, marginBottom:16 }}>
            {sessionActive ? "● Now tracking" : "Ready to track"}
          </div>
          <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:20 }}>
            {currentTrack.cover
              ? <img src={currentTrack.cover} style={{ width:50, height:50, borderRadius:10, objectFit:"cover" }} alt="" />
              : <div style={{ width:50, height:50, borderRadius:10, background:C.accentBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🎵</div>
            }
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:font, fontWeight:600, fontSize:16, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{currentTrack.title}</div>
              <div style={{ color:C.textMid, fontSize:12, marginTop:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{currentTrack.artist}</div>
              <div style={{ color:C.textSoft, fontSize:11, marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{currentTrack.genre}</div>
            </div>
            {sessionActive && (
              <div style={{ textAlign:"right" }}>
                <div style={{ fontVariantNumeric:"tabular-nums", fontSize:22, fontWeight:700, color:C.accent, fontFamily:font }}>{fmt(elapsed)}</div>
                <div style={{ color:C.textSoft, fontSize:10, marginTop:2 }}>tracking</div>
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {!sessionActive ? (
              <button onClick={() => setSession(true)}
                style={{ flex:1, background:C.accent, border:"none", borderRadius:11, padding:"13px", color:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:fontSans }}>
                Start session
              </button>
            ) : (
              <button onClick={endSession}
                style={{ flex:1, background:C.roseBg, border:`1px solid ${C.rose}40`, borderRadius:11, padding:"13px", color:C.rose, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:fontSans }}>
                End + check-in
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", margin:"22px 24px 0", background:C.surface, borderRadius:13, padding:4, border:`1px solid ${C.borderSoft}` }}>
          {["sessions","insights","recap"].map(tab => (
            <button key={tab} onClick={() => setTab(tab)}
              style={{ flex:1, background:activeTab===tab?"#fff":"none", border:`1px solid ${activeTab===tab?C.border:"transparent"}`, borderRadius:10, padding:"10px", color:activeTab===tab?C.text:C.textMid, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:fontSans, transition:"all 0.15s", textTransform:"capitalize", boxShadow:activeTab===tab?"0 1px 4px rgba(0,0,0,0.07)":"none" }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Sessions */}
        {activeTab === "sessions" && (
          <div style={{ padding:"20px 24px 0" }}>
            <div style={{ color:C.textSoft, fontSize:10, letterSpacing:3, textTransform:"uppercase", fontWeight:600, marginBottom:14 }}>Recent sessions</div>
            {sessions.length === 0 ? (
              <div style={{ background:"#fff", border:`1px solid ${C.borderSoft}`, borderRadius:16, padding:"28px 20px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ fontFamily:font, fontSize:17, fontWeight:600, color:C.text, marginBottom:8 }}>Your first session is waiting.</div>
                <div style={{ color:C.textMid, fontSize:13, lineHeight:1.7, marginBottom:20 }}>
                  Play something on Spotify, hit Start session, then rate how it felt when you're done. That's the whole loop.
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[["1", "Open Spotify and play music"],["2", "Hit Start session above"],["3", "Work or study"],["4", "End + check-in to rate your focus"]].map(([n, step]) => (
                    <div key={n} style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:C.accentBg, border:`1px solid ${C.accent}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:C.accent, flexShrink:0 }}>{n}</div>
                      <div style={{ fontSize:13, color:C.textMid }}>{step}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {sessions.map(s => {
                  const cfg = RATING_CONFIG[s.rating];
                  return (
                    <div key={s.id} style={{ background:"#fff", border:`1px solid ${C.borderSoft}`, borderRadius:13, padding:"13px 15px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                      {s.track.cover
                        ? <img src={s.track.cover} style={{ width:36, height:36, borderRadius:8, objectFit:"cover", flexShrink:0 }} alt="" />
                        : <div style={{ fontSize:20, flexShrink:0 }}>🎵</div>
                      }
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:font, fontWeight:600, fontSize:14, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.track.title}</div>
                        <div style={{ color:C.textSoft, fontSize:11, marginTop:2 }}>{s.date} · {s.duration}</div>
                      </div>
                      <div style={{ padding:"4px 10px", borderRadius:7, background:cfg?.bg, color:cfg?.color, fontSize:11, fontWeight:600, whiteSpace:"nowrap", flexShrink:0 }}>
                        {cfg?.icon} {s.ratingLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Insights */}
        {activeTab === "insights" && (
          <div style={{ padding:"20px 24px 0" }}>
            {sessions.length < 5 ? (
              // Pre-data insights — shown until user has 5 sessions
              <>
                <div style={{ color:C.textSoft, fontSize:10, letterSpacing:3, textTransform:"uppercase", fontWeight:600, marginBottom:14 }}>While you build your data</div>
                <div style={{ background:C.accentBg, border:`1px solid ${C.accent}30`, borderRadius:14, padding:"16px 18px", marginBottom:12 }}>
                  <div style={{ fontFamily:font, fontWeight:600, fontSize:14, color:C.accent, marginBottom:4 }}>
                    {sessions.length === 0 ? "Log your first session to get started" : `${5 - sessions.length} more session${5 - sessions.length === 1 ? "" : "s"} to unlock your personal insights`}
                  </div>
                  <div style={{ color:C.textMid, fontSize:13, lineHeight:1.6 }}>
                    Your personal insights unlock after 5 sessions. Until then, here's what the research says about music and focus.
                  </div>
                  {sessions.length > 0 && (
                    <div style={{ marginTop:12, height:4, background:`${C.accent}20`, borderRadius:2 }}>
                      <div style={{ height:"100%", width:`${(sessions.length/5)*100}%`, background:C.accent, borderRadius:2, transition:"width 0.4s" }} />
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {STARTER_INSIGHTS.map((ins, i) => (
                    <div key={i} style={{ background:"#fff", border:`1px solid ${C.borderSoft}`, borderRadius:14, padding:"16px 18px", display:"flex", gap:14, alignItems:"flex-start", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                      <div style={{ fontSize:20, flexShrink:0 }}>{ins.icon}</div>
                      <div>
                        <div style={{ fontFamily:font, fontWeight:600, fontSize:13, color:C.text, marginBottom:3 }}>{ins.heading}</div>
                        <div style={{ color:C.textMid, fontSize:12, lineHeight:1.6 }}>{ins.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              // Real insights — shown once user has 5+ sessions
              <>
                <div style={{ color:C.textSoft, fontSize:10, letterSpacing:3, textTransform:"uppercase", fontWeight:600, marginBottom:14 }}>Your patterns</div>
                <div style={{ background:"#fff", border:`1px solid ${C.borderSoft}`, borderRadius:16, padding:"18px 20px", marginBottom:8, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
                    <div style={{ fontSize:13, color:C.textMid, fontWeight:500 }}>Flow distribution</div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>{sessions.length} sessions</div>
                  </div>
                  {Object.entries(RATING_CONFIG).map(([key, cfg]) => {
                    const count = sessions.filter(s => s.rating === key).length;
                    const pct = sessions.length ? Math.round((count / sessions.length) * 100) : 0;
                    return (
                      <div key={key} style={{ marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                          <div style={{ fontSize:12, color:C.textMid }}>{cfg.icon} {cfg.label}</div>
                          <div style={{ fontSize:12, color:cfg.color, fontWeight:600 }}>{pct}%</div>
                        </div>
                        <div style={{ height:5, background:C.surface, borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:cfg.color, borderRadius:3, opacity:0.75 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[
                    { label:"Total sessions", value:sessions.length, sub:"Keep it going", icon:"◈" },
                    { label:"Flow rate", value:`${flowRate}%`, sub:flowRate>=60?"Strong":"Room to grow", icon:"★" },
                    { label:"Best rating", value:RATING_CONFIG[sessions.sort((a,b)=>["distracted","okay","focused","deep-flow"].indexOf(b.rating)-["distracted","okay","focused","deep-flow"].indexOf(a.rating))[0]?.rating]?.label||"—", sub:"Your peak state", icon:"●" },
                    { label:"Sessions saved", value:sessions.filter(s=>s.rating==="deep-flow").length, sub:"Deep flow sessions", icon:"⬡" },
                  ].map((ins, i) => (
                    <div key={i} style={{ background:"#fff", border:`1px solid ${C.borderSoft}`, borderRadius:14, padding:"16px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ fontSize:18, marginBottom:10, color:C.accent }}>{ins.icon}</div>
                      <div style={{ fontFamily:font, fontSize:18, fontWeight:700, color:C.text, lineHeight:1.1 }}>{ins.value}</div>
                      <div style={{ color:C.textSoft, fontSize:11, marginTop:4 }}>{ins.label}</div>
                      <div style={{ color:C.sage, fontSize:11, marginTop:5, fontWeight:600 }}>{ins.sub}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Weekly Recap */}
        {activeTab === "recap" && (
          <div style={{ padding:"20px 24px 0" }}>
            <div style={{ color:C.textSoft, fontSize:10, letterSpacing:3, textTransform:"uppercase", fontWeight:600, marginBottom:14 }}>Weekly recap</div>

            {sessions.length === 0 ? (
              <div style={{ background:"#fff", border:`1px solid ${C.borderSoft}`, borderRadius:16, padding:"28px 20px", textAlign:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize:28, marginBottom:10 }}>📊</div>
                <div style={{ fontFamily:font, fontSize:16, fontWeight:600, color:C.text, marginBottom:6 }}>Nothing to recap yet</div>
                <div style={{ color:C.textMid, fontSize:13, lineHeight:1.6 }}>Log a few sessions and your weekly recap will appear here — ready to share.</div>
              </div>
            ) : (() => {
              const total = sessions.length;
              const flowCount = sessions.filter(s => s.rating === "deep-flow").length;
              const focusedCount = sessions.filter(s => s.rating === "focused").length;
              const totalMinutes = sessions.reduce((acc, s) => {
                const [m, sec] = s.duration.split(":").map(Number);
                return acc + (m || 0) + (sec >= 30 ? 1 : 0);
              }, 0);
              const trackCounts = {};
              sessions.forEach(s => { trackCounts[s.track.title] = (trackCounts[s.track.title] || 0) + 1; });
              const topTrack = Object.entries(trackCounts).sort((a,b) => b[1]-a[1])[0];

              const recapText =
`🎧 My flowOS week

${total} session${total===1?"":"s"} logged
${totalMinutes} min of tracked focus time
${flowCount} deep flow + ${focusedCount} focused sessions
Top track: ${topTrack ? topTrack[0] : "—"}

Tracking how music shapes my focus with flowOS → flow-os-v1.vercel.app`;

              const handleShare = async () => {
                try {
                  await navigator.clipboard.writeText(recapText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              };

              return (
                <>
                  <div style={{ background:"#fff", border:`1px solid ${C.borderSoft}`, borderRadius:18, padding:"24px 22px", boxShadow:"0 2px 12px rgba(0,0,0,0.06)", marginBottom:14 }}>
                    <div style={{ fontSize:11, letterSpacing:3, color:C.accent, textTransform:"uppercase", fontWeight:600, marginBottom:6 }}>🎧 My flowOS week</div>
                    <div style={{ fontFamily:font, fontSize:24, fontWeight:700, color:C.text, marginBottom:18 }}>
                      {total} session{total===1?"":"s"} · {totalMinutes} min
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:18 }}>
                      <div style={{ background:C.sageBg, borderRadius:12, padding:"12px 14px" }}>
                        <div style={{ fontFamily:font, fontSize:20, fontWeight:700, color:C.sage }}>{flowCount}</div>
                        <div style={{ fontSize:11, color:C.textMid, marginTop:2 }}>Deep flow</div>
                      </div>
                      <div style={{ background:C.blueBg, borderRadius:12, padding:"12px 14px" }}>
                        <div style={{ fontFamily:font, fontSize:20, fontWeight:700, color:C.blue }}>{focusedCount}</div>
                        <div style={{ fontSize:11, color:C.textMid, marginTop:2 }}>Focused</div>
                      </div>
                    </div>

                    {topTrack && (
                      <div style={{ borderTop:`1px solid ${C.borderSoft}`, paddingTop:14 }}>
                        <div style={{ fontSize:10, letterSpacing:2, color:C.textSoft, textTransform:"uppercase", fontWeight:600, marginBottom:6 }}>Top track</div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          {sessions.find(s => s.track.title === topTrack[0])?.track.cover
                            ? <img src={sessions.find(s => s.track.title === topTrack[0]).track.cover} style={{ width:36, height:36, borderRadius:8, objectFit:"cover" }} alt="" />
                            : <div style={{ fontSize:20 }}>🎵</div>
                          }
                          <div style={{ fontFamily:font, fontWeight:600, fontSize:14, color:C.text }}>{topTrack[0]}</div>
                          <div style={{ marginLeft:"auto", fontSize:12, color:C.textSoft }}>×{topTrack[1]}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={handleShare}
                    style={{ width:"100%", background:copied?C.sageBg:C.accent, border:copied?`1px solid ${C.sage}40`:"none", borderRadius:13, padding:"15px", color:copied?C.sage:"#fff", fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:fontSans, transition:"all 0.2s" }}>
                    {copied ? "✓ Copied to clipboard" : "Copy recap to share →"}
                  </button>
                  <div style={{ textAlign:"center", color:C.textSoft, fontSize:12, marginTop:10, lineHeight:1.6 }}>
                    Paste it anywhere — Notes, a group chat, Reddit, X.
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Feedback link */}
        <div style={{ textAlign:"center", marginTop:28 }}>
          <a href="https://forms.gle/REPLACE_WITH_YOUR_FORM_LINK" target="_blank" rel="noopener noreferrer"
            style={{ fontSize:12, color:C.textSoft, textDecoration:"underline" }}>
            Something broken or confusing? Tell us →
          </a>
        </div>
      </div>
    </div>
  );
}