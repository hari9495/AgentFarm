// Minimal meeting-routes manual test server
// Usage: node --loader ts-node/esm test-meeting.mjs
//
// Starts a Fastify server on :3099 with ONLY the desktop-sessions routes,
// pointed at whatever DESKTOP_AGENT_URL is set to (default localhost:5003).

import Fastify from 'fastify';
import { registerDesktopSessionsRoutes } from './src/routes/desktop-sessions.js';

const app = Fastify({ logger: { level: 'info' } });

// No-auth session — returns a fake session so all routes pass auth
const fakeSession = {
    userId: 'test-user',
    tenantId: 'test-tenant',
    workspaceIds: ['ws-1'],
    scope: 'internal',
    expiresAt: Date.now() + 86400_000,
};

await registerDesktopSessionsRoutes(app, {
    getSession: () => fakeSession,
    desktopAgentUrl: process.env.DESKTOP_AGENT_URL ?? 'http://localhost:5003',
});

await app.listen({ port: 3099, host: '127.0.0.1' });
console.log('\n=== Meeting test server ready on http://localhost:3099 ===');
console.log('Desktop-agent target:', process.env.DESKTOP_AGENT_URL ?? 'http://localhost:5003');
console.log('\nTry:');
console.log('  POST http://localhost:3099/v1/desktop-sessions/sess-1/join-meeting');
console.log('  POST http://localhost:3099/v1/desktop-sessions/sess-1/speak');
console.log('  POST http://localhost:3099/v1/desktop-sessions/sess-1/capture-audio\n');
