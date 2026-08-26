import Link from 'next/link';

type ToolItem = {
    label: string;
    href: string;
    icon: string; // emoji / text icon for now — keeps zero new deps
    description?: string;
};

type ToolCategory = {
    id: string;
    title: string;
    color: string; // tailwind bg class for the category badge
    tools: ToolItem[];
};

const CATEGORIES: ToolCategory[] = [
    {
        id: 'monitoring',
        title: 'Monitoring',
        color: 'bg-blue-100 text-blue-700',
        tools: [
            { label: 'Live Feed', href: '/live', icon: '📡', description: 'Real-time event stream' },
            { label: 'Health & Status', href: '/health', icon: '💚', description: 'Service health overview' },
            { label: 'Observability', href: '/?tab=observability', icon: '📈', description: 'Metrics & traces' },
            { label: 'Audit Log', href: '/?tab=audit', icon: '📋', description: 'All activity history' },
            { label: 'Analytics', href: '/analytics', icon: '📊', description: 'Usage analytics' },
            { label: 'Cost Dashboard', href: '/cost-dashboard', icon: '💹', description: 'Token usage & costs' },
            { label: 'Activity', href: '/activity', icon: '🔔', description: 'Recent activity' },
            { label: 'Historical Metrics', href: '/historical-metrics', icon: '📉', description: 'Per-workspace time-series' },
        ],
    },
    {
        id: 'agents',
        title: 'Agents & Tasks',
        color: 'bg-blue-100 text-blue-700',
        tools: [
            { label: 'Agents', href: '/agents', icon: '🤖', description: 'Manage all agents' },
            { label: 'Task History', href: '/tasks', icon: '📝', description: 'All task records' },
            { label: 'Approvals', href: '/?tab=approvals', icon: '✅', description: 'Pending approvals' },
            { label: 'Agent Chat', href: '/agent-chat', icon: '💬', description: 'Chat interface' },
            { label: 'Orchestration', href: '/orchestration', icon: '🎛️', description: 'Task orchestration' },
            { label: 'CI/CD Triage', href: '/ci', icon: '🔧', description: 'Pipeline triage' },
        ],
    },
    {
        id: 'workflows',
        title: 'Workflows',
        color: 'bg-emerald-100 text-emerald-700',
        tools: [
            { label: 'Workflow Builder', href: '/governance/workflows', icon: '⚙️', description: 'Build workflows' },
            { label: 'Routine Tasks', href: '/routine-tasks', icon: '🔄', description: 'Scheduled routines' },
            { label: 'Scheduled Reports', href: '/scheduled-reports', icon: '📅', description: 'Automated reports' },
            { label: 'Pipelines', href: '/pipelines', icon: '🚀', description: 'Data pipelines' },
            { label: 'Loops', href: '/loops', icon: '🔁', description: 'Iteration loops' },
            { label: 'Handoffs', href: '/handoffs', icon: '🤝', description: 'Task handoffs' },
        ],
    },
    {
        id: 'platform',
        title: 'Platform & Connectors',
        color: 'bg-amber-100 text-amber-700',
        tools: [
            { label: 'Connectors', href: '/connectors', icon: '🔌', description: 'Adapters & integrations' },
            { label: 'Webhook Manager', href: '/webhooks', icon: '🪝', description: 'Inbound & outbound' },
            { label: 'Knowledge Graph', href: '/knowledge-graph', icon: '🧠', description: 'Org knowledge base' },
            { label: 'A/B Tests', href: '/ab-tests', icon: '🧪', description: 'Experiment manager' },
            { label: 'Env Reconciler', href: '/env', icon: '🔬', description: 'Config sync' },
        ],
    },
    {
        id: 'governance',
        title: 'Governance',
        color: 'bg-slate-100 text-slate-700',
        tools: [
            { label: 'Governance', href: '/governance', icon: '🏛️', description: 'Policy & controls' },
            { label: 'Tenant Settings', href: '/tenant-settings', icon: '⚙️', description: 'Tenant configuration' },
            { label: 'Quality', href: '/quality', icon: '🎯', description: 'Quality gates' },
            { label: 'Team', href: '/team', icon: '👥', description: 'Team members' },
            { label: 'Desktop', href: '/desktop', icon: '🖥️', description: 'Remote desktop' },
            { label: 'Snapshots', href: '/snapshots', icon: '📸', description: 'State snapshots' },
        ],
    },
    {
        id: 'business',
        title: 'Business & Growth',
        color: 'bg-rose-100 text-rose-700',
        tools: [
            { label: 'Billing', href: '/billing', icon: '💳', description: 'Plans & invoices' },
            { label: 'Budget', href: '/budget', icon: '💰', description: 'Usage & limits' },
            { label: 'Sales', href: '/sales', icon: '📣', description: 'Sales pipeline' },
            { label: 'Lead Queue', href: '/leads', icon: '🎯', description: 'Inbound leads' },
            { label: 'Retention', href: '/retention', icon: '📊', description: 'Customer retention' },
            { label: 'Meetings', href: '/meetings', icon: '📆', description: 'Scheduled meetings' },
            { label: 'Weekly Quality ROI', href: '/quality-roi', icon: '🏆', description: 'Value vs cost per agent' },
        ],
    },
    {
        id: 'memory',
        title: 'Memory & Context',
        color: 'bg-blue-100 text-blue-700',
        tools: [
            { label: 'Work Memory', href: '/work-memory', icon: '💾', description: 'Agent working memory' },
            { label: 'Memory', href: '/memory', icon: '🗄️', description: 'Persistent memory' },
            { label: 'PR Drafts', href: '/pr-drafts', icon: '📝', description: 'Draft pull requests' },
            { label: 'Notifications', href: '/notifications', icon: '🔔', description: 'Notification rules' },
            { label: 'Skill Catalog', href: '/internal/skills', icon: '📚', description: 'Internal skills' },
        ],
    },
];

export function QuickAccessGrid() {
    return (
        <section className="quick-access-section">
            <div className="quick-access-header">
                <h2 className="quick-access-heading">Quick Access</h2>
                <p className="quick-access-sub">All platform tools, organised by category</p>
            </div>
            <div className="quick-access-categories">
                {CATEGORIES.map((cat) => (
                    <div key={cat.id} className="quick-access-category">
                        <div className="quick-access-category-header">
                            <span className={`quick-access-badge ${cat.color}`}>{cat.title}</span>
                        </div>
                        <div className="quick-access-tools">
                            {cat.tools.map((tool) => (
                                <Link key={tool.href} href={tool.href} className="quick-access-tool">
                                    <span className="quick-access-tool-icon" aria-hidden="true">{tool.icon}</span>
                                    <span className="quick-access-tool-label">{tool.label}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
