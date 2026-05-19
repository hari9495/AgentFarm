'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
        <div className="ops-shell magic-canvas min-h-screen flex items-center justify-center relative overflow-hidden">
            {/* Aurora background */}
            <div aria-hidden className="aurora-bg pointer-events-none">
                <div className="orb orb-3" />
                <div className="orb orb-4" />
                <div className="cyber-grid" />
                <div className="magic-grain" />
            </div>

            <div className="relative z-10 w-full max-w-[460px] mx-auto px-4 py-10">
                {/* Brand header */}
                <div className="mb-8 text-center">
                    <span className="neon-chip neon-chip-cyan text-[10px]">
                        <span className="dot" aria-hidden />AgentFarm Internal
                    </span>
                    <h1 className="mt-4 text-[1.9rem] font-black tracking-[-0.03em] text-[var(--m-ink)]">
                        Internal Team{' '}
                        <span className="holo-text">Sign In</span>
                    </h1>
                    <p className="mt-2 text-sm text-[var(--m-ink-muted)]">
                        Operations and support teams only.
                    </p>
                </div>

                {/* Form card */}
                <div className="glass-card holo-edge p-8">
                    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.1rem' }}>
                        {error && (
                            <div className="p-3 rounded-lg text-sm" style={{
                                background: 'rgba(239,68,68,0.12)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                color: '#fca5a5',
                            }}>
                                {error}
                            </div>
                        )}

                        <label style={{ display: 'grid', gap: '0.4rem' }}>
                            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--m-ink-muted)]">Email</span>
                            <input
                                type="email"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg px-3 py-2.5 text-sm text-[var(--m-ink)] placeholder-[var(--m-ink-faint)] outline-none transition-all focus:ring-1"
                                style={{
                                    background: 'var(--m-surface-elev, rgba(255,255,255,0.05))',
                                    border: '1px solid var(--m-hairline)',
                                }}
                                placeholder="you@agentfarm.io"
                            />
                        </label>

                        <label style={{ display: 'grid', gap: '0.4rem' }}>
                            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--m-ink-muted)]">Password</span>
                            <input
                                type="password"
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg px-3 py-2.5 text-sm text-[var(--m-ink)] placeholder-[var(--m-ink-faint)] outline-none transition-all"
                                style={{
                                    background: 'var(--m-surface-elev, rgba(255,255,255,0.05))',
                                    border: '1px solid var(--m-hairline)',
                                }}
                                placeholder="••••••••"
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={loading}
                            className="magic-btn magic-btn-primary w-full"
                            style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                        >
                            {loading ? 'Signing in…' : 'Sign in'}
                        </button>

                        <p className="text-center text-xs text-[var(--m-ink-faint)]">
                            Customer user? Use the customer portal login.
                        </p>
                    </form>
                </div>
            </div>
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
