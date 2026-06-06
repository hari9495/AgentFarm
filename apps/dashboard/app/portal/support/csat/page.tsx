'use client';

import { useEffect, useState, Suspense, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type CsatInfo = { issueId: string; issueTitle: string; responded: boolean; rating: number | null };

const RATING_LABEL = ['', 'Very poor', 'Poor', 'OK', 'Good', 'Excellent'];

function CsatForm() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token') ?? '';

    const [info, setInfo] = useState<CsatInfo | null>(null);
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitErr, setSubmitErr] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        if (!token) { setLoadErr('Missing survey token.'); setLoading(false); return; }
        fetch(`/api/portal/csat/${encodeURIComponent(token)}`)
            .then(async (r) => {
                if (!r.ok) { setLoadErr('This survey link is invalid or has expired.'); return; }
                const data = await r.json() as CsatInfo;
                setInfo(data);
                if (data.responded) setSubmitted(true);
            })
            .catch(() => setLoadErr('Unable to load the survey.'))
            .finally(() => setLoading(false));
    }, [token]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (rating === 0) return;
        setSubmitErr(null);
        setSubmitting(true);
        try {
            const res = await fetch('/api/portal/csat/respond', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, rating, comment: comment.trim() || undefined }),
            });
            if (res.ok) { setSubmitted(true); return; }
            const b = await res.json() as { error?: string };
            if (b.error === 'already_responded') { setSubmitted(true); return; }
            setSubmitErr('Failed to submit. Please try again.');
        } catch {
            setSubmitErr('Unable to connect. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading…</p>;

    if (loadErr) {
        return (
            <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#b91c1c', marginBottom: '1rem', fontSize: '0.87rem' }}>{loadErr}</p>
                <Link href="/portal/support/history" style={{ color: '#2563eb', fontSize: '0.84rem', textDecoration: 'none' }}>
                    ← Back to history
                </Link>
            </div>
        );
    }

    if (submitted) {
        return (
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🙏</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: '0.4rem' }}>
                    Thank you for your feedback!
                </h2>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    {info?.rating != null ? `You rated this ${info.rating}/5.` : 'Your feedback helps us improve.'}
                </p>
                <Link
                    href="/portal/support/history"
                    style={{ color: '#2563eb', fontSize: '0.84rem', textDecoration: 'none', fontWeight: 600 }}
                >
                    ← View your tickets
                </Link>
            </div>
        );
    }

    return (
        <>
            {info && (
                <p style={{ textAlign: 'center', fontSize: '0.84rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                    Ticket: <strong style={{ color: '#111827' }}>{info.issueTitle}</strong>
                </p>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Star rating */}
                <div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem', textAlign: 'center' }}>
                        How would you rate your support experience?
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setRating(n)}
                                title={`${n} star${n > 1 ? 's' : ''}`}
                                style={{
                                    width: 48, height: 48, borderRadius: '50%', fontSize: '1.4rem',
                                    border: `2px solid ${rating >= n ? '#f59e0b' : '#e2e8f0'}`,
                                    background: rating >= n ? '#fffbeb' : '#fff',
                                    cursor: 'pointer', transition: 'all 0.1s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                {rating >= n ? '⭐' : '☆'}
                            </button>
                        ))}
                    </div>
                    {rating > 0 && (
                        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#6b7280', marginTop: '0.4rem' }}>
                            {RATING_LABEL[rating]}
                        </p>
                    )}
                </div>

                {/* Comment */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>
                        Comments <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                    </label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={3}
                        placeholder="What went well? What could be improved?"
                        style={{
                            width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.87rem',
                            border: '1px solid #e2e8f0', borderRadius: 6,
                            fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                        }}
                    />
                </div>

                {submitErr && (
                    <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: 0 }}>{submitErr}</p>
                )}

                <button
                    type="submit"
                    disabled={submitting || rating === 0}
                    style={{
                        padding: '0.6rem 1rem', fontSize: '0.9rem', fontWeight: 600,
                        background: rating === 0 ? '#e2e8f0' : '#2563eb',
                        color: rating === 0 ? '#9ca3af' : '#fff',
                        border: 'none', borderRadius: 6,
                        cursor: rating === 0 || submitting ? 'not-allowed' : 'pointer',
                    }}
                >
                    {submitting ? 'Submitting…' : 'Submit Feedback'}
                </button>
            </form>
        </>
    );
}

export default function CsatPage() {
    return (
        <Suspense fallback={null}>
            <main style={{
                minHeight: '100vh', background: '#f8fafc',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Inter, system-ui, sans-serif', padding: '1rem',
            }}>
                <div style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                    padding: '2rem', width: '100%', maxWidth: 480,
                    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>🤖</div>
                        <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>Support Feedback</h1>
                        <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem' }}>Your feedback helps us improve.</p>
                    </div>
                    <CsatForm />
                </div>
            </main>
        </Suspense>
    );
}
