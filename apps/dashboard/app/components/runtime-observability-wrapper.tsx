'use client';

/**
 * Thin wrapper around RuntimeObservabilityPanel.
 * The panel self-refreshes via polling, so we can safely pass empty initial data.
 * This lets it be used outside of the SSR main page.
 */

import { RuntimeObservabilityPanel } from './runtime-observability-panel';

const EMPTY_POLICY = {
    allow_password_login: true,
    require_mfa: false,
    allowed_domains: [] as string[],
    session_ttl_seconds: 86400,
};

const EMPTY_HEALTH = {
    runtime_state: 'unknown',
    heartbeat_sent: 0,
    heartbeat_failed: 0,
    heartbeat_success_rate: 0,
    runtime_tier: 'unknown',
    uptime_seconds: 0,
    last_heartbeat_at: null,
    circuit_open: false,
    runtime_restart_count: 0,
    task_queue_depth: 0,
    processed_tasks: 0,
    succeeded_tasks: 0,
    failed_tasks: 0,
};

export default function RuntimeObservabilityWrapper({ botId }: { botId: string }) {
    return (
        <RuntimeObservabilityPanel
            botId={botId}
            connectors={[]}
            internalPolicy={EMPTY_POLICY as never}
            initialLogs={[]}
            initialTransitions={[]}
            initialTranscripts={[]}
            initialInterviewEvents={[]}
            initialCurrentState="unknown"
            initialHealth={EMPTY_HEALTH as never}
        />
    );
}
