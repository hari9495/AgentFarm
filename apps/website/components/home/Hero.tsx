"use client";

/**
 * Modern / animated Hero — dark, aurora-lit, glassmorphism.
 * Same thesis and signature as before (AI workers behind human approval, shown
 * as a LIVE approval-gate card) but on a deep animated surface: drifting aurora
 * glow, gradient headline, glass CTAs, motion entrance. The interactive gate
 * (auto-loop + click-to-approve + replay) is preserved.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";

type GateState = "pending" | "approving" | "approved";

function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const m = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(m.matches);
        const on = () => setReduced(m.matches);
        m.addEventListener("change", on);
        return () => m.removeEventListener("change", on);
    }, []);
    return reduced;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const rise = (delay: number) => ({
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: EASE },
});

export default function Hero() {
    const reduced = useReducedMotion();
    const [state, setState] = useState<GateState>("pending");
    const [userDriven, setUserDriven] = useState(false);

    useEffect(() => {
        if (reduced || userDriven) return;
        let t: ReturnType<typeof setTimeout>;
        const loop = () => {
            setState("pending");
            t = setTimeout(() => {
                setState("approving");
                t = setTimeout(() => {
                    setState("approved");
                    t = setTimeout(loop, 2600);
                }, 700);
            }, 2600);
        };
        loop();
        return () => clearTimeout(t);
    }, [reduced, userDriven]);

    function approve() {
        setUserDriven(true);
        setState("approving");
        setTimeout(() => setState("approved"), 650);
    }
    function reset() {
        setUserDriven(true);
        setState("pending");
    }

    const tone = useMemo(
        () =>
            state === "approved"
                ? { label: "shipped", color: "#4ADE80", soft: "rgba(74,222,128,0.13)", border: "rgba(74,222,128,0.3)" }
                : { label: "awaiting approval", color: "#F5C451", soft: "rgba(245,196,81,0.13)", border: "rgba(245,196,81,0.3)" },
        [state],
    );

    return (
        <section aria-label="Hero" className="relative overflow-hidden" style={{ background: "#080A0C", color: "#E8EDEC" }}>
            <style>{`
                @keyframes af-drift1 { 0%,100%{ transform: translate(-10%,-10%) scale(1);} 50%{ transform: translate(10%,6%) scale(1.25);} }
                @keyframes af-drift2 { 0%,100%{ transform: translate(12%,-6%) scale(1.1);} 50%{ transform: translate(-8%,12%) scale(0.9);} }
                @keyframes af-pulse { 0%,100%{ opacity:1;} 50%{ opacity:0.35;} }
                .af-aurora { position:absolute; border-radius:9999px; filter: blur(90px); pointer-events:none; }
                @media (prefers-reduced-motion: reduce){ .af-aurora{ animation:none !important; } }
            `}</style>
            <div className="af-aurora" style={{ width: 640, height: 640, top: -200, left: -120, background: "radial-gradient(circle, rgba(55,160,160,0.40), transparent 62%)", animation: "af-drift1 18s ease-in-out infinite" }} />
            <div className="af-aurora" style={{ width: 560, height: 560, top: -140, right: -140, background: "radial-gradient(circle, rgba(94,230,208,0.22), transparent 62%)", animation: "af-drift2 22s ease-in-out infinite" }} />
            <div className="af-aurora" style={{ width: 520, height: 520, bottom: -260, left: "38%", background: "radial-gradient(circle, rgba(28,110,110,0.28), transparent 62%)", animation: "af-drift1 26s ease-in-out infinite" }} />

            <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
                {/* ── Left: the thesis ── */}
                <div>
                    <motion.p {...rise(0)} className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium uppercase tracking-[0.14em]"
                        style={{ borderColor: "rgba(94,230,208,0.25)", background: "rgba(94,230,208,0.10)", color: "#5EE6D0", fontFamily: "var(--font-mono)" }}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#5EE6D0", animation: "af-pulse 1.6s ease-in-out infinite" }} />
                        AI workforce · human control
                    </motion.p>

                    <motion.h1 {...rise(0.08)} className="font-display font-extrabold" style={{ fontSize: "clamp(2.7rem, 5.4vw, 4.2rem)", lineHeight: 1.03, letterSpacing: "-0.03em" }}>
                        <span style={{ background: "linear-gradient(120deg, #ffffff 30%, #C7D2D0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hire AI workers that ship —</span>
                        <br />
                        <span style={{ background: "linear-gradient(120deg, #5EE6D0, #37A0A0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>behind your approval.</span>
                    </motion.h1>

                    <motion.p {...rise(0.16)} className="mt-6 max-w-[46ch] text-[1.075rem] leading-relaxed" style={{ color: "#8A9998" }}>
                        Thirteen specialist workers that do the real work — write the code, send the
                        outreach, run the interview, close the deal — and stop at an approval gate
                        before anything risky reaches your customers, code, or production.
                    </motion.p>

                    <motion.div {...rise(0.24)} className="mt-9 flex flex-wrap items-center gap-3">
                        <Link href="/get-started" className="rounded-lg px-5 py-3 text-[15px] font-semibold transition-transform hover:-translate-y-0.5"
                            style={{ background: "linear-gradient(120deg, #5EE6D0, #37A0A0)", color: "#04191A", boxShadow: "0 8px 28px -8px rgba(55,160,160,0.6)" }}>
                            Start free — no card
                        </Link>
                        <Link href="/book-demo" className="rounded-lg border px-5 py-3 text-[15px] font-semibold transition-colors"
                            style={{ borderColor: "rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "#E8EDEC", backdropFilter: "blur(8px)" }}>
                            Book a demo
                        </Link>
                    </motion.div>

                    <motion.dl {...rise(0.32)} className="mt-10 flex flex-wrap gap-x-8 gap-y-3" style={{ fontFamily: "var(--font-mono)" }}>
                        {[["13", "specialist workers"], ["100%", "actions audit-covered"], ["0", "risky actions un-gated"]].map(([n, l]) => (
                            <div key={l}>
                                <dt className="text-[1.4rem] font-semibold" style={{ color: "#5EE6D0" }}>{n}</dt>
                                <dd className="text-[12px] uppercase tracking-wide" style={{ color: "#677675" }}>{l}</dd>
                            </div>
                        ))}
                    </motion.dl>
                </div>

                {/* ── Right: the signature — live approval-gate card (glass/dark) ── */}
                <motion.div {...rise(0.4)} className="relative">
                    <div className="rounded-2xl border p-1.5" style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", backdropFilter: "blur(16px)", boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(94,230,208,0.06)" }}>
                        {/* window chrome */}
                        <div className="flex items-center justify-between px-3 py-2" style={{ fontFamily: "var(--font-mono)" }}>
                            <div className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
                            </div>
                            <span className="text-[11px]" style={{ color: "#677675" }}>approval-queue</span>
                        </div>

                        {/* the gate */}
                        <div className="rounded-xl p-5" style={{ background: "rgba(8,12,14,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="flex items-center justify-between">
                                <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                                    style={{ fontFamily: "var(--font-mono)", color: tone.color, background: tone.soft, border: `1px solid ${tone.border}` }}>
                                    {tone.label}
                                </span>
                                <span className="text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "#8A9998" }}>risk: HIGH</span>
                            </div>

                            <p className="mt-4 text-[13px]" style={{ fontFamily: "var(--font-mono)", color: "#677675" }}>Recruiter Agent · proposes</p>
                            <p className="mt-1 text-[1.15rem] font-semibold" style={{ color: "#E8EDEC" }}>Send offer letter — Jordan Lee</p>
                            <p className="mt-1 text-[13px]" style={{ color: "#8A9998" }}>Staff Engineer · ₹42,00,000 · start Sep 1</p>

                            <div className="my-4 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

                            {state !== "approved" ? (
                                <div className="flex items-center gap-3">
                                    <button onClick={approve} className="flex-1 rounded-lg py-2.5 text-[14px] font-semibold transition-transform hover:-translate-y-0.5"
                                        style={{ background: "linear-gradient(120deg, #5EE6D0, #37A0A0)", color: "#04191A", boxShadow: "0 8px 24px -8px rgba(55,160,160,0.5)" }}>
                                        {state === "approving" ? "Approving…" : "Approve"}
                                    </button>
                                    <button className="rounded-lg border px-4 py-2.5 text-[14px] font-medium"
                                        style={{ borderColor: "rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "#E8EDEC", fontFamily: "var(--font-mono)" }}>
                                        Review diff
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[14px] font-semibold"
                                        style={{ background: "rgba(74,222,128,0.13)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.3)" }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        Approved · offer sent via Gmail
                                    </div>
                                    <div className="mt-3 flex items-center justify-between" style={{ fontFamily: "var(--font-mono)" }}>
                                        <span className="text-[11px]" style={{ color: "#677675" }}>evidence › gmail:send_email · task 98f2a1</span>
                                        <button onClick={reset} className="text-[11px] underline" style={{ color: "#8A9998" }}>replay</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="mt-3 text-center text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "#677675" }}>↑ a real gate — try approving it</p>
                </motion.div>
            </div>
        </section>
    );
}
