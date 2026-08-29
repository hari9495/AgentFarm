"use client";

/**
 * Count-up number that animates when scrolled into view. Parses a display stat
 * like "10M+", "$157k", "73 days", "40%" into prefix + number + suffix and
 * animates just the numeric part.
 *
 * Correctness-first: the DISPLAYED default is always the real final value, so if
 * the in-view trigger never fires (reduced motion, no IntersectionObserver, a
 * hijacked scroll container), the true number still shows. The count-up is a
 * progressive enhancement that runs 0→value the first time it enters view.
 */

import { useEffect, useRef, useState } from "react";
import { useInView, useMotionValue, animate } from "motion/react";

function parse(value: string) {
    const m = value.match(/^(\D*?)([\d,]*\.?\d+)(.*)$/);
    if (!m) return { prefix: "", num: null as number | null, suffix: value, decimals: 0, grouped: false };
    const grouped = m[2].includes(",");
    const raw = m[2].replace(/,/g, "");
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    return { prefix: m[1], num: parseFloat(raw), suffix: m[3], decimals, grouped };
}

export function AnimatedNumber({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: "-40px" });
    const mv = useMotionValue(0);
    const { prefix, num, suffix, decimals, grouped } = parse(value);
    const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
    const finalStr = num === null ? value : `${prefix}${fmt(num)}${suffix}`;
    // Default to the REAL value — never render a placeholder 0 if the animation never runs.
    const [display, setDisplay] = useState(finalStr);

    useEffect(() => {
        if (num === null || !inView) return;
        const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced) return; // already showing finalStr
        mv.set(0);
        setDisplay(`${prefix}0${suffix}`);
        const controls = animate(mv, num, {
            duration: 1.6,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (latest) => setDisplay(`${prefix}${fmt(latest)}${suffix}`),
        });
        return controls.stop;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inView, num, prefix, suffix, decimals]);

    return <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>{display}</span>;
}
