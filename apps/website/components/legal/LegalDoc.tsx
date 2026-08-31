/**
 * Shared legal-document layout (Privacy / Terms / Cookies). Clean centered prose
 * on Operations Console tokens — eyebrow + title + last-updated, then intro and
 * numbered sections. Legal text, so no pulled marketing section / no A/B.
 */

export interface LegalSection { heading: string; body: string }

export default function LegalDoc({ title, updatedAt, intro, sections }: { title: string; updatedAt: string; intro: string; sections: readonly LegalSection[] }) {
  return (
    <section className="op-light" style={{ paddingTop: 80, paddingBottom: 96 }}>
      <div className="op-wrap-narrow">
        <p className="op-eyebrow mb-3">Legal</p>
        <h1 className="mb-2 font-[family-name:var(--font-display)] font-extrabold tracking-tight" style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', letterSpacing: '-0.03em', lineHeight: 1.08, color: 'var(--op-ink)' }}>{title}</h1>
        <p className="mb-8 text-[14px]" style={{ color: 'var(--op-muted)' }}>Last updated: {updatedAt}</p>

        <div className="pt-8" style={{ borderTop: '1px solid var(--op-line)' }}>
          <p className="mb-10 text-[17px]" style={{ lineHeight: 1.7, color: 'var(--op-ink-soft)' }}>{intro}</p>
          <div className="space-y-9">
            {sections.map((section, i) => (
              <div key={section.heading}>
                <h2 className="mb-3 flex items-baseline gap-2.5 text-[1.1rem] font-semibold" style={{ letterSpacing: '-0.015em', color: 'var(--op-ink)' }}>
                  <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold" style={{ color: 'var(--op-indigo)' }}>{String(i + 1).padStart(2, '0')}</span>
                  {section.heading}
                </h2>
                <p className="text-[15px]" style={{ lineHeight: 1.7, color: 'var(--op-ink-soft)' }}>{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
