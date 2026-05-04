import {
    buildCapabilitySnapshotUrl,
    buildHealthUrl,
    buildInterviewEventsUrl,
    buildKillUrl,
    buildMarketplaceCatalogDeleteUrl,
    buildMarketplaceCatalogUpsertUrl,
    buildMarketplaceInstallUrl,
    buildMarketplaceInvokeUrl,
    buildMarketplaceSkillsUrl,
    buildMarketplaceTelemetryUrl,
    buildMarketplaceUninstallUrl,
    buildLogsUrl,
    buildStateHistoryUrl,
    buildTranscriptsUrl,
    buildUpstreamHeaders,
    getRuntimeBaseUrl,
    resolveLimit,
} from '../runtime-proxy-utils';

export type RouteContract = {
    upstreamUrl: string;
    requestInit: RequestInit;
};

export const buildLogsRouteContract = (requestUrl: string): RouteContract => {
    const { searchParams } = new URL(requestUrl);
    const limit = resolveLimit(searchParams.get('limit'), '50');

    return {
        upstreamUrl: buildLogsUrl(getRuntimeBaseUrl(), limit),
        requestInit: {
            headers: buildUpstreamHeaders(),
            cache: 'no-store',
        },
    };
};

export const buildStateRouteContract = (requestUrl: string): RouteContract => {
    const { searchParams } = new URL(requestUrl);
    const limit = resolveLimit(searchParams.get('limit'), '20');

    return {
        upstreamUrl: buildStateHistoryUrl(getRuntimeBaseUrl(), limit),
        requestInit: {
            headers: buildUpstreamHeaders(),
            cache: 'no-store',
        },
    };
};

export const buildTranscriptsRouteContract = (requestUrl: string): RouteContract => {
    const { searchParams } = new URL(requestUrl);
    const limit = resolveLimit(searchParams.get('limit'), '50');

    return {
        upstreamUrl: buildTranscriptsUrl(getRuntimeBaseUrl(), limit),
        requestInit: {
            headers: buildUpstreamHeaders(),
            cache: 'no-store',
        },
    };
};

export const buildInterviewEventsRouteContract = (requestUrl: string): RouteContract => {
    const { searchParams } = new URL(requestUrl);
    const limit = resolveLimit(searchParams.get('limit'), '200');

    return {
        upstreamUrl: buildInterviewEventsUrl(getRuntimeBaseUrl(), limit),
        requestInit: {
            headers: buildUpstreamHeaders(),
            cache: 'no-store',
        },
    };
};

export const buildHealthRouteContract = (): RouteContract => ({
    upstreamUrl: buildHealthUrl(getRuntimeBaseUrl()),
    requestInit: {
        headers: buildUpstreamHeaders(),
        cache: 'no-store',
    },
});

export const buildKillRouteContract = (): RouteContract => ({
    upstreamUrl: buildKillUrl(getRuntimeBaseUrl()),
    requestInit: {
        method: 'POST',
        headers: buildUpstreamHeaders(true),
    },
});

export const buildCapabilityRouteContract = (): RouteContract => ({
    upstreamUrl: buildCapabilitySnapshotUrl(getRuntimeBaseUrl()),
    requestInit: {
        headers: buildUpstreamHeaders(),
        cache: 'no-store',
    },
});

export const buildMarketplaceSkillsRouteContract = (): RouteContract => ({
    upstreamUrl: buildMarketplaceSkillsUrl(getRuntimeBaseUrl()),
    requestInit: {
        headers: buildUpstreamHeaders(),
        cache: 'no-store',
    },
});

export const buildMarketplaceInstallRouteContract = (body: unknown): RouteContract => ({
    upstreamUrl: buildMarketplaceInstallUrl(getRuntimeBaseUrl()),
    requestInit: {
        method: 'POST',
        headers: buildUpstreamHeaders(true),
        body: JSON.stringify(body),
    },
});

export const buildMarketplaceUninstallRouteContract = (body: unknown): RouteContract => ({
    upstreamUrl: buildMarketplaceUninstallUrl(getRuntimeBaseUrl()),
    requestInit: {
        method: 'POST',
        headers: buildUpstreamHeaders(true),
        body: JSON.stringify(body),
    },
});

export const buildMarketplaceTelemetryRouteContract = (requestUrl: string): RouteContract => {
    const { searchParams } = new URL(requestUrl);
    const limit = resolveLimit(searchParams.get('limit'), '100');

    return {
        upstreamUrl: buildMarketplaceTelemetryUrl(getRuntimeBaseUrl(), limit),
        requestInit: {
            headers: buildUpstreamHeaders(),
            cache: 'no-store',
        },
    };
};

export const buildMarketplaceCatalogUpsertRouteContract = (body: unknown): RouteContract => ({
    upstreamUrl: buildMarketplaceCatalogUpsertUrl(getRuntimeBaseUrl()),
    requestInit: {
        method: 'POST',
        headers: buildUpstreamHeaders(true),
        body: JSON.stringify(body),
    },
});

export const buildMarketplaceCatalogDeleteRouteContract = (skillId: string): RouteContract => ({
    upstreamUrl: buildMarketplaceCatalogDeleteUrl(getRuntimeBaseUrl(), skillId),
    requestInit: {
        method: 'DELETE',
        headers: buildUpstreamHeaders(),
    },
});

export const buildMarketplaceInvokeRouteContract = (body: unknown): RouteContract => ({
    upstreamUrl: buildMarketplaceInvokeUrl(getRuntimeBaseUrl()),
    requestInit: {
        method: 'POST',
        headers: buildUpstreamHeaders(true),
        body: JSON.stringify(body),
    },
});
