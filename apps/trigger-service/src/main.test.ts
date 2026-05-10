import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './main.js';

describe('GET /health', () => {
    it('returns 200', async () => {
        const { fastify } = buildApp({});
        try {
            const res = await fastify.inject({ method: 'GET', url: '/health' });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { status: string };
            assert.equal(body.status, 'ok');
        } finally {
            await fastify.close();
        }
    });
});

describe('GET /status — sources', () => {
    it('sources.webhook is always true', async () => {
        const { fastify } = buildApp({});
        try {
            const res = await fastify.inject({ method: 'GET', url: '/status' });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { sources: { webhook: boolean; email: boolean; slack: boolean } };
            assert.equal(body.sources.webhook, true);
        } finally {
            await fastify.close();
        }
    });

    it('sources.email is false when EMAIL_IMAP_HOST not set', async () => {
        const { fastify } = buildApp({});
        try {
            const res = await fastify.inject({ method: 'GET', url: '/status' });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { sources: { email: boolean } };
            assert.equal(body.sources.email, false);
        } finally {
            await fastify.close();
        }
    });

    it('sources.slack is false when SLACK_BOT_TOKEN not set', async () => {
        const { fastify } = buildApp({});
        try {
            const res = await fastify.inject({ method: 'GET', url: '/status' });
            assert.equal(res.statusCode, 200);
            const body = res.json() as { sources: { slack: boolean } };
            assert.equal(body.sources.slack, false);
        } finally {
            await fastify.close();
        }
    });
});
