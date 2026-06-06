'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function PortalLoginPage() {
    const router = useRouter();
    const [tenantId, setTenantId] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch('/api/portal/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId: tenantId.trim(), email: email.trim().toLowerCase(), password }),
            });

            if (res.ok) {
                router.push('/portal/support');
                return;
            }

            let msg = 'Login failed. Please try again.';
            try {
                const body = await res.json() as { message?: string; error?: string };
                if (body.message) msg = body.message;
                else if (body.error === 'invalid_credentials') msg = 'Email or password is incorrect.';
                else if (body.error === 'account_inactive') msg = 'This account has been deactivated.';
                else if (body.error === 'tenant_not_found') msg = 'Tenant not found.';
            } catch { /* keep default */ }

            setError(msg);
        } catch {
            setError('Unable to connect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif',
        }}>
            <style>{`
                * { box-sizing: border-box; margin: 0; padding: 0; }
                input { font-family: inherit; }
                label { display: block; font-size: 0.82rem; font-weight: 600; color: #374151; margin-bottom: 0.3rem; }
                input[type=text], input[type=email], input[type=password] {
                    width: 100%; padding: 0.5rem 0.7rem; font-size: 0.9rem;
                    border: 1px solid #d1d5db; border-radius: 6px; outline: none;
                    transition: border-color 0.15s;
                }
                input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
            `}</style>

            <div style={{
                background: '#fff', borderRadius: 12, padding: '2.5rem 2rem',
                boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
                width: '100%', maxWidth: 400,
            }}>
                {/* Logo / Brand */}
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>🤖</div>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>AgentFarm Support Portal</h1>
                    <p style={{ fontSize: '0.83rem', color: '#6b7280', marginTop: '0.25rem' }}>Sign in to get support for your platform</p>
                </div>

                {error && (
                    <div style={{
                        padding: '0.6rem 0.8rem', background: '#fef2f2', border: '1px solid #fecaca',
                        borderRadius: 6, marginBottom: '1rem', fontSize: '0.83rem', color: '#b91c1c',
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label htmlFor="tenantId">Tenant ID</label>
                        <input
                            id="tenantId"
                            type="text"
                            placeholder="your-tenant-id"
                            value={tenantId}
                            onChange={(e) => setTenantId(e.target.value)}
                            required
                            autoComplete="organization"
                        />
                    </div>
                    <div>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>
                    <div>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !tenantId.trim() || !email.trim() || !password}
                        style={{
                            marginTop: '0.25rem', padding: '0.6rem 1rem', fontSize: '0.9rem', fontWeight: 600,
                            background: loading ? '#93c5fd' : '#2563eb', color: '#fff',
                            border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'background 0.15s',
                        }}
                    >
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>

                <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.78rem', color: '#9ca3af' }}>
                    Don&apos;t have an account? Contact your AgentFarm administrator.
                </p>
            </div>
        </main>
    );
}
