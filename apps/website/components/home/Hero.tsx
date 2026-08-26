"use client";

/**
 * Operations Console redesign — Hero.
 * The hero is the thesis: AI workers that ship behind human approval.
 * Signature element = a LIVE approval-gate card (the product's core loop),
 * playable right on the homepage: pending → approve → shipped + evidence.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

export default function Hero() {
    const reduced = useReducedMotion();
    const [state, setState] = useState<GateState>("pending");

    // Ambient life: cycle pending → approved → pending, unless the user
    // prefers reduced motion or has taken over by clicking.
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
                ? { label: "shipped", color: "var(--op-approved)" }
                : { label: "awaiting approval", color: "var(--op-pending)" },
        [state],
    );

    return (
        <section
            aria-label="Hero"
            className="relative overflow-hidden"
            style={{ background: "var(--op-ink)", color: "var(--op-paper)" }}
        >
            {/* faint console grid */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{
                    backgroundImage:
                        "linear-gradient(var(--op-paper) 1px, transparent 1px), linear-gradient(90deg, var(--op-paper) 1px, transparent 1px)",
                    backgroundSize: "44px 44px",
                    maskImage: "radial-gradient(ellipse 80% 60% at 70% 20%, black, transparent)",
                }}
            />
            <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
                {/* ── Left: the thesis ── */}
                <div>
                    <p
                        className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium uppercase tracking-[0.14em]"
                        style={{ borderColor: "var(--op-ink-3)", color: "var(--op-paper)", fontFamily: "var(--font-mono)" }}
                    >
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--op-approved)" }} />
                        AI workforce · human control
                    </p>

                    <h1
                        className="font-display font-extrabold"
                        style={{ fontSize: "clamp(2.7rem, 5.4vw, 4.2rem)", lineHeight: 1.02, letterSpacing: "-0.03em" }}
                    >
                        Hire AI workers that ship —
                        <br />
                        <span style={{ color: "var(--op-indigo)" }}>behind your approval.</span>
                    </h1>

                    <p className="mt-6 max-w-[46ch] text-[1.075rem] leading-relaxed" style={{ color: "#c3c7ce" }}>
                        Thirteen specialist workers that do the real work — write the code, send the
                        outreach, run the interview, close the deal — and stop at an approval gate
                        before anything risky reaches your customers, code, or production.
                    </p>

                    <div className="mt-9 flex flex-wrap items-center gap-3">
                        <Link
                            href="/get-started"
                            className="rounded-lg px-5 py-3 text-[15px] font-semibold transition-transform hover:-translate-y-0.5"
                            style={{ background: "var(--op-indigo)", color: "#fff" }}
                        >
                            Start free — no card
                        </Link>
                        <Link
                            href="/book-demo"
                            className="rounded-lg border px-5 py-3 text-[15px] font-semibold transition-colors hover:bg-white/5"
                            style={{ borderColor: "var(--op-ink-3)", color: "var(--op-paper)" }}
                        >
                            Book a demo
                        </Link>
                    </div>

                    <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-3" style={{ fontFamily: "var(--font-mono)" }}>
                        {[
                            ["13", "specialist workers"],
                            ["100%", "actions audit-covered"],
                            ["0", "risky actions un-gated"],
                        ].map(([n, l]) => (
                            <div key={l}>
                                <dt className="text-[1.4rem] font-semibold" style={{ color: "var(--op-paper)" }}>{n}</dt>
                                <dd className="text-[12px] uppercase tracking-wide" style={{ color: "var(--op-muted)" }}>{l}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                {/* ── Right: the signature — live approval-gate card ── */}
                <div className="relative">
                    <div
                        className="rounded-2xl border p-1.5 shadow-2xl"
                        style={{ background: "var(--op-ink-2)", borderColor: "var(--op-ink-3)" }}
                    >
                        {/* window chrome */}
                        <div className="flex items-center justify-between px-3 py-2" style={{ fontFamily: "var(--font-mono)" }}>
                            <div className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
                            </div>
                            <span className="text-[11px]" style={{ color: "var(--op-muted)" }}>approval-queue</span>
                        </div>

                        {/* the gate */}
                        <div className="rounded-xl p-5" style={{ background: "var(--op-ink)" }}>
                            <div className="flex items-center justify-between">
                                <span
                                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                                    style={{ fontFamily: "var(--font-mono)", color: tone.color, background: "color-mix(in srgb, currentColor 14%, transparent)" }}
                                >
                                    {tone.label}
                                </span>
                                <span className="text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                                    risk: HIGH
                                </span>
                            </div>

                            <p className="mt-4 text-[13px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                                Recruiter Agent · proposes
                            </p>
                            <p className="mt-1 text-[1.15rem] font-semibold" style={{ color: "var(--op-paper)" }}>
                                Send offer letter — Jordan Lee
                            </p>
                            <p className="mt-1 text-[13px]" style={{ color: "#aeb3bb" }}>
                                Staff Engineer · ₹42,00,000 · start Sep 1
                            </p>

                            <div className="my-4 h-px" style={{ background: "var(--op-ink-3)" }} />

                            {state !== "approved" ? (
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={approve}
                                        className="flex-1 rounded-lg py-2.5 text-[14px] font-semibold transition-transform hover:-translate-y-0.5"
                                        style={{ background: "var(--op-approved)", color: "#03130b" }}
                                    >
                                        {state === "approving" ? "Approving…" : "Approve"}
                                    </button>
                                    <button
                                        className="rounded-lg border px-4 py-2.5 text-[14px] font-medium"
                                        style={{ borderColor: "var(--op-ink-3)", color: "var(--op-paper)", fontFamily: "var(--font-mono)" }}
                                    >
                                        Review diff
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <div
                                        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[14px] font-semibold"
                                        style={{ background: "color-mix(in srgb, var(--op-approved) 14%, transparent)", color: "var(--op-approved)" }}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        Approved · offer sent via Gmail
                                    </div>
                                    <div className="mt-3 flex items-center justify-between" style={{ fontFamily: "var(--font-mono)" }}>
                                        <span className="text-[11px]" style={{ color: "var(--op-muted)" }}>
                                            evidence › gmail:send_email · task 98f2a1
                                        </span>
                                        <button onClick={reset} className="text-[11px] underline" style={{ color: "var(--op-muted)" }}>
                                            replay
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="mt-3 text-center text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                        ↑ a real gate — try approving it
                    </p>
                </div>
            </div>
        </section>
    );
}
