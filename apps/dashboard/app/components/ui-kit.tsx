'use client';

/**
 * Editorial UI kit — the shared React primitive layer for the dashboard.
 *
 * One typed component per primitive, all bound to the global petrol/Ink&Petrol
 * tokens (var(--accent), --ink, --card, --line, --ok/--warn/--danger) so they
 * follow light/dark automatically. Styling lives in UK_CSS (scoped to `.uk`),
 * so a page opts in by wrapping its tree in <UiKit> once — no `.wf` needed.
 *
 * Aesthetic: flat, hairline, sharp (≤3px), Fraunces for display, IBM Plex Mono
 * for figures/labels, hard instant hover. Replaces the ad-hoc class primitives.
 */

import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

export const UK_CSS = `
.uk, .uk * { box-sizing: border-box; }
.uk { font-family: var(--font-inter), -apple-system, sans-serif; color: var(--ink); }
.uk-mono { font-family: var(--font-plex-mono), ui-monospace, monospace; }
.uk-display { font-family: var(--font-fraunces), Georgia, serif; letter-spacing: -0.015em; font-weight: 600; line-height: 1; }
.uk-eyebrow { font-family: var(--font-plex-mono), monospace; text-transform: uppercase; letter-spacing: 0.16em; font-size: 10px; color: var(--ink-muted); }

/* Button */
.uk-btn { font-family: var(--font-inter), sans-serif; font-size: 12.5px; font-weight: 600; line-height: 1;
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 3px; cursor: pointer;
  border: 1px solid transparent; transition: background 90ms linear, color 90ms linear, border-color 90ms linear; white-space: nowrap; }
.uk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.uk-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.uk-btn--primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.uk-btn--primary:hover:not(:disabled) { background: transparent; color: var(--accent); }
.uk-btn--ghost { background: transparent; color: var(--ink-soft); border-color: var(--line); }
.uk-btn--ghost:hover:not(:disabled) { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.uk-btn--danger { background: transparent; color: var(--danger); border-color: var(--danger-border); }
.uk-btn--danger:hover:not(:disabled) { background: var(--danger); color: #fff; border-color: var(--danger); }
.uk-btn--sm { padding: 5px 10px; font-size: 11.5px; }

/* Badge */
.uk-badge { font-family: var(--font-plex-mono), monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em;
  padding: 2px 7px; border-radius: 2px; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.uk-badge--ok { color: var(--ok); background: color-mix(in srgb, var(--ok) 13%, transparent); border-color: color-mix(in srgb, var(--ok) 30%, transparent); }
.uk-badge--warn { color: var(--warn); background: color-mix(in srgb, var(--warn) 13%, transparent); border-color: color-mix(in srgb, var(--warn) 30%, transparent); }
.uk-badge--err { color: var(--danger); background: color-mix(in srgb, var(--danger) 13%, transparent); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
.uk-badge--accent { color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
.uk-badge--neutral { color: var(--ink-muted); background: color-mix(in srgb, var(--ink) 7%, transparent); border-color: var(--line); }

/* Inputs */
.uk-input, .uk-select { font-family: var(--font-inter), sans-serif; font-size: 13px; color: var(--ink); background: var(--card);
  border: 1px solid var(--line); border-radius: 3px; padding: 8px 11px; outline: none; width: 100%; transition: border-color 90ms linear; }
.uk-input:focus, .uk-select:focus { border-color: var(--accent); }
.uk-input::placeholder { color: var(--ink-muted); }
.uk-select { appearance: none; cursor: pointer; padding-right: 28px; }

/* Panel */
.uk-panel { background: var(--card); border: 1px solid var(--line); border-radius: 3px; }
.uk-panel__head { padding: 14px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.uk-panel__body { padding: 16px; }

/* Tabs */
.uk-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--line); overflow-x: auto; }
.uk-tab { font-family: var(--font-plex-mono), monospace; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10.5px;
  padding: 12px 14px; background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer;
  color: var(--ink-muted); white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; margin-bottom: -1px; }
.uk-tab:hover { color: var(--ink); }
.uk-tab[data-active="true"] { color: var(--accent); border-bottom-color: var(--accent); }

/* Ledger table */
.uk-ledger { width: 100%; border-collapse: collapse; }
.uk-ledger thead th { text-align: left; font-family: var(--font-plex-mono), monospace; text-transform: uppercase; letter-spacing: 0.1em;
  font-size: 9.5px; color: var(--ink-muted); font-weight: 500; padding: 9px 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); white-space: nowrap; }
.uk-ledger tbody td { padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 12.5px; color: var(--ink); vertical-align: top; }
.uk-ledger tbody tr:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
.uk-ledger .uk-num { font-family: var(--font-plex-mono), monospace; color: var(--ink-muted); white-space: nowrap; }

/* Stat */
.uk-stat__n { font-family: var(--font-fraunces), Georgia, serif; font-weight: 600; font-size: 26px; line-height: 1; }
.uk-stat__k { font-family: var(--font-plex-mono), monospace; text-transform: uppercase; letter-spacing: 0.12em; font-size: 9px; color: var(--ink-muted); margin-top: 5px; }
`;

