"use client";

/**
 * Count-up number that animates when scrolled into view. Parses a display stat
 * like "10M+", "$157k", "73 days", "40%" into prefix + number + suffix and
 * animates just the numeric part. Respects prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from "react";
import { useInView, useMotionValue, animate } from "motion/react";

function parse(value: string) {
    const m = value.match(/^(\D*?)([\d,]*\.?\d+)(.*)$/);
    if (!m) return { prefix: "", num: null as number | null, suffix: value, decimals: 0 };
    const raw = m[2].replace(/,/g, "");
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    return { prefix: m[1], num: parseFloat(raw), suffix: m[3], decimals };
}

export function AnimatedNumber({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: "-40px" });
    const mv = useMotionValue(0);
    const { prefix, num, suffix, decimals } = parse(value);
    const [display, setDisplay] = useState(num === null ? value : `${prefix}0${suffix}`);

    useEffect(() => {
        if (num === null) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!inView) return;
        if (reduced) {
            setDisplay(`${prefix}${num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`);
            return;
        }
        const controls = animate(mv, num, {
            duration: 1.6,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (latest) => {
                setDisplay(`${prefix}${latest.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`);
            },
        });
        return controls.stop;
    }, [inView, num, prefix, suffix, decimals, mv]);

    return <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>{display}</span>;
}
