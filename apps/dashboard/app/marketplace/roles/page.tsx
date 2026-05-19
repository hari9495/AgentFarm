'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '../../components/page-header';

// ── Static role catalog (source of truth for the 12 agent roles) ─────────────

type RoleCard = {
    id: string;
    title: string;
    tagline: string;
    category: string;
    capabilities: string[];
    connectors: string[];
};

const ROLES: RoleCard[] = [
    {
        id: 'developer',
        title: 'Developer',
        tagline: 'Writes code, opens PRs, fixes CI — all from your Jira backlog.',
        category: 'Engineering',
        capabilities: ['Feature implementation', 'PR creation', 'CI triage', 'Code review'],
        connectors: ['GitHub', 'Jira', 'Slack'],
    },
    {
        id: 'full-stack-developer',
        title: 'Full Stack Developer',
        tagline: 'End-to-end delivery across frontend, backend, and infra.',
        category: 'Engineering',
        capabilities: ['Frontend & backend code', 'DB migrations', 'API design', 'Deployment'],
        connectors: ['GitHub', 'Jira', 'Vercel', 'Slack'],
    },
    {
        id: 'tester',
        title: 'Tester',
        tagline: 'Writes test suites, runs regressions, and files bug reports automatically.',
        category: 'Engineering',
        capabilities: ['E2E test authoring', 'Regression runs', 'Bug reporting', 'Coverage analysis'],
        connectors: ['GitHub', 'Jira', 'Slack'],
    },
    {
        id: 'business-analyst',
        title: 'Business Analyst',
        tagline: 'Turns meetings and stakeholder input into structured requirements and tickets.',
        category: 'Product',
        capabilities: ['Requirements drafting', 'Jira ticket creation', 'Process mapping', 'Gap analysis'],
        connectors: ['Jira', 'Confluence', 'Slack', 'Google Docs'],
    },
    {
        id: 'technical-writer',
        title: 'Technical Writer',
        tagline: 'Keeps docs, runbooks, and API references in sync with the codebase.',
        category: 'Product',
        capabilities: ['API docs', 'Runbooks', 'Changelogs', 'README updates'],
        connectors: ['GitHub', 'Confluence', 'Slack'],
    },
    {
        id: 'content-writer',
        title: 'Content Writer',
        tagline: 'Produces blog posts, landing copy, and social content on a schedule.',
        category: 'Marketing',
        capabilities: ['Blog drafting', 'SEO copy', 'Social posts', 'Newsletter content'],
        connectors: ['WordPress', 'HubSpot', 'Slack'],
    },
    {
        id: 'sales-rep',
        title: 'Sales Representative',
        tagline: 'Handles outbound, qualifies leads, and updates CRM automatically.',
        category: 'Sales',
        capabilities: ['Lead outreach', 'CRM updates', 'Follow-up sequences', 'Pipeline reporting'],
        connectors: ['Salesforce', 'HubSpot', 'Gmail', 'Slack'],
    },
    {
        id: 'marketing-specialist',
        title: 'Marketing Specialist',
        tagline: 'Runs campaigns, A/B tests, and reports across paid and organic channels.',
        category: 'Marketing',
        capabilities: ['Campaign management', 'A/B testing', 'Analytics reporting', 'Lead nurturing'],
        connectors: ['HubSpot', 'Google Analytics', 'Mailchimp', 'Slack'],
    },
    {
        id: 'corporate-assistant',
        title: 'Corporate Assistant',
        tagline: 'Manages calendars, schedules meetings, and handles inbox triage.',
        category: 'Operations',
        capabilities: ['Calendar management', 'Meeting scheduling', 'Email triage', 'Travel coordination'],
        connectors: ['Gmail', 'Google Calendar', 'Slack', 'Microsoft Teams'],
    },
    {
        id: 'customer-support',
        title: 'Customer Support Executive',
        tagline: 'Resolves tickets across voice, chat, and email with human-like empathy.',
        category: 'Support',
        capabilities: ['Ticket resolution', 'Live chat', 'Voice support', 'Escalation routing'],
        connectors: ['Zendesk', 'Intercom', 'Gmail', 'Slack'],
    },
    {
        id: 'recruiter',
        title: 'Recruiter',
        tagline: 'Screens resumes, schedules interviews, and keeps candidates warm.',
        category: 'HR',
        capabilities: ['Resume screening', 'Interview scheduling', 'Candidate comms', 'ATS updates'],
        connectors: ['Greenhouse', 'Workday', 'Gmail', 'Slack'],
    },
    {
        id: 'project-manager',
        title: 'Project Manager / Scrum Master',
        tagline: 'Runs standups, tracks blockers, and keeps sprints on schedule.',
        category: 'Product',
        capabilities: ['Sprint management', 'Standup summaries', 'Blocker tracking', 'Velocity reports'],
        connectors: ['Jira', 'Slack', 'Confluence', 'GitHub'],
    },
];

