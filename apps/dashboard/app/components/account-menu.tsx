'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, ChevronDown } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { LocaleSwitcher } from './locale-switcher';

// Compact top-bar account button: avatar → dropdown (workspace identity,
// dark mode, language, sign out). Portalled to <body> so no transformed or
// overflow-hidden ancestor can clip the fixed panel.
export function AccountMenu({ workspaceName }: { workspaceName: string }) {
    const ref = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

    const toggle = () => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
        setOpen((v) => !v);
    };

    useEffect(() => {
        if (!open) return;
        const close = () => setOpen(false);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        return () => {
            window.removeEventListener('resize', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [open]);

    const signOut = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        document.cookie = 'agentfarm_internal_session=; path=/; max-age=0; samesite=strict';
        window.location.href = '/login';
    };

    const initials = workspaceName.slice(0, 2).toUpperCase();

    return (
        <>
            <button
                ref={ref}
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                title={workspaceName}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 7px 3px 3px', borderRadius: 999,
                    border: '1px solid var(--line)', background: 'var(--card)',
                    cursor: 'pointer', boxShadow: 'var(--shadow-sm)', lineHeight: 1,
                }}
            >
                <span style={{
                    height: 26, width: 26, borderRadius: 999, background: '#fee2e2',
                    color: '#dc2626', fontSize: 11, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{initials}</span>
                <ChevronDown size={14} aria-hidden="true"
                    style={{ color: 'var(--ink-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {open && pos && typeof document !== 'undefined' && createPortal(
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setOpen(false)} aria-hidden="true" />
                    <div role="menu" style={{
                        position: 'fixed', top: pos.top, right: pos.right, width: 240, zIndex: 61,
                        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
                        boxShadow: 'var(--shadow-lg)', padding: 6,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 10px' }}>
                            <span style={{
                                height: 32, width: 32, borderRadius: 999, background: '#fee2e2', color: '#dc2626',
                                fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>{initials}</span>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{workspaceName}</div>
                                <div style={{ fontSize: 10, color: 'var(--ink-muted)' }}>Active workspace</div>
                            </div>
                        </div>
                        <div style={{ height: 1, background: 'var(--line)', margin: '2px 0 4px' }} />
                        <ThemeToggle />
                        <LocaleSwitcher openUp={false} />
                        <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                        <button type="button" onClick={signOut} role="menuitem" style={{
                            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                            padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: 13, color: 'var(--ink-muted)', fontFamily: 'inherit',
                        }}>
                            <LogOut size={16} aria-hidden="true" />
                            <span>Sign out</span>
                        </button>
                    </div>
                </>,
                document.body,
            )}
        </>
    );
}
