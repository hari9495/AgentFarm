import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCapabilityRouteContract,
    buildHealthRouteContract,
    buildInterviewEventsRouteContract,
    buildKillRouteContract,
    buildMarketplaceCatalogDeleteRouteContract,
    buildMarketplaceCatalogUpsertRouteContract,
    buildMarketplaceInstallRouteContract,
    buildMarketplaceSkillsRouteContract,
    buildMarketplaceTelemetryRouteContract,
    buildMarketplaceUninstallRouteContract,
    buildWeeklyQualityRoiRouteContract,
    buildLogsRouteContract,
    buildStateRouteContract,
    buildTranscriptsRouteContract,
} from './route-contract';

test('buildLogsRouteContract uses default limit when query is absent', () => {
    const contract = buildLogsRouteContract('http://localhost:3001/api/runtime/bot-1/logs');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/logs?limit=50');
    assert.deepEqual(contract.requestInit, {
        headers: {},
        cache: 'no-store',
    });
});

test('buildLogsRouteContract preserves and encodes explicit limit query', () => {
    const contract = buildLogsRouteContract('http://localhost:3001/api/runtime/bot-1/logs?limit=10 0');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/logs?limit=10%200');
    assert.equal(contract.requestInit.cache, 'no-store');
});

test('buildStateRouteContract uses default limit and cache contract', () => {
    const contract = buildStateRouteContract('http://localhost:3001/api/runtime/bot-1/state');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/state/history?limit=20');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
});

test('buildTranscriptsRouteContract uses default limit and cache contract', () => {
    const contract = buildTranscriptsRouteContract('http://localhost:3001/api/runtime/bot-1/transcripts');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/transcripts?limit=50');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
});

test('buildInterviewEventsRouteContract uses default limit and cache contract', () => {
    const contract = buildInterviewEventsRouteContract('http://localhost:3001/api/runtime/bot-1/interview-events');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/interview-events?limit=200');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
});

test('buildHealthRouteContract creates no-store GET-style request shape', () => {
    const contract = buildHealthRouteContract();

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/health/live');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
    assert.equal(contract.requestInit.method, undefined);
});

test('buildKillRouteContract creates POST request with JSON content type', () => {
    const contract = buildKillRouteContract();

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/kill');
    assert.equal(contract.requestInit.method, 'POST');
    assert.deepEqual(contract.requestInit.headers, {
        'content-type': 'application/json',
    });
});

test('buildCapabilityRouteContract creates no-store GET request shape', () => {
    const contract = buildCapabilityRouteContract();

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/capability-snapshot');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
    assert.equal(contract.requestInit.method, undefined);
});

test('buildMarketplaceSkillsRouteContract creates no-store GET request shape', () => {
    const contract = buildMarketplaceSkillsRouteContract();

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/marketplace/skills');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
    assert.equal(contract.requestInit.method, undefined);
});

test('buildMarketplaceInstallRouteContract creates JSON POST request shape', () => {
    const contract = buildMarketplaceInstallRouteContract({ skill_id: 'skill-one' });

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/marketplace/install');
    assert.equal(contract.requestInit.method, 'POST');
    assert.deepEqual(contract.requestInit.headers, {
        'content-type': 'application/json',
    });
    assert.equal(contract.requestInit.body, JSON.stringify({ skill_id: 'skill-one' }));
});

test('buildMarketplaceUninstallRouteContract creates JSON POST request shape', () => {
    const contract = buildMarketplaceUninstallRouteContract({ skill_id: 'skill-one' });

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/marketplace/uninstall');
    assert.equal(contract.requestInit.method, 'POST');
    assert.deepEqual(contract.requestInit.headers, {
        'content-type': 'application/json',
    });
    assert.equal(contract.requestInit.body, JSON.stringify({ skill_id: 'skill-one' }));
});

test('buildMarketplaceTelemetryRouteContract applies limit fallback and cache shape', () => {
    const contract = buildMarketplaceTelemetryRouteContract('http://localhost:3001/api/runtime/bot-1/marketplace/telemetry');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/marketplace/telemetry?limit=100');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
});

test('buildMarketplaceCatalogUpsertRouteContract creates JSON POST request shape', () => {
    const contract = buildMarketplaceCatalogUpsertRouteContract({ id: 'managed-one' });

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/marketplace/catalog/skills');
    assert.equal(contract.requestInit.method, 'POST');
    assert.deepEqual(contract.requestInit.headers, {
        'content-type': 'application/json',
    });
    assert.equal(contract.requestInit.body, JSON.stringify({ id: 'managed-one' }));
});

test('buildMarketplaceCatalogDeleteRouteContract creates DELETE request shape', () => {
    const contract = buildMarketplaceCatalogDeleteRouteContract('custom/skill');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/marketplace/catalog/skills/custom%2Fskill');
    assert.equal(contract.requestInit.method, 'DELETE');
    assert.deepEqual(contract.requestInit.headers, {});
    assert.equal(contract.requestInit.cache, undefined);
});

test('buildWeeklyQualityRoiRouteContract defaults to latest report without generation trigger', () => {
    const contract = buildWeeklyQualityRoiRouteContract('http://localhost:3001/api/runtime/bot-1/weekly-quality-roi');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/reports/weekly-quality-roi');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
    assert.equal(contract.requestInit.method, undefined);
});

test('buildWeeklyQualityRoiRouteContract forwards generate=true query', () => {
    const contract = buildWeeklyQualityRoiRouteContract('http://localhost:3001/api/runtime/bot-1/weekly-quality-roi?generate=true');

    assert.equal(contract.upstreamUrl, 'http://localhost:8080/runtime/reports/weekly-quality-roi?generate=true');
    assert.equal(contract.requestInit.cache, 'no-store');
    assert.deepEqual(contract.requestInit.headers, {});
});
