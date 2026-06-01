'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, CheckCircle2, Circle, Loader2, Lock, Mail, RotateCcw, User } from 'lucide-react';

const INTERNAL_DOMAIN = 'agentfarms.in';

function checkPassword(pwd: string) {
    return {
        length: pwd.length >= 8,
        upper: /[A-Z]/.test(pwd),
        lower: /[a-z]/.test(pwd),
        number: /[0-9]/.test(pwd),
        symbol: /[^A-Za-z0-9]/.test(pwd),
    };
}

const PWD_RULES: { key: keyof ReturnType<typeof checkPassword>; label: string }[] = [
    { key: 'length', label: '8+ characters' },
    { key: 'upper', label: 'Uppercase (A–Z)' },
    { key: 'lower', label: 'Lowercase (a–z)' },
    { key: 'number', label: 'Number (0–9)' },
    { key: 'symbol', label: 'Symbol (!@#$…)' },
];

export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<'form' | 'otp'>('form');

    // Form fields
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [pwdTouched, setPwdTouched] = useState(false);

    // OTP
    const [otp, setOtp] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const pwdChecks = checkPassword(password);
    const passwordStrong = Object.values(pwdChecks).every(Boolean);
    const emailInternal = email.trim().toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`);

    // Cooldown countdown
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    // Send OTP helper
    const sendOtp = async (): Promise<boolean> => {
        setError(null);
        setLoading(true);
        try {
            const res = await fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = (await res.json()) as { message?: string };
            if (!res.ok) { setError(data.message ?? 'Failed to send code. Try again.'); return false; }
            return true;
        } catch {
            setError('Cannot connect to the server.');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Step 1: validate form → send OTP
    const handleFormSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!emailInternal) { setError(`Only @${INTERNAL_DOMAIN} email addresses are allowed.`); return; }
        if (!passwordStrong) { setError('Password must meet all the requirements listed below.'); setPwdTouched(true); return; }
        const ok = await sendOtp();
        if (ok) { setResendCooldown(60); setStep('otp'); }
    };

    // Resend OTP
    const handleResend = async () => {
        if (resendCooldown > 0 || loading) return;
        const ok = await sendOtp();
        if (ok) { setOtp(''); setResendCooldown(60); }
    };

    // Step 2: verify OTP → create account
    const handleOtpSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!/^\d{6}$/.test(otp)) { setError('Please enter the 6-digit numeric code.'); return; }
        setLoading(true);
        try {
            const verifyRes = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), code: otp }),
            });
            const verifyData = (await verifyRes.json()) as { message?: string };
            if (!verifyRes.ok) { setError(verifyData.message ?? 'Invalid code.'); return; }

            const signupRes = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), email: email.trim(), password, companyName: companyName.trim() }),
            });
            const signupData = (await signupRes.json()) as { provisioning_job_id?: string; error?: string; message?: string };
            if (!signupRes.ok) {
                setError(signupData.error === 'email_taken'
                    ? 'An account with this email already exists. Sign in instead.'
                    : (signupData.message ?? 'Account creation failed.'));
                return;
            }

            const loginRes = await fetch('/api/auth/internal-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            });
            const loginData = (await loginRes.json()) as { token?: string };
            if (!loginRes.ok || !loginData.token) { router.push('/login'); return; }

            document.cookie = `agentfarm_internal_session=${encodeURIComponent(loginData.token)}; path=/; samesite=strict; max-age=28800`;
            router.push(signupData.provisioning_job_id
                ? `/provisioning?jobId=${encodeURIComponent(signupData.provisioning_job_id)}`
                : '/');
        } catch {
            setError('Cannot connect to the server.');
        } finally {
            setLoading(false);
        }
    };

    // ── OTP step ──────────────────────────────────────────────────────────────
    if (step === 'otp') {
        return (
            <div style={pageStyle}>
                <div style={{ width: '100%', maxWidth: '420px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        {brandBadge}
                        <h1 style={headingStyle}>
                            Check your <span style={{ color: '#0066cc' }}>email</span>
                        </h1>
                        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
                            We sent a 6-digit code to{' '}
                            <strong style={{ color: '#1d1d1f' }}>{email.trim()}</strong>
                        </p>
                    </div>

                    <div style={cardStyle}>
                        <form onSubmit={handleOtpSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
                            {error && <div style={errorBoxStyle}>{error}</div>}

                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                <label htmlFor="otp-code" style={labelStyle}>Verification code</label>
                                <input
                                    id="otp-code"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    placeholder="000000"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    disabled={loading}
                                    autoFocus
                                    style={{
                                        width: '100%', padding: '0.75rem 1rem',
                                        textAlign: 'center', fontSize: '2rem', fontWeight: 700,
                                        letterSpacing: '0.4em', borderRadius: '12px',
                                        border: '1.5px solid #d2d2d7', background: '#f5f5f7',
                                        color: '#1d1d1f', outline: 'none', boxSizing: 'border-box',
                                        transition: 'border-color 180ms ease, box-shadow 180ms ease',
                                    }}
                                    onFocus={(e) => { e.currentTarget.style.borderColor = '#0066cc'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,102,204,0.12)'; }}
                                    onBlur={(e) => { e.currentTarget.style.borderColor = '#d2d2d7'; e.currentTarget.style.boxShadow = 'none'; }}
                                />
                            </div>

                            <p style={{ fontSize: '0.75rem', color: '#aeaeb2', textAlign: 'center', margin: 0 }}>
                                In development, find your code in the server console logs.
                            </p>

                            <button type="submit" disabled={loading || otp.length !== 6} style={submitBtnStyle(loading || otp.length !== 6)}>
                                {loading
                                    ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Verifying…</>
                                    : 'Verify & create account'}
                            </button>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button type="button" onClick={() => { setStep('form'); setError(null); setOtp(''); }} style={ghostBtnStyle}>
                                    <ArrowLeft style={{ width: 13, height: 13 }} /> Back
                                </button>
                                <button type="button" onClick={handleResend} disabled={resendCooldown > 0 || loading}
                                    style={{ ...ghostBtnStyle, opacity: resendCooldown > 0 ? 0.5 : 1 }}>
                                    <RotateCcw style={{ width: 13, height: 13 }} />
                                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
                <style>{spinKeyframes}</style>
            </div>
        );
    }

    // ── Form step ─────────────────────────────────────────────────────────────
    return (
        <div style={pageStyle}>
            <div style={{ width: '100%', maxWidth: '440px' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    {brandBadge}
                    <h1 style={headingStyle}>
                        Create your <span style={{ color: '#0066cc' }}>account</span>
                    </h1>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
                        Internal dashboard access for approved team members.
                    </p>
                </div>

                <div style={cardStyle}>
                    <form onSubmit={handleFormSubmit} style={{ display: 'grid', gap: '1rem' }}>
                        {error && <div style={errorBoxStyle}>{error}</div>}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gap: '0.375rem' }}>
                                <label htmlFor="signup-name" style={labelStyle}>Full name</label>
                                <div style={{ position: 'relative' }}>
                                    <User style={iconStyle} />
                                    <input id="signup-name" type="text" required autoComplete="name"
                                        placeholder="Ada Lovelace" value={name}
                                        onChange={(e) => setName(e.target.value)} disabled={loading}
                                        style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gap: '0.375rem' }}>
                                <label htmlFor="signup-company" style={labelStyle}>Company</label>
                                <div style={{ position: 'relative' }}>
                                    <Building2 style={iconStyle} />
                                    <input id="signup-company" type="text" autoComplete="organization"
                                        placeholder="Acme Corp" value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)} disabled={loading}
                                        style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                                </div>
                            </div>
                        </div>

                        {/* Email — internal domain only */}
                        <div style={{ display: 'grid', gap: '0.375rem' }}>
                            <label htmlFor="signup-email" style={labelStyle}>
                                Work email{' '}
                                <span style={{ fontWeight: 400, color: '#aeaeb2', fontSize: '0.75rem' }}>@{INTERNAL_DOMAIN} only</span>
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Mail style={iconStyle} />
                                <input id="signup-email" type="email" required autoComplete="email"
                                    placeholder={`you@${INTERNAL_DOMAIN}`} value={email}
                                    onChange={(e) => setEmail(e.target.value)} disabled={loading}
                                    style={{ ...inputStyle, borderColor: email && !emailInternal ? 'rgba(255,59,48,0.5)' : undefined }}
                                    onFocus={onFocus} onBlur={onBlur} />
                            </div>
                            {email && !emailInternal && (
                                <p style={{ fontSize: '0.75rem', color: '#c4161c', margin: 0 }}>
                                    Must be an @{INTERNAL_DOMAIN} address.
                                </p>
                            )}
                        </div>

                        {/* Password + strength checker */}
                        <div style={{ display: 'grid', gap: '0.375rem' }}>
                            <label htmlFor="signup-password" style={labelStyle}>Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock style={iconStyle} />
                                <input id="signup-password" type="password" required autoComplete="new-password"
                                    placeholder="Must include letters, numbers & symbols"
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setPwdTouched(true); }}
                                    disabled={loading} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                            </div>
                            {pwdTouched && (
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 0.75rem',
                                    marginTop: '0.25rem', padding: '0.625rem 0.75rem',
                                    background: '#f5f5f7', borderRadius: '10px', border: '1px solid #e5e5ea',
                                }}>
                                    {PWD_RULES.map(({ key, label }) => {
                                        const met = pwdChecks[key];
                                        return (
                                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                {met
                                                    ? <CheckCircle2 style={{ width: 13, height: 13, color: '#34c759', flexShrink: 0 }} />
                                                    : <Circle style={{ width: 13, height: 13, color: '#c7c7cc', flexShrink: 0 }} />}
                                                <span style={{ fontSize: '0.75rem', color: met ? '#1d1d1f' : '#8e8e93' }}>{label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <button type="submit" disabled={loading}
                            style={{ ...submitBtnStyle(loading), marginTop: '0.25rem' }}
                            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#0071e3'; }}
                            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#0066cc'; }}>
                            {loading
                                ? <><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Sending code…</>
                                : 'Send verification code →'}
                        </button>
                    </form>
                </div>

                <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: '#aeaeb2' }}>
                    Already have an account?{' '}
                    <a href="/login" style={{ color: '#0066cc', textDecoration: 'none' }}>Sign in</a>
                </p>
            </div>
            <style>{spinKeyframes}</style>
        </div>
    );
}

// ── Shared constants ──────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
    minHeight: '100vh', background: '#f5f5f7',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};

const brandBadge = (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
        background: 'rgba(0,102,204,0.06)', border: '1px solid rgba(0,102,204,0.18)',
        borderRadius: '9999px', padding: '0.25rem 0.75rem',
        fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.03em',
        color: '#0066cc', textTransform: 'uppercase',
    }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0066cc', display: 'inline-block' }} aria-hidden />
        AgentFarms Internal
    </span>
);

const headingStyle: React.CSSProperties = {
    marginTop: '1rem', marginBottom: 0,
    fontSize: 'clamp(1.6rem, 4vw, 2rem)', fontWeight: 700,
    letterSpacing: '-0.025em', color: '#1d1d1f', lineHeight: 1.1,
};

const cardStyle: React.CSSProperties = {
    background: '#ffffff', border: '1px solid #d2d2d7',
    borderRadius: '18px', padding: '2rem',
    boxShadow: '0 4px 24px -8px rgba(0,0,0,0.08)',
};

const errorBoxStyle: React.CSSProperties = {
    padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.875rem',
    background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.2)', color: '#c4161c',
};

const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem', fontWeight: 600, color: '#1d1d1f', letterSpacing: '0.01em',
    display: 'flex', alignItems: 'baseline', gap: '0.25rem',
};

const iconStyle: React.CSSProperties = {
    position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
    width: 16, height: 16, color: '#aeaeb2',
};

const inputStyle: React.CSSProperties = {
    width: '100%', paddingLeft: '2.25rem', paddingRight: '0.75rem',
    paddingTop: '0.625rem', paddingBottom: '0.625rem',
    borderRadius: '10px', border: '1px solid #d2d2d7',
    background: '#f5f5f7', fontSize: '0.9rem', color: '#1d1d1f',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 180ms ease, box-shadow 180ms ease',
};

function submitBtnStyle(disabled: boolean): React.CSSProperties {
    return {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        width: '100%', padding: '0.7rem 1.5rem',
        background: disabled ? '#5599d8' : '#0066cc',
        color: '#ffffff', border: 'none', borderRadius: '9999px',
        fontSize: '1rem', fontWeight: 500, letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 180ms ease',
    };
}

const ghostBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.8rem', color: '#6e6e73', padding: '0.25rem 0',
};

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#0066cc';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,102,204,0.12)';
}

function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = '#d2d2d7';
    e.currentTarget.style.boxShadow = 'none';
}

const spinKeyframes = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
