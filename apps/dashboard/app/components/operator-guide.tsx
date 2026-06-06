'use client';

import { useState } from 'react';

export type GuideItem = {
    label: string;
    hint: string;
    level: 'verify' | 'caution' | 'critical';
};

export type OperatorGuideProps = {
    title?: string;
    intro?: string;
    items: GuideItem[];
    defaultOpen?: boolean;
};

const LEVEL_STYLE: Record<GuideItem['level'], { dot: string; label: string; bg: string; border: string; text: string }> = {
    verify:   { dot: 'var(--ok)', label: 'Verify',   bg: 'var(--ok-bg)', border: 'var(--ok)', text: 'var(--ok)' },
    caution:  { dot: 'var(--warn)', label: 'Caution',  bg: 'var(--warn-bg)', border: 'var(--warn)', text: 'var(--warn)' },
    critical: { dot: 'var(--danger)', label: 'Must check', bg: 'var(--danger-bg)', border: 'var(--danger-bg)', text: 'var(--danger)' },
};

export default function OperatorGuide({ title = 'Operator Guide', intro, items, defaultOpen = false }: OperatorGuideProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div style={{ border: '1px solid var(--info-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16, background: 'var(--bg)' }}>
            {/* Header toggle */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, color: 'var(--accent)',
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 14 }}>🧭</span>
                    {title}
                    <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: 'var(--info-bg)', color: 'var(--accent)',
                    }}>
                        {items.filter(i => i.level === 'critical').length} critical · {items.filter(i => i.level === 'caution').length} caution
                    </span>
                </span>
                <span style={{ fontSize: 16, color: 'var(--accent)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
            </button>

            {open && (
                <div style={{ borderTop: '1px solid #e0e7ff', padding: '12px 14px' }}>
                    {intro && (
                        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.5 }}>{intro}</p>
                    )}
                    <div style={{ display: 'grid', gap: 8 }}>
                        {items.map((item, i) => {
                            const s = LEVEL_STYLE[item.level];
                            return (
                                <div key={i} style={{
                                    display: 'flex', gap: 10, padding: '8px 10px',
                                    background: s.bg, border: `1px solid ${s.border}`, borderRadius: 7,
                                }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 4 }} />
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: s.text, marginBottom: 2 }}>
                                            {item.label}
                                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, opacity: 0.75 }}>[{s.label}]</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.5 }}>{item.hint}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
