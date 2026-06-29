"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useConnectWallet, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";
import { isAuthConfigured } from "@/lib/enoki";

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const MONO = "var(--font-space-mono), ui-monospace, monospace";
const INK = "#15151A";
const FAINT = "#9A9AA6";

// ── content ──────────────────────────────────────────────────────────────────
const TICKERS = [
  { p: "SUI/USDC", v: "3.142", d: "+2.4%", up: true },
  { p: "DEEP/SUI", v: "0.0182", d: "+6.1%", up: true },
  { p: "WAL/SUI", v: "0.214", d: "-1.2%", up: false },
  { p: "BTC>110K · FRI", v: "62%", d: "YES", up: true },
  { p: "USDC/USDT", v: "0.9998", d: "+0.0%", up: true },
  { p: "SUI/USDT", v: "3.141", d: "+2.3%", up: true },
  { p: "DEEP/USDC", v: "0.0572", d: "+4.8%", up: true },
];

const PILLARS = [
  { n: "01", tag: "Identity", t: "Walletless sign-in", color: "#0A84FF", d: "Continue with Google. zkLogin via Enoki mints a self-custodial Sui address behind the scenes. No seed phrases, ever." },
  { n: "02", tag: "Transactions", t: "Gasless by default", color: "#FF7A45", d: "Every action — post, follow, like, trade — is sponsored via Enoki. Users never touch, hold, or think about gas." },
  { n: "03", tag: "Ownership", t: "You own it", color: "#18C2C2", d: "Profiles, posts and follows are owned Sui objects. Portable, censorship-resistant, yours to take anywhere." },
];

const POSTS = [
  { name: "Amaka O.", handle: "amaka.reef", time: "2m", av: "linear-gradient(135deg,#FF8A5B,#FFD166)", replies: "88", reposts: "214", likes: "1.2k", text: "continued with google and got a self-custodial sui address. no seed phrase, no gas. i am genuinely shocked this just worked." },
  { name: "Tunde A.", handle: "tunde.reef", time: "14m", av: "linear-gradient(135deg,#0A84FF,#18C2C2)", replies: "56", reposts: "190", likes: "842", text: "swapped my bag into DEEP — gasless market order straight through DeepBook. lagos to the world 🪸" },
  { name: "Zainab", handle: "zainab.reef", time: "31m", av: "linear-gradient(135deg,#18C2C2,#7CFCD8)", replies: "310", reposts: "506", likes: "2.4k", text: "took the BTC > $110k binary for friday. on-chain option settled by the orderbook — not a casino." },
];

