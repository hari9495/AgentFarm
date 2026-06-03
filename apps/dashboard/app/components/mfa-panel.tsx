'use client';

import { useEffect, useState } from 'react';

type Step =
    | { kind: 'idle' }
    | { kind: 'setup-qr'; otpauth_uri: string; qr_code_svg: string }
    | { kind: 'setup-confirm' }
    | { kind: 'disable-confirm' };

type Status = 'loading' | 'enabled' | 'disabled';

export default function MfaPanel() {
    const [status, setStatus] = useState<Status>('loading');
    const [step, setStep] = useState<Step>({ kind: 'idle' });
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        void fetchStatus();
    }, []);

    async function fetchStatus() {
        setStatus('loading');
        try {
            const res = await fetch('/api/auth/mfa/status', { cache: 'no-store' });
            const data = (await res.json()) as { enabled?: boolean };
            setStatus(data.enabled ? 'enabled' : 'disabled');
        } catch {
            setStatus('disabled');
        }
    }

    function reset() {
        setStep({ kind: 'idle' });
        setCode('');
        setMessage(null);
        setBusy(false);
    }

    async function handleSetup() {
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch('/api/auth/mfa/setup', { method: 'POST' });
            const data = (await res.json()) as { otpauth_uri?: string; qr_code_svg?: string; error?: string; message?: string };
            if (!res.ok) {
                setMessage({ text: data.message ?? data.error ?? 'Setup failed.', ok: false });
                return;
            }
            setStep({ kind: 'setup-qr', otpauth_uri: data.otpauth_uri ?? '', qr_code_svg: data.qr_code_svg ?? '' });
        } catch {
            setMessage({ text: 'Network error. Please try again.', ok: false });
        } finally {
            setBusy(false);
        }
    }

    async function handleConfirm() {
        if (!code.trim()) return;
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch('/api/auth/mfa/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code.trim() }),
            });
            const data = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) {
                setMessage({ text: data.message ?? data.error ?? 'Confirmation failed.', ok: false });
                return;
            }
            setMessage({ text: 'MFA enabled. Your account is now protected.', ok: true });
            setStep({ kind: 'idle' });
            setCode('');
            setStatus('enabled');
        } catch {
            setMessage({ text: 'Network error. Please try again.', ok: false });
        } finally {
            setBusy(false);
        }
    }

    async function handleDisable() {
        if (!code.trim()) return;
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch('/api/auth/mfa/disable', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code.trim() }),
            });
            const data = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) {
                setMessage({ text: data.message ?? data.error ?? 'Failed to disable MFA.', ok: false });
                return;
            }
            setMessage({ text: 'MFA has been disabled.', ok: true });
            setStep({ kind: 'idle' });
            setCode('');
            setStatus('disabled');
        } catch {
            setMessage({ text: 'Network error. Please try again.', ok: false });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)' }}>
                        Multi-Factor Authentication
                    </h3>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
                        Require a TOTP code from an authenticator app on every login.
                    </p>
                </div>
                {status !== 'loading' && (
                    <span
                        style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            background: status === 'enabled' ? 'var(--green-bg, #d1fae5)' : 'var(--ink-muted-bg, #f3f4f6)',
                            color: status === 'enabled' ? 'var(--green, #065f46)' : 'var(--ink-muted)',
                        }}
                    >
                        {status === 'enabled' ? 'Enabled' : 'Disabled'}
                    </span>
                )}
            </div>

            {message && (
                <div
                    style={{
                        padding: '0.6rem 0.85rem',
                        borderRadius: '6px',
                        marginBottom: '1rem',
                        fontSize: '0.82rem',
                        background: message.ok ? 'var(--green-bg, #d1fae5)' : 'var(--red-bg, #fee2e2)',
                        color: message.ok ? 'var(--green, #065f46)' : 'var(--red, #991b1b)',
                    }}
                >
                    {message.text}
                </div>
            )}

            {status === 'loading' && (
                <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', margin: 0 }}>Loading…</p>
            )}

            {status === 'disabled' && step.kind === 'idle' && (
                <button
                    onClick={() => void handleSetup()}
                    disabled={busy}
                    className="btn btn-primary"
                    style={{ fontSize: '0.82rem' }}
                >
                    {busy ? 'Setting up…' : 'Set up authenticator'}
                </button>
            )}

            {status === 'disabled' && step.kind === 'setup-qr' && (
                <div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginTop: 0 }}>
                        Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code below.
                    </p>
                    <div
                        style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}
                        dangerouslySetInnerHTML={{ __html: step.qr_code_svg }}
                    />
                    <details style={{ marginBottom: '1rem' }}>
                        <summary style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', cursor: 'pointer' }}>
                            Can&apos;t scan? Copy the setup key manually
                        </summary>
                        <code
                            style={{
                                display: 'block',
                                marginTop: '0.5rem',
                                padding: '0.5rem',
                                background: 'var(--surface-2, #f9fafb)',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                wordBreak: 'break-all',
                            }}
                        >
                            {step.otpauth_uri}
                        </code>
                    </details>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            placeholder="6-digit code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            className="input"
                            style={{ width: '10rem', letterSpacing: '0.15em', fontSize: '1rem' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirm(); }}
                        />
                        <button
                            onClick={() => void handleConfirm()}
                            disabled={busy || code.length !== 6}
                            className="btn btn-primary"
                            style={{ fontSize: '0.82rem' }}
                        >
                            {busy ? 'Verifying…' : 'Confirm'}
                        </button>
                        <button
                            onClick={reset}
                            disabled={busy}
                            className="btn btn-ghost"
                            style={{ fontSize: '0.82rem' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {status === 'enabled' && step.kind === 'idle' && (
                <button
                    onClick={() => { setStep({ kind: 'disable-confirm' }); setMessage(null); }}
                    className="btn btn-danger"
                    style={{ fontSize: '0.82rem' }}
                >
                    Disable MFA
                </button>
            )}

            {status === 'enabled' && step.kind === 'disable-confirm' && (
                <div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginTop: 0 }}>
                        Enter your current authenticator code to confirm you want to disable MFA.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            placeholder="6-digit code"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            className="input"
                            style={{ width: '10rem', letterSpacing: '0.15em', fontSize: '1rem' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') void handleDisable(); }}
                        />
                        <button
                            onClick={() => void handleDisable()}
                            disabled={busy || code.length !== 6}
                            className="btn btn-danger"
                            style={{ fontSize: '0.82rem' }}
                        >
                            {busy ? 'Disabling…' : 'Disable MFA'}
                        </button>
                        <button
                            onClick={reset}
                            disabled={busy}
                            className="btn btn-ghost"
                            style={{ fontSize: '0.82rem' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
