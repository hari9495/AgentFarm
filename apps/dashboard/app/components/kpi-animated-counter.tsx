'use client';

import { useEffect, useRef, useState } from 'react';

type KpiAnimatedCounterProps = {
    value: string;
};

/** Splits a raw value string into (optional-prefix)(numeric-core)(suffix).
 *  e.g. "42" → { prefix: "", numeric: 42, suffix: "" }
 *       "15m" → { prefix: "", numeric: 15, suffix: "m" }
 *       "2 restarts" → { prefix: "", numeric: 2, suffix: " restarts" }
 *       "Healthy" → { prefix: "Healthy", numeric: null, suffix: "" }
 */
function parseValue(raw: string): { prefix: string; numeric: number | null; suffix: string } {
    const m = raw.match(/^([^0-9-]*)(-?[0-9]+(?:\.[0-9]+)?)(.*)$/);
    if (m) {
        return { prefix: m[1], numeric: Number(m[2]), suffix: m[3] };
    }
    return { prefix: raw, numeric: null, suffix: '' };
}

const DURATION_MS = 860;

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

export function KpiAnimatedCounter({ value }: KpiAnimatedCounterProps) {
    const [displayed, setDisplayed] = useState(value);
    const [flashing, setFlashing] = useState(false);
    const prevRef = useRef(value);
    const rafRef = useRef<number | null>(null);

    // Drive the count-up animation
    useEffect(() => {
        const prev = prevRef.current;
        prevRef.current = value;

        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        const parsed = parseValue(value);
        const isFirstRender = prev === value;

        if (parsed.numeric === null) {
            if (!isFirstRender) setFlashing(true);
            setDisplayed(value);
            return;
        }

        if (!isFirstRender) setFlashing(true);

        const target = parsed.numeric;
        const parsedPrev = parseValue(prev);
        const startNum = isFirstRender ? 0 : (parsedPrev.numeric ?? 0);
        const isFloat = String(target).includes('.');
        const startTime = performance.now();

        const tick = (now: number) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / DURATION_MS, 1);
            const current = startNum + (target - startNum) * easeOutCubic(t);
            const formatted = isFloat ? current.toFixed(1) : String(Math.round(current));
            setDisplayed(`${parsed.prefix}${formatted}${parsed.suffix}`);
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
            }
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [value]);

    // Clear flash state after animation completes
    useEffect(() => {
        if (!flashing) return;
        const timer = setTimeout(() => setFlashing(false), 680);
        return () => clearTimeout(timer);
    }, [flashing]);

    return (
        <p
            className={`metric-value${flashing ? ' kpi-flash' : ''}`}
            aria-live="polite"
            aria-atomic="true"
        >
            {displayed}
        </p>
    );
}
