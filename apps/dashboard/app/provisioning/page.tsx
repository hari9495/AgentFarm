import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

type ProvisioningStep = {
    step: string;
    status: 'completed' | 'active' | 'pending';
};

type ProvisioningJob = {
    job_id: string;
    tenant_id: string;
    workspace_id: string;
    bot_id: string;
    correlation_id: string;
    plan_id: string;
    runtime_tier: string;
    role_type: string;
    job_status: string;
    current_step: string;
    started_at: string | null;
    completed_at: string | null;
    error_code: string | null;
    error_message: string | null;
    provisioning_latency_ms: number;
    sla_target_ms: number;
    sla_breached: boolean;
    stuck_alert_threshold_ms: number;
    is_stuck: boolean;
    timeout_at: string;
    step_history: ProvisioningStep[];
};

const ORDERED_STEPS = [
    'queued',
    'validating',
    'creating_resources',
    'bootstrapping_vm',
    'starting_container',
    'registering_runtime',
    'healthchecking',
    'completed',
] as const;

type OrderedStep = (typeof ORDERED_STEPS)[number];

const STEP_LABELS: Record<OrderedStep, string> = {
    queued: 'Queued',
    validating: 'Validating',
    creating_resources: 'Creating Resources',
    bootstrapping_vm: 'Bootstrapping VM',
    starting_container: 'Starting Container',
    registering_runtime: 'Registering Runtime',
    healthchecking: 'Health Check',
    completed: 'Completed',
};

const API_BASE = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';

