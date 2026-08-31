/**
 * Integrations card grid — 21st.dev: meschacirung/integrations-three. Faithful
 * card layout (icon slot → title → clamped description) in a responsive grid,
 * grouped by category and enriched with auth + GA/Beta status. Monogram icons
 * stand in until real brand logos are served. Operations Console palette.
 */

export interface Connector {
  name: string;
  description: string;
  auth: string;
  status: string;
}
export interface ConnectorCategory {
  name: string;
  connectors: Connector[];
}

function IntegrationCard({ c }: { c: Connector }) {
  const ga = c.status === 'GA';
  return (
    <div className="op-lift rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[13px] font-bold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>
          {c.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ background: ga ? 'var(--op-indigo-soft)' : 'var(--op-pending-soft, #fdeecd)', color: ga ? 'var(--op-indigo)' : 'var(--op-pending)' }}>
          {c.status}
        </span>
      </div>
      <div className="mt-5 space-y-1.5">
        <h3 className="text-[17px] font-semibold" style={{ letterSpacing: '-0.015em', color: 'var(--op-ink)' }}>{c.name}</h3>
        <p className="text-[13px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{c.description}</p>
      </div>
      <p className="mt-4 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>Auth · {c.auth}</p>
    </div>
  );
}

export default function IntegrationsCardGrid({ categories }: { categories: ConnectorCategory[] }) {
  return (
    <div className="op-wrap">
      <div className="space-y-14">
        {categories.map((cat) => (
          <div key={cat.name}>
            <h3 className="mb-6 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--op-muted)' }}>{cat.name}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cat.connectors.map((c) => <IntegrationCard key={c.name} c={c} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
