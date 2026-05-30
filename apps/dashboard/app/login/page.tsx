'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Lock, Mail } from 'lucide-react';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch('/api/auth/internal-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = (await res.json()) as { token?: string; message?: string; error?: string };

            if (!res.ok || !data.token) {
                setError(data.message ?? 'Login failed. Check your email and password.');
                return;
            }

            document.cookie = `agentfarm_internal_session=${encodeURIComponent(data.token)}; path=/; samesite=strict; max-age=28800`;
            const redirectTarget = searchParams.get('next') || '/';
            router.push(redirectTarget.startsWith('/') ? redirectTarget : '/');
        } catch {
            setError('Cannot connect to the server. Make sure the API gateway is running.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#f5f5f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ width: '100%', maxWidth: '420px' }}>
                {/* Brand header */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
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
                    <h1 style={{
                        marginTop: '1rem', marginBottom: 0,
                        fontSize: 'clamp(1.6rem, 4vw, 2rem)', fontWeight: 700,
                        letterSpacing: '-0.025em', color: '#1d1d1f', lineHeight: 1.1,
                    }}>
                        Internal Team{' '}
                        <span style={{ color: '#0066cc' }}>Sign In</span>
                    </h1>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#6e6e73' }}>
                        Operations and support teams only.
                    </p>
                </div>

                {/* Form card */}
                <div style={{
                    background: '#ffffff', border: '1px solid #d2d2d7',
                    borderRadius: '18px', padding: '2rem',
                    boxShadow: '0 4px 24px -8px rgba(0,0,0,0.08)',
                }}>
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
                        {error && (
                            <div style={{
                                padding: '0.75rem 1rem', borderRadius: '10px', fontSize: '0.875rem',
                                background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.2)',
                                color: '#c4161c',
                            }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: 'grid', gap: '0.375rem' }}>
                            <label htmlFor="login-email" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1d1d1f', letterSpacing: '0.01em' }}>
                                Email
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Mail style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#aeaeb2' }} />
                                <input
                                    id="login-email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    placeholder="you@agentfarm.io"
                                    style={{
                                        width: '100%', paddingLeft: '2.25rem', paddingRight: '0.75rem',
                                        paddingTop: '0.625rem', paddingBottom: '0.625rem',
                                        borderRadius: '10px', border: '1px solid #d2d2d7',
                                        background: '#f5f5f7', fontSize: '0.9rem', color: '#1d1d1f',
                                        outline: 'none', boxSizing: 'border-box',
                                        transition: 'border-color 180ms ease, box-shadow 180ms ease',
                                    }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = '#0066cc';
                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,102,204,0.12)';
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = '#d2d2d7';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: '0.375rem' }}>
                            <label htmlFor="login-password" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1d1d1f', letterSpacing: '0.01em' }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#aeaeb2' }} />
                                <input
                                    id="login-password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    placeholder="••••••••"
                                    style={{
                                        width: '100%', paddingLeft: '2.25rem', paddingRight: '0.75rem',
                                        paddingTop: '0.625rem', paddingBottom: '0.625rem',
                                        borderRadius: '10px', border: '1px solid #d2d2d7',
                                        background: '#f5f5f7', fontSize: '0.9rem', color: '#1d1d1f',
                                        outline: 'none', boxSizing: 'border-box',
                                        transition: 'border-color 180ms ease, box-shadow 180ms ease',
                                    }}
                                    onFocus={(e) => {
                                        e.currentTarget.style.borderColor = '#0066cc';
                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,102,204,0.12)';
                                    }}
                                    onBlur={(e) => {
                                        e.currentTarget.style.borderColor = '#d2d2d7';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                width: '100%', padding: '0.7rem 1.5rem',
                                background: loading ? '#5599d8' : '#0066cc',
                                color: '#ffffff', border: 'none', borderRadius: '9999px',
                                fontSize: '1rem', fontWeight: 500, letterSpacing: '-0.01em',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'background-color 180ms ease, transform 180ms ease',
                                marginTop: '0.25rem',
                            }}
                            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#0071e3'; }}
                            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#0066cc'; }}
                        >
                            {loading ? (
                                <>
                                    <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                                    Signing in…
                                </>
                            ) : (
                                'Sign in'
                            )}
                        </button>
                    </form>
                </div>

                <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: '#aeaeb2' }}>
                    Customer user?{' '}
                    <a href="https://agentfarm.io/portal/login" style={{ color: '#0066cc', textDecoration: 'none' }}>
                        Use the customer portal login.
                    </a>
                </p>
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
