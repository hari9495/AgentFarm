import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCloudInitScript } from './vm-bootstrap.js';

const cfg = {
    correlationId: 'corr-1',
    tenantId: 'tenant-acme',
    workspaceId: 'ws-1',
    botId: 'bot-12345678',
    roleType: 'developer',
    evidenceApiEndpoint: 'http://api-gateway:3000',
    contractVersion: '1.0.0',
};

const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    try { fn(); } finally {
        for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
};

const baseEnv = {
    AZURE_BOT_IMAGE: 'acr.azurecr.io/bot:1', AZURE_BOT_REGISTRY_SERVER: 'acr.azurecr.io',
    AZURE_BOT_REGISTRY_USERNAME: 'u', AZURE_BOT_REGISTRY_PASSWORD: 'p', AZURE_REGION: 'southindia',
};

const decode = () => Buffer.from(buildCloudInitScript(cfg), 'base64').toString('utf8');

test('collector is NOT injected when AXIOM_TOKEN is unset', () => {
    withEnv({ ...baseEnv, AXIOM_TOKEN: undefined }, () => {
        const yaml = decode();
        assert.ok(yaml.includes('agentfarm-bot.service'), 'bot service still present');
        assert.doesNotMatch(yaml, /agentfarm-otel-collector/);
        assert.doesNotMatch(yaml, /otel-collector-config\.yaml/);
    });
});

test('collector IS injected, tenant-tagged, when AXIOM_TOKEN is set', () => {
    withEnv({ ...baseEnv, AXIOM_TOKEN: 'xaat-ingest', AXIOM_DATASET_LOGS: 'agentfarm-logs' }, () => {
        const yaml = decode();
        // systemd service + config decode + start
        assert.match(yaml, /agentfarm-otel-collector\.service/);
        assert.match(yaml, /systemctl start agentfarm-otel-collector/);
        assert.match(yaml, /base64 -d > \/etc\/agentfarm\/otel-collector-config\.yaml/);
        // env file carries the token and THIS VM's tenant id
        assert.match(yaml, /AXIOM_TOKEN=xaat-ingest/);
        assert.match(yaml, /AF_TENANT_ID=tenant-acme/);
        // reads the docker socket + container logs read-only
        assert.match(yaml, /\/var\/lib\/docker\/containers:\/var\/lib\/docker\/containers:ro/);
        assert.match(yaml, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock:ro/);
        // the embedded collector config stamps tenant_id
        const b64 = yaml.match(/echo ([A-Za-z0-9+/=]+) \| base64 -d/)?.[1] ?? '';
        const config = Buffer.from(b64, 'base64').toString('utf8');
        assert.match(config, /key: tenant_id/);
        assert.match(config, /filelog/);
    });
});

test('produced cloud-init is valid base64 and starts with #cloud-config', () => {
    withEnv({ ...baseEnv, AXIOM_TOKEN: 'xaat-ingest' }, () => {
        assert.match(decode(), /^#cloud-config/);
    });
});