const STATUS_COLORS: Record<string, { color: string; border: string }> = {
  live: { color: "#0a5b53", border: "rgba(24,194,194,.55)" },
  partial: { color: "#FFD166", border: "rgba(255,209,102,.5)" },
  parked: { color: "#9A9AA6", border: "rgba(154,154,166,.45)" },
  planned: { color: "#0A84FF", border: "rgba(10,132,255,.5)" },
};
const PRIMITIVES = [
  { cap: "Identity (walletless)", prim: "zkLogin via Enoki", status: "live" },
  { cap: "Gasless transactions", prim: "Enoki sponsored tx", status: "live" },
  { cap: "Profiles · posts · follows", prim: "Sui Move objects (owned-first)", status: "live" },
  { cap: "Likes · reposts · bookmarks", prim: "Off-chain signed → indexer", status: "live" },
  { cap: "Media storage", prim: "Walrus blobs + image proxy", status: "live" },
  { cap: "Handles", prim: "SuiNS leaf-subname", status: "partial" },
  { cap: "Trading", prim: "DeepBook v3 — gasless swaps", status: "live" },
  { cap: "Prediction markets", prim: "DeepBook Predict (BTC binary)", status: "live" },
  { cap: "Creator coins", prim: "Per-creator Coin + pool", status: "parked" },
  { cap: "DMs · groups", prim: "Sui Messaging SDK", status: "planned" },
];
const PACKAGES = [
  { tag: "contract", color: "#7CFCD8", name: "Move package", desc: "profile · post · follow · registry — published to testnet." },
  { tag: "core", color: "#FFD166", name: "@umbra/core", desc: "Sui client, tx builders, Enoki sponsor, Walrus, DeepBook, Zod schemas." },
  { tag: "service", color: "#FF8A5B", name: "Indexer", desc: "Event poller → Postgres → tRPC API + sponsor + image / DeepBook proxies." },
];
const FEATURES = [
  { icon: "🪸", bg: "rgba(10,132,255,.12)", t: "Walletless feed", d: "Post, reply, like, repost and bookmark. Your content lives as owned Sui objects served by an open indexer — not rows in a company database." },
  { icon: "⚡", bg: "rgba(24,194,194,.16)", t: "Gasless trading", d: "Swap SUI ⇄ DEEP on DeepBook v3 with real on-chain balances. Every order is sponsored — you never hold or pay gas." },
  { icon: "🎯", bg: "rgba(255,122,69,.16)", t: "Prediction markets", d: "Take BTC binary options on DeepBook Predict — Up or Down, settled on-chain by the orderbook at expiry. A market, not a casino." },
  { icon: "🖼️", bg: "rgba(124,252,216,.3)", t: "Walrus media", d: "Photos and clips upload straight to Walrus and stream back through the reef proxy. No S3, no storage bill." },
  { icon: "🆔", bg: "rgba(255,209,102,.3)", t: "Real handles", d: "Claim @you.reef and sign in with Google via zkLogin. A self-custodial Sui address and a free SuiNS name from day one." },
  { icon: "💬", bg: "rgba(21,21,26,.08)", t: "Messaging · soon", d: "Native Sui DMs and group chats over the Messaging SDK — the same walletless, gasless identity you already use." },
];
const STATUSES = [
  { label: "Working", color: "#18C2C2", text: "Walletless sign-in, onboarding, feed, posting, replies, reactions, search, profiles, follow — web & mobile." },
  { label: "Working", color: "#18C2C2", text: "Gasless DeepBook market swaps (SUI ⇄ DEEP) and on-chain BTC prediction bets, signed by the zkLogin account." },
  { label: "In progress", color: "#FFD166", text: "SuiNS leaf-subname minting; mobile trade execution; turning the web Predict tab into a desktop market grid." },
  { label: "Parked / later", color: "#9A9AA6", text: "Creator-coin trading; limit orders (BalanceManager); DMs; Seal-gated content; AI agents (Nautilus)." },
];

// ── sign-in ──────────────────────────────────────────────────────────────────
function useGoogleSignIn() {
  const enoki = useWallets().filter(isEnokiWallet)[0];
  const { mutate: connect, isPending } = useConnectWallet();
  const signIn = () => {
    if (enoki) connect({ wallet: enoki });
  };
  return { signIn, isPending, ready: Boolean(enoki) && isAuthConfigured };
}

