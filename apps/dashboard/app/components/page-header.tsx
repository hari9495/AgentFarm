import Link from 'next/link';

type Tone = 'cyan' | 'violet' | 'mint' | 'rose';

type PageHeaderProps = {
    eyebrow: string;
    title: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
    /** Retained for API compatibility; the editorial masthead uses a single petrol accent. */
    tone?: Tone;
    /** Optional right-aligned actions (buttons, toggles). */
    actions?: React.ReactNode;
};

/**
 * Editorial masthead — mono eyebrow + Fraunces title on a hairline rule.
 * Self-contained (global palette tokens + inline styles), so it renders
 * correctly on any page without a `.uk`/`.wf` scope wrapper. This one
 * component styles every PageHeader-based screen in the dashboard.
 */
export function PageHeader({
    eyebrow,
    title,
    description,
    backHref = '/',
    backLabel = '← Dashboard',
    actions,
}: PageHeaderProps) {
    return (
        <header
            style={{
                borderBottom: '1px solid var(--line)',
                padding: '4px 0 20px',
                marginBottom: '1.75rem',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 24,
                flexWrap: 'wrap',
            }}
        >
            <div style={{ minWidth: 0 }}>
                <Link
                    href={backHref}
                    style={{
                        display: 'inline-block',
                        fontFamily: 'var(--font-plex-mono), monospace',
                        fontSize: 11,
                        letterSpacing: '0.04em',
                        color: 'var(--ink-muted)',
                        textDecoration: 'none',
                        marginBottom: 12,
                    }}
                >
                    {backLabel}
                </Link>
                <div
                    style={{
                        fontFamily: 'var(--font-plex-mono), monospace',
                        textTransform: 'uppercase',
                        letterSpacing: '0.16em',
                        fontSize: 10,
                        color: 'var(--accent)',
                        marginBottom: 8,
                    }}
                >
                    {eyebrow}
                </div>
                <h1
                    style={{
                        margin: 0,
                        fontFamily: 'var(--font-fraunces), Georgia, serif',
                        fontWeight: 600,
                        letterSpacing: '-0.015em',
                        lineHeight: 1,
                        fontSize: '2rem',
                        color: 'var(--ink)',
                    }}
                >
                    {title}
                </h1>
                {description && (
                    <p style={{ margin: '0.6rem 0 0', fontSize: '0.9rem', color: 'var(--ink-muted)', maxWidth: '60ch' }}>
                        {description}
                    </p>
                )}
            </div>
            {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
        </header>
    );
}
