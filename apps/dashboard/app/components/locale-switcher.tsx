'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'af_locale';

type LocaleOption = { code: string; label: string; flag: string };

const LOCALES: LocaleOption[] = [
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'pt', label: 'Português', flag: '🇧🇷' },
];

export function LocaleSwitcher() {
    const [locale, setLocale] = useState('en');
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY) ?? 'en';
        setLocale(stored);
        document.documentElement.setAttribute('lang', stored);
        setMounted(true);
    }, []);

    const select = (code: string) => {
        setLocale(code);
        document.documentElement.setAttribute('lang', code);
        localStorage.setItem(STORAGE_KEY, code);
        setOpen(false);
    };

    if (!mounted) return null;

    const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]!;

    return (
        <div style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left"
                style={{ color: 'var(--ink-muted)' }}
                aria-label="Switch language"
            >
                <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{current.flag}</span>
                <span style={{ flex: 1, fontSize: '0.82rem' }}>{current.label}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>
            {open && (
                <div style={{
                    position: 'absolute',
                    bottom: '110%',
                    left: 0,
                    right: 0,
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 100,
                    overflow: 'hidden',
                }}>
                    {LOCALES.map((l) => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => select(l.code)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                background: l.code === locale ? 'var(--brand-light)' : 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.82rem',
                                color: l.code === locale ? 'var(--brand)' : 'var(--ink-soft)',
                                fontWeight: l.code === locale ? 700 : 400,
                                fontFamily: 'inherit',
                                textAlign: 'left',
                            }}
                        >
                            <span>{l.flag}</span>
                            <span>{l.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
