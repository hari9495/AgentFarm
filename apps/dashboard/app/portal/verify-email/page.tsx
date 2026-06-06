'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token') ?? '';
    const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'error'>('loading');

    useEffect(() => {
        if (!token) { setStatus('error'); return; }
        fetch(`/api/portal/auth/verify-email?token=${encodeURIComponent(token)}`)
            .then(async (r) => {
                if (!r.ok) { setStatus('error'); return; }
                const data = await r.json() as { ok: boolean; alreadyVerified?: boolean };
                setStatus(data.alreadyVerified ? 'already' : 'success');
            })
            .catch(() => setStatus('error'));
    }, [token]);

    if (status === 'loading') {
        return <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>Verifying your email…</p>;
    }

    if (status === 'error') {
        return (
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>❌</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>Verification failed</h2>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                    This link is invalid or has already been used. Try requesting a new link from the login page.
                </p>
                <Link href="/portal/login" style={{ color: '#2563eb', fontSize: '0.85rem', textDecoration: 'none' }}>
                    Back to login
                </Link>
            </div>
        );
    }

    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✅</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
                {status === 'already' ? 'Already verified' : 'Email verified!'}
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                {status === 'already'
                    ? 'Your email address was already verified.'
                    : 'Your account is now active. You can sign in.'}
            </p>
            <Link
                href="/portal/login?verified=1"
                style={{
                    display: 'inline-block', padding: '0.5rem 1.4rem',
                    background: '#2563eb', color: '#fff', borderRadius: 6,
                    fontSize: '0.87rem', fontWeight: 600, textDecoration: 'none',
                }}
            >
                Sign In →
            </Link>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={null}>
            <main style={{
                minHeight: '100vh', background: '#f8fafc',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Inter, system-ui, sans-serif', padding: '1rem',
            }}>
                <div style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                    padding: '2.5rem 2rem', width: '100%', maxWidth: 400,
                    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                        <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>🤖</div>
                        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>AgentFarm Portal</h1>
                    </div>
                    <VerifyEmailContent />
                </div>
            </main>
        </Suspense>
    );
}