async function fetchJob(jobId: string, token: string): Promise<ProvisioningJob | null> {
    try {
        const res = await fetch(`${API_BASE}/v1/provisioning/jobs/${jobId}`, {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        return (await res.json()) as ProvisioningJob;
    } catch {
        return null;
    }
}

function stepStatus(step: string, currentStep: string): 'completed' | 'active' | 'pending' {
    const currentIdx = ORDERED_STEPS.indexOf(currentStep as OrderedStep);
    const stepIdx = ORDERED_STEPS.indexOf(step as OrderedStep);
    if (stepIdx < 0 || currentIdx < 0) return 'pending';
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'active';
    return 'pending';
}

const pillColor: Record<string, string> = {
    completed: '#166534',
    active: '#1d4ed8',
    pending: '#78716c',
};

const pillBg: Record<string, string> = {
    completed: '#dcfce7',
    active: '#dbeafe',
    pending: '#f5f5f4',
};

const pillBorder: Record<string, string> = {
    completed: '#86efac',
    active: '#93c5fd',
    pending: '#d6d3d1',
};

export default async function ProvisioningPage({
    searchParams,
}: {
    searchParams: Promise<{ jobId?: string }>;
}) {
    const { jobId } = await searchParams;

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('agentfarm_session');
    const token = sessionCookie?.value ? decodeURIComponent(sessionCookie.value) : null;

    if (!token) {
        redirect('/login');
    }

    const job = jobId ? await fetchJob(jobId, token) : null;
    const isCompleted = job?.job_status === 'completed';
    const isFailed = job ? ['failed', 'cleanup_pending', 'cleaned_up'].includes(job.job_status) : false;
    const latencyMin = job ? Math.ceil(job.provisioning_latency_ms / 60_000) : 0;
    const slaMin = job ? Math.ceil(job.sla_target_ms / 60_000) : 10;

    return (
        <main className="page-shell" style={{ maxWidth: 720 }}>
            <header className="hero">
                <p className="eyebrow">AgentFarm</p>
                <h1 style={{ fontSize: '1.6rem' }}>Provisioning your workspace</h1>
                <p style={{ marginTop: '0.3rem', fontSize: '0.9rem', color: '#57534e' }}>
                    Your Developer Agent VM is being prepared. This takes up to{' '}
                    <strong>{slaMin} minutes</strong>.
                </p>
            </header>

            {/* Status banner */}
            {isCompleted && (
                <div
                    style={{
                        background: '#dcfce7',
                        border: '1px solid #86efac',
                        borderRadius: 10,
                        padding: '0.8rem 1rem',
                        marginBottom: '1.2rem',
                        color: '#166534',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                    }}
                >
                    ✓ Bot provisioned and ready.
                    {job?.completed_at &&
                        ` Completed at ${new Date(job.completed_at).toLocaleTimeString()}.`}
                    {' '}
                    <a href="/" style={{ color: '#15803d', textDecoration: 'underline' }}>
                        Go to Dashboard →
                    </a>
                </div>
            )}

            {isFailed && (
                <div
                    style={{
                        background: '#fee2e2',
                        border: '1px solid #fca5a5',
                        borderRadius: 10,
                        padding: '0.8rem 1rem',
                        marginBottom: '1.2rem',
                    }}
                >
                    <p style={{ margin: '0 0 0.3rem', fontWeight: 700, color: '#991b1b', fontSize: '0.92rem' }}>
                        Provisioning failed
                    </p>
                    {job?.error_code && (
                        <p style={{ margin: '0 0 0.2rem', fontSize: '0.84rem', color: '#7f1d1d' }}>
                            Error: <code>{job.error_code}</code>
                        </p>
                    )}
                    {job?.error_message && (
                        <p style={{ margin: 0, fontSize: '0.84rem', color: '#7f1d1d' }}>
                            Hint: {job.error_message}
                        </p>
                    )}
                </div>
            )}

            {/* Job metadata card */}
            {job ? (
                <section className="card" style={{ marginBottom: '1.2rem' }}>
                    <h2 style={{ marginBottom: '0.6rem' }}>Job Details</h2>
                    <ul className="kv-list">
                        <li>
                            <span>Job ID</span>
                            <code style={{ background: '#ece6dc', padding: '0.1rem 0.4rem', borderRadius: 4, fontSize: '0.82rem' }}>
                                {job.job_id}
                            </code>
                        </li>
                        <li>
                            <span>Status</span>
                            <strong
                                className={`badge ${isCompleted ? 'low' : isFailed ? 'high' : 'warn'}`}
                            >
                                {job.job_status}
                            </strong>
                        </li>
                        <li>
                            <span>Role</span>
                            <strong>{job.role_type.replace(/_/g, ' ')}</strong>
                        </li>
                        <li>
                            <span>Runtime Tier</span>
                            <strong>{job.runtime_tier.replace(/_/g, ' ')}</strong>
                        </li>
                        <li>
                            <span>Elapsed</span>
                            <strong className={`badge ${job.sla_breached ? 'high' : 'neutral'}`}>
                                {latencyMin}m / {slaMin}m SLA
                            </strong>
                        </li>
                        {job.is_stuck && (
                            <li>
                                <span>Alert</span>
                                <strong className="badge high">stuck — no progress for over 1 hour</strong>
                            </li>
                        )}
                        {job.started_at && (
                            <li>
                                <span>Started</span>
                                <strong>{new Date(job.started_at).toLocaleTimeString()}</strong>
                            </li>
                        )}
                        {job.timeout_at && !isCompleted && (
                            <li>
                                <span>Timeout At</span>
                                <strong>{new Date(job.timeout_at).toLocaleString()}</strong>
                            </li>
                        )}
                    </ul>
                </section>
            ) : (
                <section className="card" style={{ marginBottom: '1.2rem', color: '#78716c' }}>
                    {jobId
                        ? 'Could not load job details. The job may still be initialising — refresh in a moment.'
                        : 'No job ID provided. Arrive here from the signup page or paste a job ID in the URL (?jobId=...).'}
                </section>
            )}

            {/* Step pipeline */}
            <section className="card">
                <h2 style={{ marginBottom: '0.8rem' }}>Provisioning Pipeline</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {ORDERED_STEPS.map((step, i) => {
                        const resolved = job
                            ? (job.step_history.find((s) => s.step === step)?.status ??
                                stepStatus(step, job.current_step))
                            : 'pending';
                        const color = pillColor[resolved] ?? pillColor.pending;
                        const bg = pillBg[resolved] ?? pillBg.pending;
                        const border = pillBorder[resolved] ?? pillBorder.pending;

                        return (
                            <div
                                key={step}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.55rem 0.8rem',
                                    borderRadius: 8,
                                    background: bg,
                                    border: `1px solid ${border}`,
                                }}
                            >
                                <span
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        background: color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#fff',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}
                                >
                                    {resolved === 'completed' ? '✓' : String(i + 1)}
                                </span>
                                <span style={{ fontWeight: resolved === 'active' ? 700 : 400, color }}>
                                    {STEP_LABELS[step]}
                                </span>
                                {resolved === 'active' && (
                                    <span
                                        style={{
                                            marginLeft: 'auto',
                                            fontSize: '0.78rem',
                                            color: '#1d4ed8',
                                            fontWeight: 600,
                                        }}
                                    >
                                        In progress…
                                    </span>
                                )}
                                {resolved === 'completed' && (
                                    <span
                                        style={{
                                            marginLeft: 'auto',
                                            fontSize: '0.78rem',
                                            color: '#166534',
                                        }}
                                    >
                                        Done
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {!isCompleted && !isFailed && job && (
                    <p
                        style={{
                            marginTop: '1rem',
                            fontSize: '0.82rem',
                            color: '#78716c',
                            textAlign: 'center',
                        }}
                    >
                        Refresh the page to see the latest status.{' '}
                        <a
                            href={`/provisioning?jobId=${job.job_id}`}
                            style={{ color: '#1d4ed8', textDecoration: 'underline' }}
                        >
                            Refresh now
                        </a>
                    </p>
                )}
            </section>

            <p style={{ marginTop: '1.2rem', fontSize: '0.82rem', color: '#a8a29e', textAlign: 'center' }}>
                <a href="/" style={{ color: '#78716c', textDecoration: 'underline' }}>
                    ← Back to Dashboard
                </a>
            </p>
        </main>
    );
}
