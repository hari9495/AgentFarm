/**
 * Stub fallback exports for @agentfarm/agent-runtime sub-modules.
 * Used at runtime when the live agent-runtime modules are unavailable.
 * Typed as `any` so the union (RealClass | Stub) does not cause TS property-miss errors.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── skill-pipeline stubs ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalPipelineEngine: any = {
    run: async () => ({ ok: false, steps: [], runId: 'stub', error: 'stub' }),
    list: () => [],
    listPipelines: () => [],
    getRecentRuns: () => [],
    getRunById: () => null,
};

// ── skill-scheduler stubs ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalScheduler: any = {
    createJob: () => 'stub',
    deleteJob: () => false,
    listJobs: () => [],
    listPending: () => [],
    triggerNow: async () => ({ ok: false }),
};

// ── agent-feedback stubs ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalFeedback: any = {
    submitFeedback: async () => ({ id: 'stub' }),
    getFeedback: () => [],
    getSkillRating: () => null,
    getAllSkillRatings: () => [],
    listAll: () => [],
};

// ── connector-health-monitor stubs ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalHealthMonitor: any = {
    pingConnector: async () => ({ id: 'stub', status: 'unknown' }),
    getAllStatuses: () => [],
    pingAll: async () => [],
};

// ── repo-knowledge-graph stubs ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalKnowledgeGraph: any = {
    listSymbols: () => [],
    getCallEdges: () => [],
    getDepEdges: () => [],
    lastIndexed: null,
    indexWorkspace: async () => undefined,
    getCallers: () => [],
    indexDirectory: async () => undefined,
    suggestSkills: () => [],
};

// ── webhook-ingestion stubs ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalWebhookEngine: any = {
    ingest: async () => ({ ok: false, event: null }),
    register: () => 'stub',
    listRegistrations: () => [],
    deleteRegistration: () => false,
    listEvents: () => [],
};

// ── autonomous-loop-orchestrator stubs ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalLoopOrchestrator: any = {
    execute: async (config: any) => ({
        loop_id: config.loop_id || 'stub',
        state: 'success',
        iterations: 1,
        trace: [],
        final_output: { status: 'ok' },
    }),
    getRunById: () => null,
    getRecentRuns: () => [],
    cancelLoop: () => false,
};

// ── skill-composition-engine stubs ────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalCompositionEngine: any = {
    registerComposition: () => undefined,
    execute: async () => ({
        run_id: 'stub',
        composition_id: 'stub',
        success: true,
        node_outputs: {},
        final_output: {},
        duration_ms: 0,
        path_taken: [],
    }),
    listCompositions: () => [],
    listRuns: () => [],
    getRunById: () => null,
};

// ── provider-state-persistence stubs ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const globalProviderState: any = {
    isInCooldown: () => false,
    recordFailure: () => undefined,
    recordSuccess: () => undefined,
    getState: () => ({ health_score: 100, status: 'healthy' }),
    getAllStates: () => [],
};
