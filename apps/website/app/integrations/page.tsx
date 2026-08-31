import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import SubPageHero from '@/components/shared/SubPageHero';
import SharedCTA from '@/components/shared/SharedCTA';
import IntegrationsCardGrid, { ConnectorLogo, CONNECTOR_LOGOS } from '@/components/integrations/IntegrationsCardGrid';

export const metadata: Metadata = {
  title: 'Integrations — 18 AgentFarms Connectors and Workflows',
  description:
    'Connect AgentFarms AI workers to the tools your team uses. 18 connectors covering code, task management, messaging, and CRM. OAuth and API key setup included.',
};

const categories = [
  {
    name: 'Code & Version Control',
    connectors: [
      { name: 'GitHub', description: 'Open PRs, run CI checks, review code, and merge branches with full audit trail.', auth: 'OAuth 2.0', status: 'GA' },
      { name: 'GitLab', description: 'Manage merge requests, pipelines, and issue tracking across self-hosted or cloud.', auth: 'OAuth 2.0', status: 'GA' },
      { name: 'Bitbucket', description: 'Pull request workflow and CI integration for Bitbucket Cloud and Server.', auth: 'OAuth 2.0', status: 'GA' },
    ],
  },
  {
    name: 'Task & Project Management',
    connectors: [
      { name: 'Jira', description: 'Create, update, and resolve tickets. Link tasks to PRs and track delivery status.', auth: 'OAuth 2.0', status: 'GA' },
      { name: 'Linear', description: 'Issue creation, cycle management, and project progress tracking.', auth: 'API Key', status: 'GA' },
      { name: 'Asana', description: 'Task assignment, project tracking, and team workload management.', auth: 'OAuth 2.0', status: 'GA' },
      { name: 'Notion', description: 'Read and write to pages, databases, and project wikis.', auth: 'OAuth 2.0', status: 'Beta' },
    ],
  },
  {
    name: 'Messaging & Communication',
    connectors: [
      { name: 'Slack', description: 'Receive task assignments, send notifications, and surface approvals in channels.', auth: 'OAuth 2.0', status: 'GA' },
      { name: 'Microsoft Teams', description: 'Task intake, approval routing, and status updates via Teams channels and bots.', auth: 'OAuth 2.0', status: 'GA' },
    ],
  },
  {
    name: 'Email',
    connectors: [
      { name: 'Gmail', description: 'Draft, send, and manage email threads. Handle support inboxes and follow-ups.', auth: 'OAuth 2.0', status: 'GA' },
      { name: 'Outlook', description: 'Microsoft 365 email integration for enterprise communication workflows.', auth: 'OAuth 2.0', status: 'GA' },
    ],
  },
  {
    name: 'CRM & Sales',
    connectors: [
      { name: 'Salesforce', description: 'Read and update contacts, opportunities, and accounts. Log call and email activity.', auth: 'OAuth 2.0', status: 'GA' },
      { name: 'HubSpot', description: 'Contact enrichment, deal tracking, and sequence management.', auth: 'OAuth 2.0', status: 'GA' },
    ],
  },
  {
    name: 'Customer Support',
    connectors: [
      { name: 'Zendesk', description: 'Create and update tickets, draft replies, and escalate issues based on policy.', auth: 'API Key', status: 'GA' },
      { name: 'Intercom', description: 'Respond to conversations, route tickets, and update contact records.', auth: 'OAuth 2.0', status: 'Beta' },
    ],
  },
  {
    name: 'Cloud & Infrastructure',
    connectors: [
      { name: 'Azure', description: 'Provision resources, query deployment status, and manage Azure DevOps pipelines.', auth: 'Service Principal', status: 'GA' },
      { name: 'GitHub Actions', description: 'Trigger and monitor CI/CD pipelines, inspect logs, and respond to failures.', auth: 'OAuth 2.0', status: 'GA' },
    ],
  },
];

const highlights = [
  'OAuth 2.0 token auto-refresh — workers never lose access mid-task',
  'Per-workspace credential isolation — no cross-tenant access',
  'Scoped permissions — workers only access what the role requires',
  'Full connector health monitoring with automatic error surfacing',
  'Approval gate before any write operation on sensitive systems',
];

const totalConnectors = categories.reduce((n, c) => n + c.connectors.length, 0);

export default function IntegrationsPage() {
  return (
    <div>
      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow="Integrations"
        titleLead="Connect every tool your"
        titleAccent="team already uses"
        description={`${totalConnectors} connectors across code, tasks, messaging, CRM, support, and infrastructure. Workers get scoped access — no broader than the role requires.`}
        primary={{ label: 'Start free trial', href: '/get-started' }}
        secondary={{ label: 'See setup guide', href: '/docs/quickstart' }}
        visual={
          <div className="mx-auto w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--op-muted)' }}>{totalConnectors} connectors live</p>
            <div className="grid grid-cols-4 gap-2.5">
              {[...new Set(categories.flatMap((c) => c.connectors).map((c) => c.name).filter((n) => CONNECTOR_LOGOS[n]))].slice(0, 12).map((name) => (
                <div key={name} className="flex aspect-square items-center justify-center" title={name}>
                  <ConnectorLogo name={name} size={52} />
                </div>
              ))}
            </div>
          </div>
        }
      />

      {/* Highlights */}
      <section className="op-soft" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <div className="op-wrap">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map((h) => (
              <li key={h} className="flex items-start gap-2.5 text-[15px]" style={{ color: 'var(--op-ink-soft)' }}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--op-indigo)' }} />
                <span style={{ lineHeight: 1.5 }}>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Connector catalog — pulled IntegrationsCardGrid (21st.dev: meschacirung/integrations-three) */}
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <div className="op-wrap mb-12">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>Integrate with your favorite tools</h2>
          <p className="mt-3 max-w-xl text-[17px]" style={{ color: 'var(--op-muted)' }}>Connect seamlessly across code, tasks, messaging, CRM, support, and infrastructure — every write gated by policy.</p>
        </div>
        <IntegrationsCardGrid categories={categories} />
      </section>

      {/* CTA — shared SharedCTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="Enterprise · custom connectors"
          heading="Need a connector that's not listed?"
          description="Enterprise plans include custom connector development for internal tools and proprietary systems."
          primary={{ label: 'Request a connector', href: '/contact' }}
          secondary={{ label: 'Setup guide', href: '/docs/quickstart' }}
        />
      </section>
    </div>
  );
}
