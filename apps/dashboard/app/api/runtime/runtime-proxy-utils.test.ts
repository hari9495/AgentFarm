import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCapabilitySnapshotUrl,
    buildHealthUrl,
    buildKillUrl,
    buildLogsUrl,
    buildStateHistoryUrl,
    buildUpstreamHeaders,
    DEFAULT_RUNTIME_BASE_URL,
    getRuntimeBaseUrl,
    resolveLimit,
} from './runtime-proxy-utils';

test('resolveLimit falls back for null/empty values', () => {
    assert.equal(resolveLimit(null, '50'), '50');
    assert.equal(resolveLimit('', '20'), '20');
    assert.equal(resolveLimit('   ', '20'), '20');
});

test('resolveLimit preserves meaningful values', () => {
    assert.equal(resolveLimit('100', '20'), '100');
    assert.equal(resolveLimit(' 15 ', '20'), '15');
});

test('buildUpstreamHeaders includes auth when runtime token is set', () => {
    const previous = process.env.AGENT_RUNTIME_TOKEN;
    process.env.AGENT_RUNTIME_TOKEN = 'runtime-token';

    const headers = buildUpstreamHeaders();
    assert.equal(headers.Authorization, 'Bearer runtime-token');
    assert.equal(headers['content-type'], undefined);

    process.env.AGENT_RUNTIME_TOKEN = previous;
});

test('buildUpstreamHeaders includes JSON content-type when requested', () => {
    const previous = process.env.AGENT_RUNTIME_TOKEN;
    delete process.env.AGENT_RUNTIME_TOKEN;

    const headers = buildUpstreamHeaders(true);
    assert.equal(headers['content-type'], 'application/json');
    assert.equal(headers.Authorization, undefined);

    process.env.AGENT_RUNTIME_TOKEN = previous;
});

test('getRuntimeBaseUrl uses default when env var is missing', () => {
    const previous = process.env.AGENT_RUNTIME_BASE_URL;
    delete process.env.AGENT_RUNTIME_BASE_URL;

    assert.equal(getRuntimeBaseUrl(), DEFAULT_RUNTIME_BASE_URL);

    process.env.AGENT_RUNTIME_BASE_URL = previous;
});

test('build url helpers encode query values correctly', () => {
    const baseUrl = 'http://localhost:8080';
    assert.equal(buildLogsUrl(baseUrl, '10'), 'http://localhost:8080/logs?limit=10');
    assert.equal(buildStateHistoryUrl(baseUrl, '10 0'), 'http://localhost:8080/state/history?limit=10%200');
    assert.equal(buildHealthUrl(baseUrl), 'http://localhost:8080/health/live');
    assert.equal(buildKillUrl(baseUrl), 'http://localhost:8080/kill');
    assert.equal(buildCapabilitySnapshotUrl(baseUrl), 'http://localhost:8080/runtime/capability-snapshot');
});
