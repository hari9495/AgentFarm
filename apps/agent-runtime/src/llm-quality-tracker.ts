type QualitySignalInput = {
    provider: string;
    actionType: string;
    score: number;
    source?: QualitySignalSource;
    reason?: string;
    metadata?: Record<string, unknown>;
    taskId?: string;
    correlationId?: string;
    recordedAtMs?: number;
};

export type QualitySignalSource = 'runtime_outcome' | 'user_feedback' | 'evaluator' | 'manual';

export type QualitySignalEvent = {
    id: string;
    provider: string;
    actionType: string;
    score: number;
    source: QualitySignalSource;
    reason?: string;
    metadata?: Record<string, unknown>;
    taskId?: string;
    correlationId?: string;
    observedAt: string;
};

type ProviderActionQualityState = {
    samples: Array<{ score: number; at: number }>;
};

const QUALITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_SAMPLES = 100;
const MAX_SIGNAL_EVENTS = 500;

const qualityStore = new Map<string, ProviderActionQualityState>();
const qualityEvents: QualitySignalEvent[] = [];

const clampScore = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0.5;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return Number(value.toFixed(3));
};

const makeKey = (provider: string, actionType: string): string => {
    const normalizedProvider = provider.trim().toLowerCase() || 'unknown';
    const normalizedAction = actionType.trim().toLowerCase() || 'unknown';
    return `${normalizedProvider}:${normalizedAction}`;
};

const parseSource = (value: unknown): QualitySignalSource => {
    if (value === 'runtime_outcome' || value === 'user_feedback' || value === 'evaluator' || value === 'manual') {
        return value;
    }
    return 'runtime_outcome';
};

const pruneSamples = (state: ProviderActionQualityState, now: number): void => {
    const cutoff = now - QUALITY_WINDOW_MS;
    while (state.samples.length > 0 && (state.samples[0]?.at ?? 0) < cutoff) {
        state.samples.shift();
    }
    while (state.samples.length > MAX_SAMPLES) {
        state.samples.shift();
    }
};

export const recordQualitySignal = (input: QualitySignalInput): QualitySignalEvent | null => {
    const provider = typeof input.provider === 'string' ? input.provider : '';
    const actionType = typeof input.actionType === 'string' ? input.actionType : '';
    if (!provider.trim() || !actionType.trim()) {
        return null;
    }

    const key = makeKey(provider, actionType);
    const now = input.recordedAtMs ?? Date.now();
    const state = qualityStore.get(key) ?? { samples: [] };
    pruneSamples(state, now);
    const score = clampScore(input.score);
    state.samples.push({ score, at: now });
    pruneSamples(state, now);
    qualityStore.set(key, state);

    const event: QualitySignalEvent = {
        id: `${key}:${now}:${state.samples.length}`,
        provider: provider.trim().toLowerCase(),
        actionType: actionType.trim().toLowerCase(),
        score,
        source: parseSource(input.source),
        reason: typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : undefined,
        metadata:
            typeof input.metadata === 'object' && input.metadata !== null
                ? input.metadata
                : undefined,
        taskId: typeof input.taskId === 'string' && input.taskId.trim() ? input.taskId.trim() : undefined,
        correlationId:
            typeof input.correlationId === 'string' && input.correlationId.trim()
                ? input.correlationId.trim()
                : undefined,
        observedAt: new Date(now).toISOString(),
    };

    qualityEvents.push(event);
    while (qualityEvents.length > MAX_SIGNAL_EVENTS) {
        qualityEvents.shift();
    }

    return event;
};

const getAverageQuality = (provider: string, actionType: string): number | null => {
    const key = makeKey(provider, actionType);
    const state = qualityStore.get(key);
    if (!state || state.samples.length === 0) {
        return null;
    }

    pruneSamples(state, Date.now());
    if (state.samples.length === 0) {
        return null;
    }

    const total = state.samples.reduce((sum, sample) => sum + sample.score, 0);
    return total / state.samples.length;
};

export const getProviderQualityPenalty = (provider: string, actionType: string): number => {
    const avg = getAverageQuality(provider, actionType);
    if (avg === null) {
        return 0.5;
    }
    return Number((1 - avg).toFixed(3));
};

export const listQualitySignals = (filter?: {
    provider?: string;
    actionType?: string;
    source?: QualitySignalSource;
    limit?: number;
}): QualitySignalEvent[] => {
    const provider = filter?.provider?.trim().toLowerCase();
    const actionType = filter?.actionType?.trim().toLowerCase();
    const source = filter?.source;
    const limit = Math.max(1, Math.min(filter?.limit ?? 100, 500));

    return qualityEvents
        .filter((event) => !provider || event.provider === provider)
        .filter((event) => !actionType || event.actionType === actionType)
        .filter((event) => !source || event.source === source)
        .slice(Math.max(0, qualityEvents.length - limit))
        .reverse();
};

export const getQualitySignalSummary = (filter?: {
    provider?: string;
    actionType?: string;
}): Array<{
    provider: string;
    actionType: string;
    averageScore: number;
    sampleCount: number;
    lastObservedAt: string;
}> => {
    const providerFilter = filter?.provider?.trim().toLowerCase();
    const actionFilter = filter?.actionType?.trim().toLowerCase();
    const now = Date.now();
    const result: Array<{
        provider: string;
        actionType: string;
        averageScore: number;
        sampleCount: number;
        lastObservedAt: string;
    }> = [];

    for (const [key, state] of qualityStore.entries()) {
        pruneSamples(state, now);
        if (state.samples.length === 0) {
            continue;
        }

        const [provider, actionType] = key.split(':', 2);
        if (!provider || !actionType) {
            continue;
        }

        if (providerFilter && provider !== providerFilter) {
            continue;
        }
        if (actionFilter && actionType !== actionFilter) {
            continue;
        }

        const total = state.samples.reduce((sum, sample) => sum + sample.score, 0);
        const lastAtMs = state.samples[state.samples.length - 1]?.at ?? now;
        result.push({
            provider,
            actionType,
            averageScore: Number((total / state.samples.length).toFixed(3)),
            sampleCount: state.samples.length,
            lastObservedAt: new Date(lastAtMs).toISOString(),
        });
    }

    return result.sort((a, b) => a.provider.localeCompare(b.provider) || a.actionType.localeCompare(b.actionType));
};

export const getQualitySignalSnapshot = (): Record<string, { averageScore: number; sampleCount: number }> => {
    const snapshot: Record<string, { averageScore: number; sampleCount: number }> = {};
    for (const summary of getQualitySignalSummary()) {
        snapshot[`${summary.provider}:${summary.actionType}`] = {
            averageScore: summary.averageScore,
            sampleCount: summary.sampleCount,
        };
    }
    return snapshot;
};

export const resetQualitySignals = (): void => {
    qualityStore.clear();
    qualityEvents.length = 0;
};
