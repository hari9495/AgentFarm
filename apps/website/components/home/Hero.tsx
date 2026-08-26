"use client";

/**
 * Operations Console — Hero (light / relaxed).
 * Same thesis and signature as before (AI workers behind human approval, shown
 * as a LIVE approval-gate card) but on a calm, airy light surface instead of a
 * near-black console. Soft brand wash, generous space, gentle shadows.
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
                ? { label: "shipped", color: "var(--op-approved)", soft: "var(--op-approved-soft)" }
                : { label: "awaiting approval", color: "var(--op-pending)", soft: "var(--op-pending-soft)" },
        [state],
    );

    return (
        <section
            aria-label="Hero"
            className="relative overflow-hidden"
            style={{ background: "var(--op-paper)", color: "var(--op-ink)" }}
        >
            {/* soft brand wash — calm, not a hard grid */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(60% 55% at 78% 12%, var(--op-indigo-soft), transparent 70%), radial-gradient(45% 40% at 8% 90%, var(--op-approved-soft), transparent 70%)",
                }}
            />
            <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
                {/* ── Left: the thesis ── */}
                <div>
                    <p
                        className="op-rise op-d1 mb-6 inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-[12px] font-medium uppercase tracking-[0.14em]"
                        style={{ borderColor: "var(--op-line)", color: "var(--op-ink-soft)", fontFamily: "var(--font-mono)" }}
                    >
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--op-approved)" }} />
                        AI workforce · human control
                    </p>

                    <h1
                        className="op-rise op-d2 font-display font-extrabold"
                        style={{ fontSize: "clamp(2.7rem, 5.4vw, 4.2rem)", lineHeight: 1.03, letterSpacing: "-0.03em" }}
                    >
                        Hire AI workers that ship —
                        <br />
                        <span style={{ color: "var(--op-indigo)" }}>behind your approval.</span>
                    </h1>

                    <p className="op-rise op-d3 mt-6 max-w-[46ch] text-[1.075rem] leading-relaxed" style={{ color: "var(--op-muted)" }}>
                        Thirteen specialist workers that do the real work — write the code, send the
                        outreach, run the interview, close the deal — and stop at an approval gate
                        before anything risky reaches your customers, code, or production.
                    </p>

                    <div className="op-rise op-d4 mt-9 flex flex-wrap items-center gap-3">
                        <Link
                            href="/get-started"
                            className="rounded-lg px-5 py-3 text-[15px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                            style={{ background: "var(--op-indigo)" }}
                        >
                            Start free — no card
                        </Link>
                        <Link
                            href="/book-demo"
                            className="rounded-lg border bg-white px-5 py-3 text-[15px] font-semibold transition-colors hover:bg-[var(--op-paper-2)]"
                            style={{ borderColor: "var(--op-line)", color: "var(--op-ink)" }}
                        >
                            Book a demo
                        </Link>
                    </div>

                    <dl className="op-rise op-d5 mt-10 flex flex-wrap gap-x-8 gap-y-3" style={{ fontFamily: "var(--font-mono)" }}>
                        {[
                            ["13", "specialist workers"],
                            ["100%", "actions audit-covered"],
                            ["0", "risky actions un-gated"],
                        ].map(([n, l]) => (
                            <div key={l}>
                                <dt className="text-[1.4rem] font-semibold" style={{ color: "var(--op-ink)" }}>{n}</dt>
                                <dd className="text-[12px] uppercase tracking-wide" style={{ color: "var(--op-muted)" }}>{l}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                {/* ── Right: the signature — live approval-gate card (light) ── */}
                <div className="op-rise op-d6 relative">
                    <div className="rounded-2xl border bg-white p-1.5 shadow-xl" style={{ borderColor: "var(--op-line)" }}>
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
                        <div className="rounded-xl p-5" style={{ background: "var(--op-paper-2)" }}>
                            <div className="flex items-center justify-between">
                                <span
                                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                                    style={{ fontFamily: "var(--font-mono)", color: tone.color, background: tone.soft }}
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
                            <p className="mt-1 text-[1.15rem] font-semibold" style={{ color: "var(--op-ink)" }}>
                                Send offer letter — Jordan Lee
                            </p>
                            <p className="mt-1 text-[13px]" style={{ color: "var(--op-ink-soft)" }}>
                                Staff Engineer · ₹42,00,000 · start Sep 1
                            </p>

                            <div className="my-4 h-px" style={{ background: "var(--op-line)" }} />

                            {state !== "approved" ? (
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={approve}
                                        className="flex-1 rounded-lg py-2.5 text-[14px] font-semibold text-white transition-transform hover:-translate-y-0.5"
                                        style={{ background: "var(--op-approved)" }}
                                    >
                                        {state === "approving" ? "Approving…" : "Approve"}
                                    </button>
                                    <button
                                        className="rounded-lg border bg-white px-4 py-2.5 text-[14px] font-medium"
                                        style={{ borderColor: "var(--op-line)", color: "var(--op-ink)", fontFamily: "var(--font-mono)" }}
                                    >
                                        Review diff
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <div
                                        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[14px] font-semibold"
                                        style={{ background: "var(--op-approved-soft)", color: "var(--op-approved)" }}
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
