"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const quotes = [
    {
        quote: "We shipped a feature in 2 days that would have taken our contractor 3 weeks. Zero back-and-forth.",
        author: "CTO, YC-backed startup",
        rating: 5,
    },
    {
        quote: "The approval workflow gives us exactly the governance our enterprise security team demanded.",
        author: "VP Engineering, Series B SaaS",
        rating: 5,
    },
    {
        quote: "Our AI backend developer opened 11 PRs this week. Every single one passed CI on first try.",
        author: "Engineering Lead, TechCorp",
        rating: 5,
    },
    {
        quote: "We replaced a QA contractor role entirely. Reliability is 99.6% — better than any human I've hired.",
        author: "Head of Product, BuildFast",
        rating: 5,
    },
];

export default function SocialProofBar() {
    const [idx, setIdx] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        intervalRef.current = setInterval(() => {
            setIdx((i) => (i + 1) % quotes.length);
        }, 4800);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const current = quotes[idx];

    return (
        <section className="bg-[var(--surface)] border-y border-[var(--hairline)] py-10">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div className="flex justify-center gap-0.5 mb-4">
                    {Array.from({ length: current.rating }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 text-[var(--accent-yellow)] fill-[var(--accent-yellow)]" />
                    ))}
                </div>
                <AnimatePresence mode="wait">
                    <motion.p
                        key={idx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                        className="text-base sm:text-lg font-medium text-[var(--ink)] leading-relaxed max-w-2xl mx-auto"
                    >
                        &ldquo;{current.quote}&rdquo;
                    </motion.p>
                </AnimatePresence>
                <p className="mt-3 text-sm text-[var(--mute)] font-semibold">{current.author}</p>
                <div className="mt-5 flex justify-center gap-1.5">
                    {quotes.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIdx(i)}
                            className={`h-1.5 rounded-full transition-all ${i === idx ? "bg-[var(--accent-blue)] w-4" : "bg-[var(--hairline)] w-1.5"}`}
                            aria-label={`Go to quote ${i + 1}`}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}

