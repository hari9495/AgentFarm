import Link from 'next/link';

type Tone = 'cyan' | 'violet' | 'mint' | 'rose';

type PageHeaderProps = {
    eyebrow: string;
    title: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
    tone?: Tone;
};

export function PageHeader({
    eyebrow,
    title,
    description,
    backHref = '/',
    backLabel = '← Dashboard',
    tone = 'cyan',
}: PageHeaderProps) {
    return (
        <div className="magic-canvas relative overflow-hidden rounded-2xl mb-8 px-7 py-7 border border-[var(--m-hairline)]">
            <div aria-hidden className="absolute inset-0 pointer-events-none opacity-40">
                <div
                    className="orb orb-3"
                    style={{ width: '260px', height: '160px', top: '-40px', right: '0', position: 'absolute' }}
                />
                <div className="cyber-grid" />
            </div>
            <div className="relative z-10">
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-1 text-xs text-[var(--m-ink-muted)] hover:text-[var(--m-ink)] transition-colors mb-3 no-underline"
                >
                    {backLabel}
                </Link>
                <div className="mb-2">
                    <span className={`neon-chip neon-chip-${tone} text-[10px]`}>
                        <span className="dot" aria-hidden />
                        {eyebrow}
                    </span>
                </div>
                <h1 className="text-[1.6rem] font-black tracking-[-0.03em] text-[var(--m-ink)]">
                    <span className="holo-text">{title}</span>
                </h1>
                {description && (
                    <p className="mt-1.5 text-sm text-[var(--m-ink-muted)]">{description}</p>
                )}
            </div>
        </div>
    );
}
