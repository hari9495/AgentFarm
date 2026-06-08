'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Key, Loader2, Lock, Mail, RotateCcw, Shield } from 'lucide-react';

const INTERNAL_DOMAIN = 'agentfarms.in';

type AuthMode = 'password' | 'otp';
type AuthStep = 'form' | 'mfa' | 'otp-code';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [mode, setMode] = useState<AuthMode>('password');
    const [step, setStep] = useState<AuthStep>('form');

    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Password mode
    const [password, setPassword] = useState('');
    const [pendingToken, setPendingToken] = useState('');

    // OTP / MFA
    const [otp, setOtp] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);

    useEffect(() => {
        const e = searchParams.get('error');
        if (e) setError('Something went wrong. Please try again.');
    }, [searchParams]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const switchMode = (m: AuthMode) => {
        setMode(m);
        setStep('form');
        setError(null);
        setOtp('');
        setPendingToken('');
        setResendCooldown(0);
    };

    const setSessionAndRedirect = (token: string) => {
        document.cookie = `agentfarm_internal_session=${encodeURIComponent(token)}; path=/; samesite=strict; max-age=28800`;
        const next = searchParams.get('next') ?? '/';
        router.push(next.startsWith('/') ? next : '/');
    };

    const sendOtp = async (emailAddr: string): Promise<boolean> => {
        setLoading(true);
        try {
            const res = await fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailAddr }),
            });
            const data = (await res.json()) as { message?: string };
            if (!res.ok) { setError(data.message ?? 'Failed to send verification code.'); return false; }
            return true;
        } catch {
            setError('Cannot connect to the server.');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // ── Password mode ─────────────────────────────────────────────────────────

    const handlePasswordSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        let token: string | undefined;
        try {
            const res = await fetch('/api/auth/internal-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            });
            const data = (await res.json()) as { token?: string; message?: string };
            if (!res.ok || !data.token) { setError(data.message ?? 'Email or password is incorrect.'); return; }
            token = data.token;
        } catch {
            setError('Cannot connect to the server.');
            return;
        } finally {
            setLoading(false);
        }
        setPendingToken(token);
        const sent = await sendOtp(email.trim());
        if (sent) { setResendCooldown(60); setStep('mfa'); }
    };

    const handleMfaSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code from your email.'); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), code: otp }),
            });
            const data = (await res.json()) as { message?: string };
            if (!res.ok) { setError(data.message ?? 'Invalid or expired code.'); return; }
            setSessionAndRedirect(pendingToken);
        } catch {
            setError('Cannot connect to the server.');
        } finally {
            setLoading(false);
        }
    };

    // ── OTP mode ──────────────────────────────────────────────────────────────

    const handleOtpEmailSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        const ok = await sendOtp(email.trim());
        if (ok) { setResendCooldown(60); setStep('otp-code'); }
    };

    const handleOtpCodeSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit code.'); return; }
        setLoading(true);
        try {
            const verRes = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), code: otp }),
            });
            const verData = (await verRes.json()) as { message?: string };
            if (!verRes.ok) { setError(verData.message ?? 'Invalid or expired code.'); return; }

            const loginRes = await fetch('/api/auth/passwordless-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const loginData = (await loginRes.json()) as { token?: string; message?: string };
            if (!loginRes.ok || !loginData.token) { setError(loginData.message ?? 'Sign-in failed. Please try again.'); return; }
            setSessionAndRedirect(loginData.token);
        } catch {
            setError('Cannot connect to the server.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0 || loading) return;
        const ok = await sendOtp(email.trim());
        if (ok) { setOtp(''); setResendCooldown(60); }
    };

    // ── Shared UI blocks ──────────────────────────────────────────────────────

    const modeTabs = step === 'form' && (
        <div style={{ display: 'flex', gap: 0, background: 'var(--bg)', borderRadius: '12px', padding: '3px' }}>
            {(
                [
                    { id: 'password', Icon: Lock, label: 'Password' },
                    { id: 'otp', Icon: Shield, label: 'Email OTP' },
                ] as const
            ).map(({ id, Icon, label }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => switchMode(id)}
                    style={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                        padding: '0.45rem 0', border: 'none', borderRadius: '9px', cursor: 'pointer',
                        fontSize: '0.77rem', fontWeight: mode === id ? 600 : 400,
                        background: mode === id ? 'var(--card)' : 'transparent',
                        color: mode === id ? 'var(--ink)' : 'var(--ink-muted)',
                        boxShadow: mode === id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 150ms ease',
                    }}
                >
                    <Icon style={{ width: 12, height: 12 }} />{label}
                </button>
            ))}
        </div>
    );

    const emailField = (
        <div style={{ display: 'grid', gap: '0.375rem' }}>
            <label htmlFor="login-email" style={labelStyle}>
                Work email{' '}
                <span style={{ fontWeight: 400, color: 'var(--ink-muted)', fontSize: '0.75rem' }}>@{INTERNAL_DOMAIN}</span>
            </label>
            <div style={{ position: 'relative' }}>
                <Mail style={iconStyle} />
                <input
                    id="login-email" type="email" required autoComplete="email"
                    placeholder={`you@${INTERNAL_DOMAIN}`}
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    disabled={loading} style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                />
            </div>
        </div>
    );

    const otpField = (label: string) => (
        <div style={{ display: 'grid', gap: '0.375rem' }}>
            <label htmlFor="login-otp" style={labelStyle}>{label}</label>
            <input
                id="login-otp" type="text" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} placeholder="000000" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={loading} autoFocus
                style={{
                    ...inputStyle, paddingLeft: '1rem', textAlign: 'center',
                    fontSize: '2rem', fontWeight: 700, letterSpacing: '0.4em',
                }}
                onFocus={onFocus} onBlur={onBlur}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', margin: 0, textAlign: 'center' }}>
                Check your email for the 6-digit code.
            </p>
        </div>
    );

    const backAndResend = (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={() => { setStep('form'); setError(null); setOtp(''); }} style={ghostBtnStyle}>
                <ArrowLeft style={{ width: 13, height: 13 }} /> Back
            </button>
            <button
                type="button" onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
                style={{ ...ghostBtnStyle, opacity: resendCooldown > 0 ? 0.5 : 1 }}
            >
                <RotateCcw style={{ width: 13, height: 13 }} />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div style={pageStyle}>
            <div style={{ width: '100%', maxWidth: '420px' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    {brandBadge}
                    <h1 style={headingStyle}>
                        Internal Team <span style={{ color: 'var(--accent)' }}>Sign In</span>
                    </h1>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--ink-muted)' }}>
                        Operations and support teams only.
                    </p>
                </div>

                <div style={cardStyle}>
                    {error && <div style={{ ...errorBoxStyle, marginBottom: '1rem' }}>{error}</div>}

                    {/* Password mode — form step */}
                    {mode === 'password' && step === 'form' && (
                        <form onSubmit={handlePasswordSubmit} style={{ display: 'grid', gap: '1rem' }}>
                            {modeTabs}
                            {emailField}
                            <div style={{ display: 'grid', gap: '0.375rem' }}>
                                <label htmlFor="login-password" style={labelStyle}>Password</label>
                                <div style={{ position: 'relative' }}>
                                    <Lock style={iconStyle} />
                                    <input
                                        id="login-password" type="password" required
                                        autoComplete="current-password" placeholder="••••••••"
                                        value={password} onChange={(e) => setPassword(e.target.value)}
                                        disabled={loading} style={inputStyle} onFocus={onFocus} onBlur={onBlur}
                                    />
                                </div>
                            </div>
                            <button type="submit" disabled={loading} style={{ ...submitBtnStyle(loading), marginTop: '0.25rem' }}>
                                {loading ? <><Loader2 style={spinIconStyle} /> Verifying…</> : 'Sign in →'}
                            </button>
                        </form>
                    )}

                    {/* Password mode — MFA step */}
                    {mode === 'password' && step === 'mfa' && (
                        <form onSubmit={handleMfaSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
                            <div style={{ textAlign: 'center', paddingBottom: '0.25rem' }}>
                                <Shield style={{ width: 28, height: 28, color: 'var(--accent)', margin: '0 auto 0.5rem', display: 'block' }} />
                                <p style={{ fontWeight: 600, color: 'var(--ink)', margin: 0, fontSize: '1rem' }}>Two-factor verification</p>
                                <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', margin: '0.25rem 0 0' }}>
                                    Code sent to <strong style={{ color: 'var(--ink)' }}>{email.trim()}</strong>
                                </p>
                            </div>
                            {otpField('Verification code')}
                            <button type="submit" disabled={loading || otp.length !== 6} style={submitBtnStyle(loading || otp.length !== 6)}>
                                {loading ? <><Loader2 style={spinIconStyle} /> Verifying…</> : 'Verify & sign in'}
                            </button>
                            {backAndResend}
                        </form>
                    )}

                    {/* OTP mode — email step */}
                    {mode === 'otp' && step === 'form' && (
                        <form onSubmit={handleOtpEmailSubmit} style={{ display: 'grid', gap: '1rem' }}>
                            {modeTabs}
                            <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', margin: 0 }}>
                                We'll send a one-time code to your email — no password needed.
                            </p>
                            {emailField}
                            <button type="submit" disabled={loading} style={{ ...submitBtnStyle(loading), marginTop: '0.25rem' }}>
                                {loading ? <><Loader2 style={spinIconStyle} /> Sending…</> : 'Send code →'}
                            </button>
                        </form>
                    )}

                    {/* OTP mode — code step */}
                    {mode === 'otp' && step === 'otp-code' && (
                        <form onSubmit={handleOtpCodeSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
                            <div style={{ textAlign: 'center', paddingBottom: '0.25rem' }}>
                                <Key style={{ width: 28, height: 28, color: 'var(--accent)', margin: '0 auto 0.5rem', display: 'block' }} />
                                <p style={{ fontWeight: 600, color: 'var(--ink)', margin: 0, fontSize: '1rem' }}>Enter your code</p>
                                <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', margin: '0.25rem 0 0' }}>
                                    Sent to <strong style={{ color: 'var(--ink)' }}>{email.trim()}</strong>
                                </p>
                            </div>
                            {otpField('One-time code')}
                            <button type="submit" disabled={loading || otp.length !== 6} style={submitBtnStyle(loading || otp.length !== 6)}>
                                {loading ? <><Loader2 style={spinIconStyle} /> Signing in…</> : 'Sign in →'}
                            </button>
                            {backAndResend}
                        </form>
                    )}
                </div>

                <p style={footerTextStyle}>
                    New team member?{' '}
                    <a href="/signup" style={linkStyle}>Create an internal account.</a>
                </p>
                {process.env.NODE_ENV === 'development' && (
                    <p style={{ ...footerTextStyle, marginTop: '0.25rem' }}>
                        <a href="/api/dev-login" style={linkStyle}>Dev login shortcut</a>
                    </p>
                )}
            </div>
            <style>{spinKeyframes}</style>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg)' }} />}>
            <LoginForm />
        </Suspense>
    );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
    minHeight: '100vh', background: 'var(--bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};

const brandBadge = (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
        background: 'rgba(0,102,204,0.06)', border: '1px solid rgba(0,102,204,0.18)',
        borderRadius: '9999px', padding: '0.25rem 0.75rem',
        fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.03em',
        color: 'var(--accent)', textTransform: 'uppercase',
    }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} aria-hidden />
        AgentFarms Internal
    </span>
);