const CATEGORIES = ['All', ...Array.from(new Set(ROLES.map((r) => r.category)))];

// ── Styles ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
    border: '1px solid var(--line)',
    borderRadius: '10px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem',
    background: 'var(--bg)',
    transition: 'box-shadow 0.15s',
};

const badgeStyle: React.CSSProperties = {
    display: 'inline-block',
    fontSize: '0.68rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    padding: '0.2rem 0.55rem',
    borderRadius: '99px',
    background: 'var(--accent-bg, #eff6ff)',
    color: 'var(--accent, #2563eb)',
};

const chipStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    padding: '0.15rem 0.45rem',
    borderRadius: '4px',
    border: '1px solid var(--line)',
    color: 'var(--ink-muted)',
    background: 'transparent',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RoleMarketplacePage() {
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [search, setSearch] = useState('');

    const filtered = ROLES.filter((r) => {
        const matchCategory = selectedCategory === 'All' || r.category === selectedCategory;
        const q = search.toLowerCase();
        const matchSearch =
            !q ||
            r.title.toLowerCase().includes(q) ||
            r.tagline.toLowerCase().includes(q) ||
            r.capabilities.some((c) => c.toLowerCase().includes(q));
        return matchCategory && matchSearch;
    });

    return (
        <main className="page-shell" style={{ maxWidth: 1100 }}>
            <PageHeader
                eyebrow="Hire"
                title="Agent Roles"
                description="Browse all 12 agent roles. Click 'Hire' to set up and deploy a new AI worker for your team."
            />

            {/* Filter bar */}
            <div
                style={{
                    display: 'flex',
                    gap: '0.55rem',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                }}
            >
                <input
                    type="search"
                    placeholder="Search roles…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        fontSize: '0.85rem',
                        minWidth: '220px',
                    }}
                />
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            style={{
                                padding: '0.3rem 0.75rem',
                                borderRadius: '99px',
                                border: '1px solid var(--line)',
                                background: selectedCategory === cat ? 'var(--ink)' : 'transparent',
                                color: selectedCategory === cat ? 'var(--bg)' : 'var(--ink)',
                                fontSize: '0.78rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Role cards grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '1rem',
                }}
            >
                {filtered.map((role) => (
                    <div key={role.id} style={cardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={badgeStyle}>{role.category}</span>
                        </div>

                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                            {role.title}
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--ink-muted)', lineHeight: 1.45 }}>
                            {role.tagline}
                        </p>

                        <div>
                            <p style={{ margin: '0 0 0.35rem', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)' }}>
                                Capabilities
                            </p>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {role.capabilities.map((cap) => (
                                    <span key={cap} style={chipStyle}>{cap}</span>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p style={{ margin: '0 0 0.35rem', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)' }}>
                                Connectors
                            </p>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {role.connectors.map((c) => (
                                    <span key={c} style={{ ...chipStyle, background: 'var(--accent-bg, #eff6ff)', borderColor: 'var(--accent-line, #bfdbfe)', color: 'var(--accent, #2563eb)' }}>
                                        {c}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.75rem' }}>
                            <Link
                                href={`/setup-wizard?role=${role.id}`}
                                style={{
                                    flex: 1,
                                    textAlign: 'center',
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: '6px',
                                    background: 'var(--ink)',
                                    color: 'var(--bg)',
                                    fontSize: '0.82rem',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                }}
                            >
                                Hire →
                            </Link>
                            <Link
                                href={`/marketplace/roles/${role.id}`}
                                style={{
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--line)',
                                    color: 'var(--ink)',
                                    fontSize: '0.82rem',
                                    textDecoration: 'none',
                                }}
                            >
                                Details
                            </Link>
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', marginTop: '2rem' }}>
                    No roles match your search.
                </p>
            )}
        </main>
    );
}
