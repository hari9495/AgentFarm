export const DEFAULT_RUNTIME_BASE_URL = 'http://localhost:8080';

export const getRuntimeBaseUrl = (): string => process.env.AGENT_RUNTIME_BASE_URL ?? DEFAULT_RUNTIME_BASE_URL;

export const resolveLimit = (value: string | null, fallback: string): string => {
    if (!value) {
        return fallback;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }
    return trimmed;
};

export const buildUpstreamHeaders = (contentTypeJson = false): Record<string, string> => {
    const headers: Record<string, string> = {};

    if (contentTypeJson) {
        headers['content-type'] = 'application/json';
    }

    const runtimeToken = process.env.AGENT_RUNTIME_TOKEN;
    if (runtimeToken) {
        headers['Authorization'] = `Bearer ${runtimeToken}`;
    }

    return headers;
};

export const buildLogsUrl = (baseUrl: string, limit: string): string => (
    `${baseUrl}/logs?limit=${encodeURIComponent(limit)}`
);

export const buildStateHistoryUrl = (baseUrl: string, limit: string): string => (
    `${baseUrl}/state/history?limit=${encodeURIComponent(limit)}`
);

export const buildTranscriptsUrl = (baseUrl: string, limit: string): string => (
    `${baseUrl}/runtime/transcripts?limit=${encodeURIComponent(limit)}`
);

export const buildInterviewEventsUrl = (baseUrl: string, limit: string): string => (
    `${baseUrl}/runtime/interview-events?limit=${encodeURIComponent(limit)}`
);

export const buildHealthUrl = (baseUrl: string): string => `${baseUrl}/health/live`;

export const buildKillUrl = (baseUrl: string): string => `${baseUrl}/kill`;

export const buildCapabilitySnapshotUrl = (baseUrl: string): string => `${baseUrl}/runtime/capability-snapshot`;
