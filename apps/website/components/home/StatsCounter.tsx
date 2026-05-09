"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

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
        label: "Developer Skills in Marketplace",
        sub: "Create PR · CI Checks · Security Scan · and 18 more",
    },
    {
        value: 10,
        suffix: "",
        label: "LLM Providers with Fallback",
        sub: "OpenAI · Anthropic · Azure · Google · Mistral · and more",
    },
    {
        value: 100,
        suffix: "%",
        label: "Actions Under Audit Coverage",
        sub: "Every action logged with evidence for compliance review",
    },
    {
        value: 9,
        suffix: " min",
        label: "Median Workspace Setup Time",
        sub: "From account creation to first AI teammate working",
    },
];

export default function StatsCounter() {
    return (
        <section className="bg-slate-950 py-16 border-y border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center text-white">
                    {stats.map((s, i) => (
                        <motion.div
                            key={s.label}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1, duration: 0.5 }}
                        >
                            <p className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent tabular-nums">
                                <Counter to={s.value} suffix={s.suffix} />
                            </p>
                            <p className="mt-2 text-slate-200 text-sm font-semibold">{s.label}</p>
                            <p className="mt-1 text-slate-500 text-xs leading-snug">{s.sub}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
