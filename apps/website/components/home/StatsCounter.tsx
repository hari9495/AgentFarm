"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
    const [count, setCount] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: "-50px" });

    useEffect(() => {
        if (!inView) return;
        const duration = 1800;
        const start = performance.now();
        const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * to));
            if (progress < 1) requestAnimationFrame(tick);
            else setCount(to);
        };
        requestAnimationFrame(tick);
    }, [inView, to]);

    return (
        <span ref={ref}>
            {count.toLocaleString()}
            {suffix}
        </span>
    );
}

const stats = [
    {
        value: 21,
        suffix: "",
        accentColor: "#57c1ff",
        label: "Developer Skills",
        sub: "Create PR · CI Checks · Security Scan · and 18 more",
    },
    {
        value: 10,
        suffix: "",
        accentColor: "#59d499",
        label: "LLM Providers",
        sub: "OpenAI · Anthropic · Azure · Google · Mistral · and more",
    },
    {
        value: 100,
        suffix: "%",
        accentColor: "#ffc533",
        label: "Audit Coverage",
        sub: "Every action logged with evidence for compliance review",
    },
    {
        value: 9,
        suffix: " min",
        accentColor: "#ff6161",
        label: "Median Setup Time",
        sub: "From account creation to first AI teammate working",
    },
];

export default function StatsCounter() {
    return (
        <section className="bg-[#0d0d0d] border-y border-[#242728] py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#242728] rounded-xl overflow-hidden">
                    {stats.map((s, i) => (
                        <motion.div
                            key={s.label}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.08, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                            className="bg-[#0d0d0d] px-8 py-10 text-center flex flex-col items-center"
                        >
                            <p
                                className="text-4xl sm:text-5xl font-semibold tabular-nums leading-none tracking-tight"
                                style={{ color: s.accentColor }}
                            >
                                <Counter to={s.value} suffix={s.suffix} />
                            </p>
                            <p className="mt-3 text-sm font-semibold text-[#f4f4f6]">{s.label}</p>
                            <p className="mt-1.5 text-[11px] text-[#6a6b6c] leading-snug max-w-[160px]">{s.sub}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
