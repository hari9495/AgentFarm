import {
    buildCapabilitySnapshotUrl,
    buildHealthUrl,
    buildKillUrl,
    buildLogsUrl,
    buildStateHistoryUrl,
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
