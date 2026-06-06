'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const [tenantId, setTenantId] = useState('');
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Dev only — api returns resetUrl in non-production
    const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch('/api/portal/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId: tenantId.trim(), email: email.trim().toLowerCase() }),
            });
            if (!res.ok) {
                const b = await res.json() as { message?: string };
                setError(b.message ?? 'Something went wrong.');
                return;
            }
            const data = await res.json() as { ok: boolean; resetUrl?: string };
            if (data.resetUrl) setDevResetUrl(data.resetUrl);
            setSubmitted(true);
        } catch {
            setError('Unable to connect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } input { font-family: inherit; }`}</style>
            <div style={{ background: 'var(--card)', borderRadius: 12, padding: '2.5rem 2rem', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', width: '100%', maxWidth: 400 }}>
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <div style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>🔑</div>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)' }}>Reset your password</h1>
                    <p style={{ fontSize: '0.83rem', color: 'var(--ink-muted)', marginTop: '0.25rem' }}>Enter your Tenant ID and email to receive a reset link.</p>
                </div>

                {submitted ? (
                    <div>
                        <div style={{ padding: '0.8rem', background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--ok)', marginBottom: '1rem' }}>
                            If an account exists for <strong>{email}</strong>, a reset link has been sent.
                        </div>
                        {devResetUrl && (
                            <div style={{ padding: '0.7rem', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--warn)', marginBottom: '1rem', wordBreak: 'break-all' }}>
                                <strong>Dev mode — reset link:</strong><br />
                                <a href={devResetUrl} style={{ color: 'var(--info)' }}>{devResetUrl}</a>
                            </div>
                        )}
                        <Link href="/portal/login" style={{ display: 'block', textAlign: 'center', fontSize: '0.84rem', color: 'var(--info)' }}>← Back to sign in</Link>
                    </div>
                ) : (
                    <>
                        {error && (
                            <div style={{ padding: '0.6rem 0.8rem', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 6, marginBottom: '1rem', fontSize: '0.83rem', color: 'var(--danger)' }}>{error}</div>
                        )}
                        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.3rem' }}>Tenant ID</label>
                                <input type="text" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="your-tenant-id" required style={{ width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.9rem', border: '1px solid var(--line)', borderRadius: 6, outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.3rem' }}>Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required style={{ width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.9rem', border: '1px solid var(--line)', borderRadius: 6, outline: 'none' }} />
                            </div>
                            <button type="submit" disabled={loading || !tenantId.trim() || !email.trim()} style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', fontWeight: 600, background: loading ? 'var(--info)' : 'var(--info)', color: 'var(--card)', border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer' }}>
                                {loading ? 'Sending…' : 'Send Reset Link'}
                            </button>
                        </form>
                        <p style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                            <Link href="/portal/login" style={{ color: 'var(--info)' }}>← Back to sign in</Link>
                        </p>
                    </>
                )}
            </div>
        </main>
    );
}