const headingStyle: React.CSSProperties = {
    marginTop: '1rem', marginBottom: 0,
    fontSize: 'clamp(1.6rem, 4vw, 2rem)', fontWeight: 700,
    letterSpacing: '-0.025em', color: 'var(--ink)', lineHeight: 1.1,
};

const cardStyle: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--line)',
    borderRadius: '18px', padding: '2rem',
    boxShadow: '0 4px 24px -8px rgba(0,0,0,0.08)',
};

const errorBoxStyle: React.CSSProperties = {
    padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.875rem',
    background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.2)', color: 'var(--danger)',
};

const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)', letterSpacing: '0.01em',
    display: 'flex', alignItems: 'baseline', gap: '0.25rem',
};

const iconStyle: React.CSSProperties = {
    position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
    width: 16, height: 16, color: 'var(--ink-muted)',
};

const inputStyle: React.CSSProperties = {
    width: '100%', paddingLeft: '2.25rem', paddingRight: '0.75rem',
    paddingTop: '0.625rem', paddingBottom: '0.625rem',
    borderRadius: '10px', border: '1px solid var(--line)',
    background: 'var(--bg)', fontSize: '0.9rem', color: 'var(--ink)',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 180ms ease, box-shadow 180ms ease',
};

function submitBtnStyle(disabled: boolean): React.CSSProperties {
    return {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        width: '100%', padding: '0.7rem 1.5rem',
        background: disabled ? '#5599d8' : 'var(--accent)',
        color: 'var(--card)', border: 'none', borderRadius: '9999px',
        fontSize: '1rem', fontWeight: 500, letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 180ms ease',
    };
}

const ghostBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.8rem', color: 'var(--ink-muted)', padding: '0.25rem 0',
};

const spinIconStyle: React.CSSProperties = { width: 16, height: 16, animation: 'spin 1s linear infinite' };

const footerTextStyle: React.CSSProperties = {
    marginTop: '1.25rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--ink-muted)',
};

const linkStyle: React.CSSProperties = { color: 'var(--accent)', textDecoration: 'none' };

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--accent)';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,102,204,0.12)';
}

function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--line)';
    e.currentTarget.style.boxShadow = 'none';
}

const spinKeyframes = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
