'use client';

import { useState, type FormEvent, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token') ?? '';

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (password !== confirm) { setError('Passwords do not match.'); return; }
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        setError(null);
        setLoading(true);
        try {
            const res = await fetch('/api/portal/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: password }),
            });
            if (!res.ok) {
                const b = await res.json() as { message?: string; error?: string };
                setError(b.message ?? (b.error === 'token_expired' ? 'This reset link has expired. Please request a new one.' : 'Invalid or expired reset link.'));
                return;
            }
            setDone(true);
            setTimeout(() => router.push('/portal/login'), 2_500);
        } catch {
            setError('Unable to connect. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '0.88rem', color: '#dc2626', marginBottom: '1rem' }}>Invalid reset link — no token found.</p>
                <Link href="/portal/forgot-password" style={{ color: '#2563eb', fontSize: '0.84rem' }}>Request a new reset link</Link>
            </div>
        );
    }

    if (done) {
        return (
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#15803d' }}>Password updated successfully!</p>
                <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.3rem' }}>Redirecting to sign in…</p>
            </div>
        );
    }

    return (
        <>
            {error && (
                <div style={{ padding: '0.6rem 0.8rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: '1rem', fontSize: '0.83rem', color: '#b91c1c' }}>{error}</div>
            )}
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>New Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required autoComplete="new-password"
                        style={{ width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.9rem', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }} />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Confirm Password</label>
                    <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" required autoComplete="new-password"
                        style={{ width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.9rem', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }} />
                </div>
                <button type="submit" disabled={loading || !password || !confirm} style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', fontWeight: 600, background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer' }}>
                    {loading ? 'Updating…' : 'Set New Password'}
                </button>
            </form>
        </>
    );
}

export default function ResetPasswordPage() {
    return (
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
            <div style={{ background: '#fff', borderRadius: 12, padding: '2.5rem 2rem', boxShadow: '0 2px 16px rgba(0,0,0,0.08)', width: '100%', maxWidth: 400 }}>
                <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                    <div style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>🔐</div>
                    <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>Set new password</h1>
                </div>
                <Suspense fallback={<p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.88rem' }}>Loading…</p>}>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </main>
    );
}
