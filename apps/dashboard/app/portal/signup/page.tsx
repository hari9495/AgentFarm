'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.9rem',
    border: '1px solid var(--line)', borderRadius: 6, outline: 'none',
    fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.82rem', fontWeight: 600,
    color: 'var(--ink)', marginBottom: '0.3rem',
};

export default function PortalSignupPage() {
    const router = useRouter();
    const [form, setForm] = useState({ tenantId: '', email: '', password: '', displayName: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value }));

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setFieldError(null);
        setLoading(true);

        try {
            const res = await fetch('/api/portal/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: form.tenantId.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    displayName: form.displayName.trim() || undefined,
                }),
            });

            if (res.ok) {
                router.push('/portal/login?registered=1'); // login page shows "check your email" banner
                return;
            }

            const body = await res.json() as { error?: string; message?: string; field?: string };
            if (body.field) {
                setFieldError(body.field);
                setError(body.message ?? 'Please check the highlighted field.');
            } else if (body.error === 'email_already_registered') {
                setFieldError('email');
                setError('This email is already registered for this tenant.');
            } else if (body.error === 'tenant_not_found') {
                setFieldError('tenantId');
                setError('Tenant not found or inactive. Contact your administrator.');
            } else {
                setError(body.message ?? 'Registration failed. Please try again.');
            }
        } catch {
            setError('Unable to connect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const highlight = (field: string) => fieldError === field
        ? { ...inputStyle, borderColor: 'var(--danger)', boxShadow: '0 0 0 2px rgba(220,38,38,0.15)' }
        : inputStyle;

    return (
        <main style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'var(--bg)',
            fontFamily: 'Inter, system-ui, sans-serif', padding: '1rem',
        }}>
            <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

            <div style={{
                background: 'var(--card)', borderRadius: 12, padding: '2.5rem 2rem',
                boxShadow: '0 2px 16px rgba(0,0,0,0.08)', width: '100%', maxWidth: 440,
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>🚀</div>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)' }}>Create your portal account</h1>
                    <p style={{ fontSize: '0.83rem', color: 'var(--ink-muted)', marginTop: '0.25rem' }}>
                        Access AgentFarm support for your organisation
                    </p>
                </div>

                {error && (
                    <div style={{
                        padding: '0.6rem 0.8rem', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                        borderRadius: 6, marginBottom: '1rem', fontSize: '0.83rem', color: 'var(--danger)',
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div>
                        <label style={labelStyle}>Tenant ID <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input
                            type="text" value={form.tenantId} onChange={set('tenantId')}
                            placeholder="your-organisation-id" required autoComplete="organization"
                            style={highlight('tenantId')}
                        />
                        <p style={{ fontSize: '0.73rem', color: 'var(--ink-muted)', marginTop: '0.2rem' }}>
                            Provided by your AgentFarm administrator
                        </p>
                    </div>

                    <div>
                        <label style={labelStyle}>Email <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input
                            type="email" value={form.email} onChange={set('email')}
                            placeholder="you@company.com" required autoComplete="email"
                            style={highlight('email')}
                        />
                    </div>

                    <div>
                        <label style={labelStyle}>Password <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input
                            type="password" value={form.password} onChange={set('password')}
                            placeholder="Min. 8 characters" required autoComplete="new-password" minLength={8}
                            style={highlight('password')}
                        />
                    </div>

                    <div>
                        <label style={labelStyle}>Display Name <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>(optional)</span></label>
                        <input
                            type="text" value={form.displayName} onChange={set('displayName')}
                            placeholder="Your name" autoComplete="name"
                            style={inputStyle}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !form.tenantId.trim() || !form.email.trim() || form.password.length < 8}
                        style={{
                            marginTop: '0.25rem', padding: '0.6rem 1rem', fontSize: '0.9rem', fontWeight: 600,
                            background: loading ? 'var(--info)' : 'var(--info)', color: 'var(--card)',
                            border: 'none', borderRadius: 6,
                            cursor: (loading || !form.tenantId.trim() || !form.email.trim() || form.password.length < 8) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {loading ? 'Creating account…' : 'Create Account'}
                    </button>
                </form>

                <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                    Already have an account?{' '}
                    <Link href="/portal/login" style={{ color: 'var(--info)', textDecoration: 'none' }}>Sign in</Link>
                </p>
            </div>
        </main>
    );
}