// ── small UI bits ─────────────────────────────────────────────────────────────
function Eyebrow({ n, children, light }: { n: string; children: React.ReactNode; light?: boolean }) {
  const c = light ? "#9A9AA6" : "#565660";
  const line = light ? "rgba(234,231,223,.22)" : "rgba(21,21,26,.18)";
  return (
    <div data-reveal style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: c, display: "flex", gap: 14, alignItems: "center", marginBottom: "clamp(30px,5vh,54px)" }}>
      <span>({n})</span>
      <span style={{ flex: 1, height: 1, background: line, maxWidth: 90 }} />
      <span>{children}</span>
    </div>
  );
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const { signIn, isPending } = useGoogleSignIn();
  const tickerLoop = [...TICKERS, ...TICKERS];

  useIso(() => {
    if (!root.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer:fine)").matches;
    const ctx = gsap.context(() => {
      gsap.registerPlugin(ScrollTrigger);

      if (!reduce) {
        root.current!.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
          gsap.from(el, { y: 46, opacity: 0, duration: 1.05, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } });
        });
        const blob = root.current!.querySelector<HTMLElement>("#reef-blob");
        if (blob) gsap.to(blob, { yPercent: 30, ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "60% top", scrub: 0.6 } });
      }

      const cursor = root.current!.querySelector<HTMLElement>("#reef-cursor");
      if (cursor && fine && !reduce) {
        const xt = gsap.quickTo(cursor, "x", { duration: 0.4, ease: "power3" });
        const yt = gsap.quickTo(cursor, "y", { duration: 0.4, ease: "power3" });
        const move = (e: MouseEvent) => { cursor.style.opacity = "1"; xt(e.clientX); yt(e.clientY); };
        window.addEventListener("mousemove", move);
        root.current!.querySelectorAll<HTMLElement>("a,button,[data-cursor]").forEach((el) => {
          el.addEventListener("mouseenter", () => { cursor.style.width = "46px"; cursor.style.height = "46px"; cursor.style.background = "rgba(10,132,255,.18)"; });
          el.addEventListener("mouseleave", () => { cursor.style.width = "11px"; cursor.style.height = "11px"; cursor.style.background = "#0A84FF"; });
        });
      }

      if (fine && !reduce) {
        root.current!.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
          el.addEventListener("mousemove", (e) => {
            const r = el.getBoundingClientRect();
            gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.4, y: (e.clientY - r.top - r.height / 2) * 0.5, duration: 0.5, ease: "power3.out" });
          });
          el.addEventListener("mouseleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1,0.4)" }));
        });
      }
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} id="reef-root" style={{ position: "relative", minHeight: "100vh", background: "#EAE7DF", color: INK, fontFamily: "var(--font-expose),sans-serif", overflow: "hidden" }}>
      <style>{`
        @keyframes reefRise{from{transform:translateY(112%)}to{transform:translateY(0)}}
        @keyframes reefFade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes reefMq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes reefPulse{0%,100%{opacity:.5}50%{opacity:1}}
        .rl-inner{display:block;animation:reefRise 1.05s cubic-bezier(.22,1,.36,1) both}
        @media (max-width:760px){.rl-hide-sm{display:none!important}}
        @media (max-width:980px){.rl-grid-prod{grid-template-columns:1fr!important}}
        #reef-root a{color:inherit;text-decoration:none}
      `}</style>

      {/* noise */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.5, mixBlendMode: "multiply", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.32'/%3E%3C/svg%3E\")" }} />

      {/* custom cursor */}
      <div id="reef-cursor" className="rl-hide-sm" style={{ position: "fixed", top: 0, left: 0, width: 11, height: 11, borderRadius: "50%", background: "#0A84FF", zIndex: 9999, pointerEvents: "none", transform: "translate(-50%,-50%)", mixBlendMode: "multiply", transition: "width .25s cubic-bezier(.22,1,.36,1),height .25s cubic-bezier(.22,1,.36,1),background .25s", opacity: 0 }} />

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px clamp(18px,4vw,52px)", backdropFilter: "blur(14px)", background: "rgba(234,231,223,.62)", borderBottom: "1px solid rgba(21,21,26,.1)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontWeight: 900, fontSize: 25, letterSpacing: "-.02em" }}>ReeF</span>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF7A45", display: "inline-block", transform: "translateY(-1px)" }} />
        </div>
        <div className="rl-hide-sm" style={{ display: "flex", gap: 30, fontFamily: MONO, fontSize: 11.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#565660" }}>
          <a href="#build">Product</a><a href="#features">Features</a><a href="#arch">Architecture</a><a href="#status">Status</a>
        </div>
        <button data-magnetic onClick={signIn} style={{ display: "flex", alignItems: "center", gap: 9, border: "none", cursor: "pointer", background: INK, color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 14, padding: "11px 18px 11px 13px", borderRadius: 100 }}>
          <span style={{ width: 19, height: 19, borderRadius: "50%", background: "#fff", color: INK, fontWeight: 900, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>G</span>
          {isPending ? "Signing in…" : "Continue with Google"}
        </button>
      </nav>

      {/* HERO */}
      <header style={{ position: "relative", zIndex: 2, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 clamp(18px,4vw,52px) clamp(28px,4vh,52px)", maxWidth: 1480, margin: "0 auto" }}>
        <div id="reef-blob" style={{ position: "absolute", top: "13%", right: "-6%", width: "min(46vw,560px)", height: "min(46vw,560px)", borderRadius: "50%", background: "radial-gradient(circle at 30% 30%,#7CFCD8,#18C2C2 38%,#0A84FF 78%,#0850b0)", filter: "blur(8px)", opacity: 0.92, zIndex: -1 }} />
        <div className="rl-hide-sm" style={{ position: "absolute", top: "14%", right: "-2%", width: "min(40vw,470px)", height: "min(40vw,470px)", borderRadius: "50%", border: "1px solid rgba(21,21,26,.16)", zIndex: -1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "clamp(20px,4vh,40px)", fontFamily: MONO, fontSize: 11.5, letterSpacing: ".16em", textTransform: "uppercase", color: "#565660", animation: "reefFade 1s .2s both" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#0A84FF", animation: "reefPulse 2.4s infinite" }} />
          Sui-native social · walletless · gasless
        </div>

        <h1 style={{ margin: 0, fontWeight: 900, fontSize: "clamp(54px,12vw,200px)", lineHeight: 0.84, letterSpacing: "-.035em" }}>
          <span style={{ display: "block", overflow: "hidden" }}><span className="rl-inner" style={{ animationDelay: ".2s" }}>The social</span></span>
          <span style={{ display: "block", overflow: "hidden" }}><span className="rl-inner" style={{ animationDelay: ".32s" }}>layer of <span style={{ color: "#0A84FF" }}>Sui.</span></span></span>
        </h1>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 32, marginTop: "clamp(26px,5vh,52px)" }}>
          <p style={{ margin: 0, maxWidth: 430, fontSize: "clamp(16px,1.5vw,19px)", lineHeight: 1.5, color: "#3a3a42", animation: "reefFade 1s .55s both" }}>
            Own your identity, your posts, and your audience. No seed phrases, no gas, no middlemen — identity, the social graph, content and markets are native Sui primitives, not rows in a company database.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 22, animation: "reefFade 1s .7s both" }}>
            <button data-magnetic onClick={signIn} style={{ display: "flex", alignItems: "center", gap: 10, border: "none", cursor: "pointer", background: "#0A84FF", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 16, padding: "16px 26px", borderRadius: 100, boxShadow: "0 12px 30px -10px rgba(10,132,255,.7)" }}>
              {isPending ? "Signing in…" : "Continue with Google"}<span style={{ fontSize: 18 }}>→</span>
            </button>
            <a href="#build" style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: INK, borderBottom: "1px solid rgba(21,21,26,.3)", paddingBottom: 3 }}>Explore the reef ↓</a>
          </div>
        </div>
      </header>

      {/* TICKER */}
      <section style={{ position: "relative", zIndex: 2, borderTop: "1px solid rgba(21,21,26,.14)", borderBottom: "1px solid rgba(21,21,26,.14)", background: INK, color: "#EAE7DF", overflow: "hidden", padding: "15px 0" }}>
        <div style={{ display: "flex", width: "max-content", animation: "reefMq 32s linear infinite" }}>
          <div style={{ display: "flex" }}>
            {tickerLoop.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 30px", borderRight: "1px solid rgba(234,231,223,.14)", fontFamily: MONO, fontSize: 13, whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 700, letterSpacing: ".04em" }}>{t.p}</span>
                <span style={{ color: FAINT }}>{t.v}</span>
                <span style={{ color: t.up ? "#7CFCD8" : "#FF8A5B", fontWeight: 700 }}>{t.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MANIFESTO + PILLARS */}
      <section id="build" style={{ position: "relative", zIndex: 2, padding: "clamp(70px,12vh,150px) clamp(18px,4vw,52px)", maxWidth: 1480, margin: "0 auto" }}>
        <Eyebrow n="01">What we&rsquo;re building</Eyebrow>
        <h2 data-reveal style={{ margin: 0, fontWeight: 700, fontSize: "clamp(28px,4.4vw,64px)", lineHeight: 1.04, letterSpacing: "-.025em", maxWidth: 1100 }}>
          A decentralized social superapp where identity, graph, content and markets are <span style={{ color: "#0A84FF" }}>owned Sui objects</span> — built mobile-first for mainstream users. <span style={{ color: FAINT }}>Lagos-first.</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 1, marginTop: "clamp(50px,8vh,96px)", background: "rgba(21,21,26,.14)", border: "1px solid rgba(21,21,26,.14)", borderRadius: 4, overflow: "hidden" }}>
          {PILLARS.map((p) => (
            <div key={p.n} data-reveal style={{ background: "#EAE7DF", padding: "clamp(28px,3vw,42px)", display: "flex", flexDirection: "column", gap: 18, minHeight: 360 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 900, fontSize: "clamp(40px,4vw,58px)", letterSpacing: "-.03em", color: p.color }}>{p.n}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "#565660", border: "1px solid rgba(21,21,26,.2)", padding: "5px 9px", borderRadius: 100 }}>{p.tag}</span>
              </div>
              <h3 style={{ margin: "auto 0 0", fontWeight: 700, fontSize: "clamp(22px,2vw,28px)", letterSpacing: "-.02em" }}>{p.t}</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "#3a3a42" }}>{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section style={{ position: "relative", zIndex: 2, padding: "clamp(40px,7vh,90px) clamp(18px,4vw,52px) clamp(70px,12vh,150px)", maxWidth: 1480, margin: "0 auto" }}>
        <Eyebrow n="02">Shipped this build · web &amp; mobile</Eyebrow>
        <div className="rl-grid-prod" style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: "clamp(20px,2.5vw,34px)", alignItems: "start" }}>
          {/* web feed card */}
          <div data-reveal style={{ background: "#F6F5F1", border: "1px solid rgba(21,21,26,.12)", borderRadius: 22, overflow: "hidden", boxShadow: "0 30px 60px -34px rgba(21,21,26,.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px", borderBottom: "1px solid rgba(21,21,26,.09)" }}>
              {["#FF7A45", "#FFD166", "#18C2C2"].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />)}
              <span style={{ marginLeft: 14, fontFamily: MONO, fontSize: 11, color: FAINT }}>reef.social / home</span>
            </div>
            <div style={{ display: "flex" }}>
              <div className="rl-hide-sm" style={{ width: 62, borderRight: "1px solid rgba(21,21,26,.09)", padding: "18px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
                <span style={{ fontWeight: 900, fontSize: 18 }}>R</span>
                {["#0A84FF", "rgba(21,21,26,.14)", "rgba(21,21,26,.14)", "#FF7A45", "rgba(21,21,26,.14)"].map((bg, i) => <span key={i} style={{ width: 22, height: 22, borderRadius: 7, background: bg, display: "block" }} />)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 24, padding: "16px 22px", borderBottom: "1px solid rgba(21,21,26,.09)", fontFamily: MONO, fontSize: 12, letterSpacing: ".04em" }}>
                  <span style={{ fontWeight: 700, borderBottom: "2px solid #0A84FF", paddingBottom: 14, marginBottom: -17 }}>For you</span>
                  <span style={{ color: FAINT }}>Following</span>
                </div>
                {POSTS.map((post) => (
                  <div key={post.handle} style={{ padding: "18px 22px", borderBottom: "1px solid rgba(21,21,26,.07)", display: "flex", gap: 13 }}>
                    <span style={{ width: 42, height: 42, borderRadius: "50%", background: post.av, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14.5 }}>
                        <span style={{ fontWeight: 700 }}>{post.name}</span>
                        <span style={{ color: FAINT, fontFamily: MONO, fontSize: 12 }}>@{post.handle}</span>
                        <span style={{ color: FAINT, fontFamily: MONO, fontSize: 12 }}>· {post.time}</span>
                      </div>
                      <p style={{ margin: "5px 0 11px", fontSize: 14.5, lineHeight: 1.5, color: "#26262c" }}>{post.text}</p>
                      <div style={{ display: "flex", gap: 26, fontFamily: MONO, fontSize: 11.5, color: FAINT }}>
                        <span>↺ {post.replies}</span><span>⇌ {post.reposts}</span><span style={{ color: "#0A84FF" }}>♥ {post.likes}</span><span>⤓</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* phone */}
          <div data-reveal style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ alignSelf: "center", width: "min(78%,300px)", aspectRatio: "9/19", background: INK, borderRadius: 40, padding: 9, boxShadow: "0 40px 70px -30px rgba(21,21,26,.55)" }}>
              <div style={{ width: "100%", height: "100%", borderRadius: 32, overflow: "hidden", background: "linear-gradient(180deg,#7CFCD8 0%,#18C2C2 26%,#0A84FF 60%,#0a3f86 100%)", position: "relative", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 20px 0", fontFamily: MONO, fontSize: 11, color: "#fff" }}><span>9:41</span><span>reef</span></div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "#fff" }}>
                  <span style={{ fontWeight: 900, fontSize: 52, letterSpacing: "-.03em", textShadow: "0 6px 24px rgba(0,0,0,.2)" }}>ReeF</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", opacity: 0.85 }}>THE BEACH PARTY IS ON</span>
                </div>
                <div style={{ margin: "0 16px 16px", background: "rgba(255,255,255,.16)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 18, padding: 13, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", color: INK, fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>G</span>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Continue with Google</span>
                </div>
                <div style={{ height: 5, width: "38%", background: "rgba(255,255,255,.6)", borderRadius: 100, margin: "0 auto 9px" }} />
              </div>
            </div>
            <div style={{ border: "1px solid rgba(21,21,26,.14)", borderRadius: 18, padding: "20px 22px", background: "#F6F5F1" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "#565660", marginBottom: 12 }}>Expo SDK 54 · live</div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "#3a3a42" }}>zkLogin sign-in over an HTTPS bounce page; session persists across restarts. Floating bottom nav, Telegram-clean feed, base.app-style swap terminal, TikTok-style Predict feed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="arch" style={{ position: "relative", zIndex: 2, background: INK, color: "#EAE7DF", padding: "clamp(70px,12vh,150px) clamp(18px,4vw,52px)" }}>
        <div style={{ maxWidth: 1480, margin: "0 auto" }}>
          <Eyebrow n="03" light>On-chain model</Eyebrow>
          <h2 data-reveal style={{ margin: "0 0 clamp(40px,6vh,72px)", fontWeight: 700, fontSize: "clamp(28px,4.2vw,60px)", lineHeight: 1.04, letterSpacing: "-.025em", maxWidth: 1000 }}>
            Every capability maps to a Sui primitive. <span style={{ color: "#7CFCD8" }}>Owned-object-first</span> for parallelism.
          </h2>
          <div data-reveal style={{ borderTop: "1px solid rgba(234,231,223,.22)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr .6fr", gap: 20, padding: "14px 4px", fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: FAINT, borderBottom: "1px solid rgba(234,231,223,.22)" }}>
              <span>Capability</span><span className="rl-hide-sm">Primitive / tool</span><span style={{ textAlign: "right" }}>Status</span>
            </div>
            {PRIMITIVES.map((row) => {
              const sc: { color: string; border: string } = STATUS_COLORS[row.status] ?? { color: "#0a5b53", border: "rgba(24,194,194,.55)" };
              return (
                <div key={row.cap} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr .6fr", gap: 20, padding: "18px 4px", borderBottom: "1px solid rgba(234,231,223,.12)", alignItems: "center" }}>
                  <span style={{ fontSize: "clamp(15px,1.5vw,19px)", fontWeight: 500 }}>{row.cap}</span>
                  <span className="rl-hide-sm" style={{ fontFamily: MONO, fontSize: 13, color: FAINT }}>{row.prim}</span>
                  <span style={{ textAlign: "right" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: sc.color, border: `1px solid ${sc.border}`, padding: "4px 10px", borderRadius: 100, display: "inline-block" }}>{row.status}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div data-reveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginTop: "clamp(40px,6vh,64px)" }}>
            {PACKAGES.map((pkg) => (
              <div key={pkg.name} style={{ border: "1px solid rgba(234,231,223,.22)", borderRadius: 14, padding: 22 }}>
                <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: pkg.color, marginBottom: 10 }}>{pkg.tag}</div>
                <h4 style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 18 }}>{pkg.name}</h4>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: FAINT }}>{pkg.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT YOU CAN DO */}
      <section id="features" style={{ position: "relative", zIndex: 2, padding: "clamp(70px,12vh,150px) clamp(18px,4vw,52px)", maxWidth: 1480, margin: "0 auto" }}>
        <Eyebrow n="04">What you can do</Eyebrow>
        <h2 data-reveal style={{ margin: "0 0 clamp(40px,6vh,68px)", fontWeight: 700, fontSize: "clamp(28px,4.2vw,60px)", lineHeight: 1.04, letterSpacing: "-.025em", maxWidth: 1000 }}>
          One app for your <span style={{ color: "#0A84FF" }}>feed</span>, your <span style={{ color: "#18C2C2" }}>trades</span> and your <span style={{ color: "#FF7A45" }}>predictions</span> — all gasless, all on Sui.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 1, background: "rgba(21,21,26,.14)", border: "1px solid rgba(21,21,26,.14)", borderRadius: 6, overflow: "hidden" }}>
          {FEATURES.map((f) => (
            <div key={f.t} data-reveal style={{ background: "#EAE7DF", padding: "clamp(26px,2.6vw,36px)", display: "flex", flexDirection: "column", gap: 14, minHeight: 220 }}>
              <span style={{ width: 44, height: 44, borderRadius: 13, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{f.icon}</span>
              <h3 style={{ margin: "6px 0 0", fontWeight: 700, fontSize: "clamp(19px,1.6vw,23px)", letterSpacing: "-.02em" }}>{f.t}</h3>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "#3a3a42" }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* STATUS */}
      <section id="status" style={{ position: "relative", zIndex: 2, padding: "0 clamp(18px,4vw,52px) clamp(70px,12vh,140px)", maxWidth: 1480, margin: "0 auto" }}>
        <Eyebrow n="05">Where it stands</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 1, background: "rgba(21,21,26,.14)", border: "1px solid rgba(21,21,26,.14)", borderRadius: 6, overflow: "hidden" }}>
          {STATUSES.map((s, i) => (
            <div key={i} data-reveal style={{ background: "#EAE7DF", padding: 26, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color }} />
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "#565660" }}>{s.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "#26262c" }}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER CTA */}
      <footer style={{ position: "relative", zIndex: 2, background: "#0A84FF", color: "#fff", padding: "clamp(70px,14vh,160px) clamp(18px,4vw,52px) clamp(40px,6vh,60px)", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: "-30%", right: "-8%", width: "min(50vw,640px)", height: "min(50vw,640px)", borderRadius: "50%", background: "radial-gradient(circle at 40% 40%,rgba(124,252,216,.55),rgba(24,194,194,0) 60%)" }} />
        <div style={{ maxWidth: 1480, margin: "0 auto", position: "relative" }}>
          <h2 data-reveal style={{ margin: 0, fontWeight: 900, fontSize: "clamp(44px,9vw,140px)", lineHeight: 0.86, letterSpacing: "-.035em" }}>Own your<br />signal.</h2>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 30, marginTop: "clamp(40px,6vh,70px)" }}>
            <button data-magnetic onClick={signIn} style={{ display: "flex", alignItems: "center", gap: 10, border: "none", cursor: "pointer", background: "#fff", color: INK, fontFamily: "inherit", fontWeight: 700, fontSize: 17, padding: "17px 28px 17px 16px", borderRadius: 100 }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: INK, color: "#fff", fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>G</span>
              {isPending ? "Signing in…" : "Continue with Google →"}
            </button>
            <span style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: ".06em", lineHeight: 1.7, color: "rgba(255,255,255,.8)", maxWidth: 360 }}>ReeF — the social layer of Sui. Testnet build · codename umbra · apps/web · apps/mobile · packages/move · packages/core · services/indexer.</span>
          </div>
          <div style={{ marginTop: "clamp(40px,8vh,80px)", paddingTop: 24, borderTop: "1px solid rgba(255,255,255,.25)", display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", fontFamily: MONO, fontSize: 11, letterSpacing: ".06em", color: "rgba(255,255,255,.7)" }}>
            <span>ReeF © 2026 · built on Sui</span>
            <span>pnpm · turborepo · next 15 · expo 54 · react 19</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
