const kpis = [
    { label: 'Active Workspaces', value: '12', trend: '+2 this week' },
    { label: 'Approval SLA (P95)', value: '3m 42s', trend: 'within target' },
    { label: 'Bot Task Success', value: '97.8%', trend: '+1.4%' },
    { label: 'Evidence Completeness', value: '100%', trend: 'gate-ready' },
];

const connectors = [
    { name: 'Jira', status: 'Connected', health: 'Healthy' },
    { name: 'GitHub', status: 'Connected', health: 'Healthy' },
    { name: 'Microsoft Teams', status: 'Connected', health: 'Degraded' },
    { name: 'Company Email', status: 'Token Refresh Required', health: 'Warning' },
];

const approvals = [
    { id: 'APR-1009', action: 'Merge release PR #221', risk: 'high', waiting: '4m' },
    { id: 'APR-1010', action: 'Update Jira release ticket', risk: 'medium', waiting: '2m' },
    { id: 'APR-1011', action: 'Notify stakeholder channel', risk: 'low', waiting: 'auto' },
];

export default function TargetDashboardPage() {
    return (
        <main className="page-shell">
            <header className="hero">
                <p className="eyebrow">Target Product View</p>
                <h1>AgentFarm Operations Dashboard (MVP Target)</h1>
                <p>
                    This is the target dashboard shape we are building: provisioning visibility, approval control,
                    connector reliability, and evidence-first governance in one place.
                </p>
            </header>

            <section className="grid-two">
                {kpis.map((kpi) => (
                    <article key={kpi.label} className="card">
                        <h2>{kpi.label}</h2>
                        <p style={{ fontSize: '1.8rem', margin: '0.2rem 0 0.3rem', fontWeight: 700 }}>{kpi.value}</p>
                        <p style={{ margin: 0, color: '#57534e' }}>{kpi.trend}</p>
                    </article>
                ))}
            </section>

            <section className="grid-two">
                <article className="card">
                    <h2>Provisioning and Runtime Health</h2>
                    <ul className="kv-list">
                        <li>
                            <span>Tenant Status</span>
                            <strong className="badge warn">provisioning</strong>
                        </li>
                        <li>
                            <span>Workspace Status</span>
                            <strong className="badge warn">degraded</strong>
                        </li>
                        <li>
                            <span>Bot Status</span>
                            <strong className="badge neutral">bootstrapping</strong>
                        </li>
                        <li>
                            <span>Current Stage</span>
                            <strong>healthchecking</strong>
                        </li>
                    </ul>
                </article>

                <article className="card">
                    <h2>Connector Reliability</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Connector</th>
                                <th>Status</th>
                                <th>Health</th>
                            </tr>
                        </thead>
                        <tbody>
                            {connectors.map((item) => (
                                <tr key={item.name}>
                                    <td>{item.name}</td>
                                    <td>{item.status}</td>
                                    <td>{item.health}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </article>
            </section>

            <section className="grid-two">
                <article className="card">
                    <h2>Approval Queue</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Action</th>
                                <th>Risk</th>
                                <th>Waiting</th>
                            </tr>
                        </thead>
                        <tbody>
                            {approvals.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.id}</td>
                                    <td>{item.action}</td>
                                    <td>
                                        <span className={`badge ${item.risk}`}>{item.risk}</span>
                                    </td>
                                    <td>{item.waiting}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </article>

                <article className="card">
                    <h2>Evidence and Audit Feed</h2>
                    <ul className="evidence-list">
                        <li>
                            <strong>approval.requested</strong>
                            <span>APR-1009 | actor=policy-engine | reason=high-risk-merge</span>
                        </li>
                        <li>
                            <strong>connector.token.expired</strong>
                            <span>company_email | actor=connector-gateway | remediation=reauthorize</span>
                        </li>
                        <li>
                            <strong>runtime.healthcheck.failed</strong>
                            <span>workspace=Primary | actor=provisioning-service | incident=INC-2201</span>
                        </li>
                    </ul>
                </article>
            </section>
        </main>
    );
}
