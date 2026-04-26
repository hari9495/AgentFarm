'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch(`${apiBase}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = (await res.json()) as { token?: string; message?: string; error?: string };

            if (!res.ok || !data.token) {
                setError(data.message ?? 'Login failed. Check your email and password.');
                return;
            }

            // Set session cookie for server components to read on next navigation
            document.cookie = `agentfarm_session=${encodeURIComponent(data.token)}; path=/; samesite=strict; max-age=28800`;
            router.push('/');
        } catch {
            setError('Cannot connect to the server. Make sure the API gateway is running.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="page-shell" style={{ maxWidth: 440, paddingTop: '4rem' }}>
            <header className="hero">
                <p className="eyebrow">AgentFarm</p>
                <h1 style={{ fontSize: '1.5rem' }}>Sign in to your account</h1>
            </header>

            <form onSubmit={handleSubmit} className="card" style={{ display: 'grid', gap: '0.85rem' }}>
                {error && (
                    <div
                        style={{
                            background: '#fee2e2',
                            border: '1px solid #fca5a5',
                            borderRadius: 8,
                            padding: '0.6rem 0.8rem',
                            color: '#991b1b',
                            fontSize: '0.88rem',
                        }}
                    >
                        {error}
                    </div>
                )}

                <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.9rem' }}>
                    <span>Email</span>
                    <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={inputStyle}
                    />
                </label>

                <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.9rem' }}>
                    <span>Password</span>
                    <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={inputStyle}
                    />
                </label>

                <button type="submit" disabled={loading} style={btnStyle(loading)}>
                    {loading ? 'Signing in…' : 'Sign in'}
                </button>

                <p style={{ margin: 0, fontSize: '0.85rem', textAlign: 'center', color: '#57534e' }}>
                    No account?{' '}
                    <a href="/signup" style={{ color: '#0f766e' }}>
                        Create one
                    </a>
                </p>
            </form>
        </main>
    );
}

const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.65rem',
    border: '1px solid #d8d1c5',
    borderRadius: 8,
    fontSize: '0.95rem',
    background: '#fffdf8',
    width: '100%',
    outline: 'none',
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
    padding: '0.6rem 1rem',
    background: disabled ? '#99c8c4' : '#0f766e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: '0.95rem',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
});
