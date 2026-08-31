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

/** Real brand SVGs (svgl.app, served locally). Missing brands fall back to a monogram. */
export const CONNECTOR_LOGOS: Record<string, string> = {
  GitHub: '/connector-logos/github.svg',
  'GitHub Actions': '/connector-logos/github.svg',
  GitLab: '/connector-logos/gitlab.svg',
  Linear: '/connector-logos/linear.svg',
  Asana: '/connector-logos/asana.svg',
  Notion: '/connector-logos/notion.svg',
  Slack: '/connector-logos/slack.svg',
  'Microsoft Teams': '/connector-logos/teams.svg',
  Gmail: '/connector-logos/gmail.svg',
  Outlook: '/connector-logos/outlook.svg',
  Salesforce: '/connector-logos/salesforce.svg',
  Azure: '/connector-logos/azure.svg',
};

export function ConnectorLogo({ name, size = 40 }: { name: string; size?: number }) {
  const src = CONNECTOR_LOGOS[name];
  if (src) {
    return (
      <div className="flex items-center justify-center rounded-[10px]" style={{ width: size, height: size, background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
        <img src={src} alt={name} style={{ width: size * 0.6, height: size * 0.6, objectFit: 'contain' }} loading="lazy" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center rounded-[10px] text-[13px] font-bold" style={{ width: size, height: size, background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function IntegrationCard({ c }: { c: Connector }) {
  const ga = c.status === 'GA';
  return (
    <div className="op-lift rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
      <div className="flex items-start justify-between gap-2">
        <ConnectorLogo name={c.name} size={40} />
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
