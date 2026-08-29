'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * Dark-editorial / Swiss-print design system (scoped to any element with the
 * `wf` class). LIGHT default (black-on-white), DARK under [data-theme="dark"];
 * both share one flat, hairline, sharp structure. Remaps --bg/--card/--line/
 * --ink/--accent so token-driven inline styles inside .wf follow the theme.
 *
 * Usage: <div className="wf"><style>{WF_CSS}</style> … </div>
 */
export const WF_CSS = `
.wf {
    --paper: #FBFAF7; --panel: #FFFFFF;
    --ink: #14140F; --ink-soft: #4A4A44; --ink-muted: #8C8C84;
    --rule: rgba(20,20,15,0.15); --signal: #D6301F;
    --bg: var(--paper); --card: var(--panel); --line: var(--rule); --accent: var(--signal);
    background: var(--paper); color: var(--ink);
    font-family: var(--font-inter), -apple-system, sans-serif; -webkit-font-smoothing: antialiased;
}
[data-theme="dark"] .wf {
    --paper: #0C0C0E; --panel: #141417;
    --ink: #ECECEC; --ink-soft: #B4B4B8; --ink-muted: #7C7C82;
    --rule: rgba(255,255,255,0.14); --signal: #E5484D;
}
.wf svg { stroke-width: 1.5px; }
.wf .wf-display { font-family: var(--font-fraunces), Georgia, 'Times New Roman', serif; letter-spacing: -0.015em; font-weight: 600; }
.wf .wf-eyebrow { font-family: var(--font-plex-mono), monospace; text-transform: uppercase; letter-spacing: 0.16em; font-size: 10px; color: var(--ink-muted); }
.wf .wf-mono { font-family: var(--font-plex-mono), monospace; }
.wf button, .wf input, .wf select, .wf textarea { border-radius: 2px !important; box-shadow: none !important; }
.wf button { transition: background 60ms linear, color 60ms linear, border-color 60ms linear !important; }
/* Magazine-index rows */
.wf .wf-row { border-radius: 0 !important; border: 0 !important; border-top: 1px solid var(--rule) !important; background: transparent !important; }
.wf .wf-row:last-child { border-bottom: 1px solid var(--rule) !important; }
.wf .wf-row:hover { background: color-mix(in srgb, var(--ink) 5%, transparent) !important; }
.wf .wf-row[data-selected="true"] { background: color-mix(in srgb, var(--signal) 12%, transparent) !important; box-shadow: inset 2px 0 0 var(--signal) !important; }
/* Buttons: hard invert on hover */
.wf .wf-primary { background: var(--signal) !important; color: #FBFAF7 !important; border: 1px solid var(--signal) !important; font-weight: 600 !important; }
.wf .wf-primary:hover { background: transparent !important; color: var(--signal) !important; }
.wf .wf-ghost { background: transparent !important; color: var(--ink-soft) !important; border: 1px solid var(--rule) !important; }
.wf .wf-ghost:hover { background: var(--ink) !important; color: var(--paper) !important; border-color: var(--ink) !important; }
/* Panels: hairline, no radius */
.wf .wf-panel { border-radius: 2px !important; box-shadow: none !important; border: 1px solid var(--rule) !important; background: var(--panel) !important; }
/* Print-ledger table: border-sharing matrix, mono figures */
.wf .ledger { width: 100%; border-collapse: collapse; }
.wf .ledger thead th { text-align: left; font-family: var(--font-plex-mono), monospace; text-transform: uppercase; letter-spacing: 0.12em; font-size: 10px; color: var(--ink-muted); font-weight: 500; padding: 10px 14px; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); white-space: nowrap; cursor: pointer; }
.wf .ledger tbody td { padding: 11px 14px; border-bottom: 1px solid var(--rule); font-size: 12.5px; color: var(--ink); vertical-align: top; }
.wf .ledger tbody tr:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.wf .ledger .num { font-family: var(--font-plex-mono), monospace; color: var(--ink-muted); white-space: nowrap; }
`;

/** Light/dark toggle — shares the app-wide `af_theme` key so it syncs everywhere. */
export function WfThemeToggle() {
    const [dark, setDark] = useState(false);
    useEffect(() => {
        const stored = localStorage.getItem('af_theme');
        const d = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
        setDark(d);
        document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
    }, []);
    const toggle = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
        localStorage.setItem('af_theme', next ? 'dark' : 'light');
    };
    return (
        <button className="wf-ghost" onClick={toggle} aria-label="Toggle light or dark mode"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
            {dark ? <Sun size={13} /> : <Moon size={13} />} {dark ? 'Light' : 'Dark'}
        </button>
    );
}

/**
 * Editorial image — grayscale + luminosity-blend on a #0B0C0E ground so mismatched
 * logos/photos melt into one tonal system. No rounding. Use for brand/editorial
 * imagery, NOT functional screenshots/charts that must stay readable in colour.
 */
export function EditorialImage({ src, alt, className = '', style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
    return (
        <span style={{ display: 'inline-block', background: '#0B0C0E', overflow: 'hidden', ...style }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className={`grayscale contrast-125 mix-blend-luminosity brightness-90 ${className}`}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: 0 }} />
        </span>
    );
}
