'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '../components/page-header';

// ── Contact form ──────────────────────────────────────────────────────────────

type FormState = 'idle' | 'submitting' | 'success' | 'error';

function ContactContent() {
    const searchParams = useSearchParams();
    const subject = searchParams.get('subject') ?? '';

    const [name, setName] = useState('');
    const [company, setCompany] = useState('');
    const [email, setEmail] = useState('');
    const [agents, setAgents] = useState('');
    const [message, setMessage] = useState(
        subject === 'enterprise'
            ? 'Hi, I\'m interested in the Enterprise plan. Please get in touch.'
            : '',
    );
    const [formState, setFormState] = useState<FormState>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !email.trim() || !message.trim()) return;
        setFormState('submitting');
        setErrorMsg('');
        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, company, email, agents, message }),
            });
            if (!res.ok) throw new Error('Server error');
            setFormState('success');
        } catch {
            setErrorMsg('Something went wrong. Please try emailing us directly at hello@agentfarm.dev.');
            setFormState('error');
        }
    }

    if (formState === 'success') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div
                    className="card"
                    style={{ maxWidth: 480, textAlign: 'center', padding: '2.5rem' }}
                >
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
                    <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>
                        Message sent
                    </h2>
                    <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>
                        Our team will be in touch within one business day.
                    </p>
                    <a
                        href="/"
                        style={{
                            display: 'inline-block',
                            padding: '0.55rem 1.25rem',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            background: 'var(--brand)',
                            color: '#fff',
                            borderRadius: 8,
                            textDecoration: 'none',
                        }}
                    >
                        Back to Dashboard
                    </a>
                </div>
            </div>
        );
    }

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.55rem 0.75rem',
        fontSize: '0.875rem',
        border: '1px solid var(--line)',
        borderRadius: 8,
        background: 'var(--surface)',
        color: 'var(--ink)',
        outline: 'none',
        boxSizing: 'border-box',
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem 1rem' }}>
                <PageHeader
                    eyebrow="Enterprise"
                    title="Contact Sales"
                    description="Tell us about your needs and we'll get back to you within one business day."
                    backHref="/billing/upgrade"
                    backLabel="← Plans"
                />

                <div className="card" style={{ marginTop: '1.5rem' }}>
                    <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'grid', gap: '1rem' }}>
                        {/* Name + Company */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '0.75rem',
                            }}
                        >
                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                                <label
                                    htmlFor="name"
                                    style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)' }}
                                >
                                    Full name *
                                </label>
                                <input
                                    id="name"
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Alex Johnson"
                                    style={inputStyle}
                                />
                            </div>
                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                                <label
                                    htmlFor="company"
                                    style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)' }}
                                >
                                    Company
                                </label>
                                <input
                                    id="company"
                                    type="text"
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                    placeholder="Acme Corp"
                                    style={inputStyle}
                                />
                            </div>
                        </div>

                        {/* Email + Agent count */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '0.75rem',
                            }}
                        >
                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                                <label
                                    htmlFor="email"
                                    style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)' }}
                                >
                                    Work email *
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="alex@acme.com"
                                    style={inputStyle}
                                />
                            </div>
                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                                <label
                                    htmlFor="agents"
                                    style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)' }}
                                >
                                    Agents needed
                                </label>
                                <select
                                    id="agents"
                                    value={agents}
                                    onChange={(e) => setAgents(e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="">Not sure yet</option>
                                    <option value="1-5">1 – 5</option>
                                    <option value="6-20">6 – 20</option>
                                    <option value="21-50">21 – 50</option>
                                    <option value="50+">50+</option>
                                </select>
                            </div>
                        </div>

                        {/* Message */}
                        <div style={{ display: 'grid', gap: '0.3rem' }}>
                            <label
                                htmlFor="message"
                                style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)' }}
                            >
                                How can we help? *
                            </label>
                            <textarea
                                id="message"
                                required
                                rows={5}
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Tell us about your use case, current team size, or any specific requirements…"
                                style={{ ...inputStyle, resize: 'vertical' }}
                            />
                        </div>

                        {/* Error */}
                        {formState === 'error' && (
                            <p
                                style={{
                                    fontSize: '0.82rem',
                                    color: '#dc2626',
                                    background: '#fef2f2',
                                    border: '1px solid #fecaca',
                                    borderRadius: 6,
                                    padding: '0.5rem 0.75rem',
                                    margin: 0,
                                }}
                            >
                                {errorMsg}
                            </p>
                        )}

                        {/* Submit */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: '0.25rem',
                            }}
                        >
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                                Or email us directly at{' '}
                                <a
                                    href="mailto:hello@agentfarm.dev"
                                    style={{ color: 'var(--brand)' }}
                                >
                                    hello@agentfarm.dev
                                </a>
                            </p>
                            <button
                                type="submit"
                                disabled={formState === 'submitting'}
                                style={{
                                    padding: '0.6rem 1.5rem',
                                    fontSize: '0.875rem',
                                    fontWeight: 700,
                                    background: 'var(--brand)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 8,
                                    cursor: formState === 'submitting' ? 'wait' : 'pointer',
                                    opacity: formState === 'submitting' ? 0.6 : 1,
                                }}
                            >
                                {formState === 'submitting' ? 'Sending…' : 'Send message'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* What happens next */}
                <div
                    className="card"
                    style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem' }}
                >
                    <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700 }}>
                        What happens next
                    </h3>
                    {[
                        'Our team reviews your message within one business day.',
                        'We schedule a 30-minute discovery call to understand your needs.',
                        'You receive a tailored proposal with pricing and onboarding timeline.',
                    ].map((step, i) => (
                        <div
                            key={step}
                            style={{
                                display: 'flex',
                                gap: '0.75rem',
                                alignItems: 'flex-start',
                                fontSize: '0.83rem',
                                color: 'var(--ink-soft)',
                            }}
                        >
                            <span
                                style={{
                                    flexShrink: 0,
                                    width: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    background: 'var(--brand)',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                }}
                            >
                                {i + 1}
                            </span>
                            {step}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function ContactPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <span className="text-gray-400 text-sm">Loading…</span>
                </div>
            }
        >
            <ContactContent />
        </Suspense>
    );
}
