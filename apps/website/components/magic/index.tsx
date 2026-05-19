"use client";

/**
 * Magic v2 — shared futuristic UI primitives.
 *
 * Pure CSS-driven (uses tokens from globals.css). Safe in both website and
 * dashboard. No external state, no SSR pitfalls — every component renders
 * deterministic markup and progressively enhances with motion if available.
 */

import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import {
    createElement,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type ElementType,
    type ReactNode,
} from "react";

/* ─────────────────────────────────────────────────────────────────────── */
/* AuroraBackground — drop-in animated background for any section/page.    */
/* ─────────────────────────────────────────────────────────────────────── */

export function AuroraBackground({
    grid = true,
    grain = true,
    scan = false,
    className = "",
}: {
    grid?: boolean;
    grain?: boolean;
    scan?: boolean;
    className?: string;
}) {
    return (
        <div aria-hidden className={`aurora-bg ${className}`}>
            <div className="orb orb-3" />
            <div className="orb orb-4" />
            {grid ? <div className="cyber-grid" /> : null}
            {grain ? <div className="magic-grain" /> : null}
            {scan ? <div className="scan-lines" /> : null}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* HoloText — animated holographic gradient text.                          */
/* ─────────────────────────────────────────────────────────────────────── */

export function HoloText({
    children,
    as,
    tight = false,
    className = "",
    style,
}: {
    children: ReactNode;
    as?: ElementType;
    tight?: boolean;
    className?: string;
    style?: CSSProperties;
}) {
    const cls = `${tight ? "holo-text-tight" : "holo-text"} ${className}`;
    if (as) {
        return createElement(as, { className: cls, style }, children);
    }
    return (
        <span className={cls} style={style}>
            {children}
        </span>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* NeonChip — pill with glowing dot.                                       */
/* ─────────────────────────────────────────────────────────────────────── */

export type NeonChipTone = "cyan" | "violet" | "mint" | "rose";

export function NeonChip({
    children,
    tone = "cyan",
    dot = true,
    className = "",
}: {
    children: ReactNode;
    tone?: NeonChipTone;
    dot?: boolean;
    className?: string;
}) {
    return (
        <span className={`neon-chip neon-chip-${tone} ${className}`}>
            {dot ? <span className="dot" aria-hidden /> : null}
            {children}
        </span>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* MagicButton — sheen-sweep primary or glass ghost.                       */
/* ─────────────────────────────────────────────────────────────────────── */

export function MagicButton({
    children,
    href,
    onClick,
    variant = "primary",
    className = "",
    type = "button",
    as,
    ...rest
}: {
    children: ReactNode;
    href?: string;
    onClick?: () => void;
    variant?: "primary" | "ghost";
    className?: string;
    type?: "button" | "submit";
    as?: "a" | "button";
} & Record<string, unknown>) {
    const cls = `magic-btn magic-btn-${variant} ${className}`;
    const tag: ElementType = as ?? (href ? "a" : "button");
    const props: Record<string, unknown> = { className: cls, ...rest };
    if (href) props.href = href;
    if (onClick) props.onClick = onClick;
    if (tag === "button") props.type = type;
    return createElement(tag, props, children);
}

/* ─────────────────────────────────────────────────────────────────────── */
/* GlowCard — glass card with optional holographic edge + mouse spotlight. */
/* ─────────────────────────────────────────────────────────────────────── */

export function GlowCard({
    children,
    edge = true,
    spotlight = true,
    elevated = false,
    className = "",
    style,
}: {
    children: ReactNode;
    edge?: boolean;
    spotlight?: boolean;
    elevated?: boolean;
    className?: string;
    style?: CSSProperties;
}) {
    const ref = useRef<HTMLDivElement | null>(null);

    function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
        if (!spotlight) return;
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    }

    const cls = [
        "glass-card",
        elevated ? "glass-card-elev" : "",
        edge ? "holo-edge" : "",
        spotlight ? "spotlight" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div ref={ref} className={cls} style={style} onMouseMove={handleMouseMove}>
            {children}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* ScrollReveal — fades + un-blurs children on enter viewport.             */
/* ─────────────────────────────────────────────────────────────────────── */

export function ScrollReveal({
    children,
    delay = 0,
    once = true,
    className = "",
}: {
    children: ReactNode;
    delay?: number;
    once?: boolean;
    className?: string;
}) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ once, margin: "-80px" }}
        >
            {children}
        </motion.div>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* BrutalStat — oversized stat with hard offset shadow.                    */
/* ─────────────────────────────────────────────────────────────────────── */

export function BrutalStat({
    value,
    label,
    className = "",
}: {
    value: ReactNode;
    label: ReactNode;
    className?: string;
}) {
    return (
        <div className={`brutal-plate ${className}`}>
            <span className="text-[1.7rem] sm:text-[2rem] font-black leading-none tracking-tight">
                {value}
            </span>
            <span className="text-[0.65rem] uppercase tracking-[0.16em] opacity-70 font-semibold">
                {label}
            </span>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* CursorAura — soft cursor-following blob anchored to the parent.         */
/* Use inside a `position: relative` container.                            */
/* ─────────────────────────────────────────────────────────────────────── */

export function CursorAura({
    color = "rgba(0, 229, 255, 0.35)",
    size = 360,
}: {
    color?: string;
    size?: number;
}) {
    const x = useMotionValue(-1000);
    const y = useMotionValue(-1000);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function onMove(e: PointerEvent) {
            const parent = ref.current?.parentElement;
            if (!parent) return;
            const r = parent.getBoundingClientRect();
            x.set(e.clientX - r.left);
            y.set(e.clientY - r.top);
        }
        const node = ref.current?.parentElement;
        node?.addEventListener("pointermove", onMove);
        return () => node?.removeEventListener("pointermove", onMove);
    }, [x, y]);

    const bg = useMotionTemplate`radial-gradient(${size}px circle at ${x}px ${y}px, ${color}, transparent 60%)`;

    return (
        <motion.div
            ref={ref}
            aria-hidden
            style={{ background: bg }}
            className="pointer-events-none absolute inset-0 z-0 mix-blend-screen"
        />
    );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* MagicCount — counts up to a target on mount with easing.                */
/* ─────────────────────────────────────────────────────────────────────── */

export function MagicCount({
    to,
    duration = 1400,
    prefix = "",
    suffix = "",
    className = "",
}: {
    to: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
    className?: string;
}) {
    const [val, setVal] = useState(0);

    useEffect(() => {
        let raf = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setVal(Math.round(eased * to));
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [to, duration]);

    return (
        <span className={className}>
            {prefix}
            {val.toLocaleString()}
            {suffix}
        </span>
    );
}