/** Wrap a page/section once to activate the kit's scoped styles. */
export function UiKit({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
    return (
        <div className={`uk ${className}`} style={style}>
            <style>{UK_CSS}</style>
            {children}
        </div>
    );
}

type BtnVariant = 'primary' | 'ghost' | 'danger';
export function Button({ variant = 'ghost', size, className = '', children, ...rest }: { variant?: BtnVariant; size?: 'sm' } & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button className={`uk-btn uk-btn--${variant}${size === 'sm' ? ' uk-btn--sm' : ''} ${className}`} {...rest}>
            {children}
        </button>
    );
}

type Tone = 'ok' | 'warn' | 'err' | 'accent' | 'neutral';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
    return <span className={`uk-badge uk-badge--${tone}`}>{children}</span>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={`uk-input ${props.className ?? ''}`} {...props} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
    return <select className={`uk-select ${props.className ?? ''}`} {...props}>{children}</select>;
}

export function Panel({ title, action, children, style }: { title?: ReactNode; action?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
    return (
        <div className="uk-panel" style={style}>
            {(title || action) && (
                <div className="uk-panel__head">
                    <span className="uk-display" style={{ fontSize: 15 }}>{title}</span>
                    {action}
                </div>
            )}
            <div className="uk-panel__body">{children}</div>
        </div>
    );
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string; icon?: ReactNode }[]; active: T; onChange: (k: T) => void }) {
    return (
        <div className="uk-tabs" role="tablist">
            {tabs.map((t) => (
                <button key={t.key} role="tab" aria-selected={active === t.key} data-active={active === t.key} className="uk-tab" onClick={() => onChange(t.key)}>
                    {t.icon}{t.label}
                </button>
            ))}
        </div>
    );
}

export function Stat({ n, k, tone }: { n: ReactNode; k: string; tone?: 'accent' | 'ok' | 'warn' | 'err' | 'muted' }) {
    const color = tone === 'accent' ? 'var(--accent)' : tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)'
        : tone === 'err' ? 'var(--danger)' : tone === 'muted' ? 'var(--ink-muted)' : 'var(--ink)';
    return (
        <div>
            <div className="uk-stat__n" style={{ color }}>{n}</div>
            <div className="uk-stat__k">{k}</div>
        </div>
    );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
    return <div className="uk-eyebrow" style={style}>{children}</div>;
}

export function Display({ children, size = 32, style }: { children: ReactNode; size?: number; style?: React.CSSProperties }) {
    return <div className="uk-display" style={{ fontSize: size, ...style }}>{children}</div>;
}

/** Editorial masthead: eyebrow + Fraunces title on the left, actions on the right. */
export function Masthead({ eyebrow, title, actions, stats }: { eyebrow: string; title: ReactNode; actions?: ReactNode; stats?: ReactNode }) {
    return (
        <header style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)', padding: '16px 28px 20px' }}>
            {actions && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>{actions}</div>}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
                <div>
                    <Eyebrow style={{ marginBottom: 6 }}>{eyebrow}</Eyebrow>
                    <Display size={34}>{title}</Display>
                </div>
                {stats && <div style={{ display: 'flex', gap: 30 }}>{stats}</div>}
            </div>
        </header>
    );
}
