'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 10) {
            setError('Password must be at least 10 characters.');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch(`${apiBase}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, companyName }),
            });

            const data = (await res.json()) as { token?: string; provisioning_job_id?: string; message?: string; error?: string; field?: string };

            if (!res.ok || !data.token) {
                const msg =
                    data.error === 'email_taken'
                        ? 'An account with this email already exists. Sign in instead.'
                        : (data.message ?? 'Signup failed. Please try again.');
                setError(msg);
                return;
            }

            // Set session cookie for server components to read on next navigation
            document.cookie = `agentfarm_session=${encodeURIComponent(data.token)}; path=/; samesite=strict; max-age=28800`;
            const target = data.provisioning_job_id
                ? `/provisioning?jobId=${encodeURIComponent(data.provisioning_job_id)}`
                : '/';
            router.push(target);
        } catch {
            setError('Cannot connect to the server. Make sure the API gateway is running.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="page-shell" style={{ maxWidth: 480, paddingTop: '3rem' }}>
            <header className="hero">
                <p className="eyebrow">AgentFarm</p>
                <h1 style={{ fontSize: '1.5rem' }}>Create your account</h1>
                <p style={{ marginTop: '0.3rem', fontSize: '0.9rem' }}>
                    Your first Developer Agent will be provisioned automatically after signup.
                </p>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <label style={labelStyle}>
                        <span>Your name</span>
                        <input
                            type="text"
                            required
                            autoComplete="name"
                            placeholder="Alex Chen"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={inputStyle}
                        />
                    </label>
                    <label style={labelStyle}>
                        <span>Company name</span>
                        <input
                            type="text"
                            required
                            autoComplete="organization"
                            placeholder="Acme Corp"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            style={inputStyle}
                        />
                    </label>
                </div>

                <label style={labelStyle}>
                    <span>Work email</span>
                    <input
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="alex@acme.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={inputStyle}
                    />
                </label>

                <label style={labelStyle}>
                    <span>
                        Password{' '}
                        <span style={{ fontWeight: 400, color: '#78716c', fontSize: '0.8rem' }}>(min 10 characters)</span>
                    </span>
                    <input
                        type="password"
                        required
                        minLength={10}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={inputStyle}
                    />
                </label>

                <button type="submit" disabled={loading} style={btnStyle(loading)}>
                    {loading ? 'Creating account…' : 'Create account and start provisioning'}
                </button>

                <p style={{ margin: 0, fontSize: '0.85rem', textAlign: 'center', color: '#57534e' }}>
                    Already have an account?{' '}
                    <a href="/login" style={{ color: '#0f766e' }}>
                        Sign in
                    </a>
                </p>
            </form>

            <div className="card" style={{ fontSize: '0.82rem', color: '#57534e' }}>
                <p style={{ margin: '0 0 0.4rem', fontWeight: 700 }}>What happens after signup</p>
                <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'grid', gap: '0.25rem' }}>
                    <li>Tenant and Primary Workspace are created instantly.</li>
                    <li>A Developer Agent bot record is initialized.</li>
                    <li>VM provisioning is queued (usually completes in under 10 minutes).</li>
                    <li>Dashboard shows live provisioning progress.</li>
                </ol>
            </div>
        </main>
    );
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: '0.3rem', fontSize: '0.9rem' };

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
