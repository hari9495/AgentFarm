import { buildServer } from './server.js';

// EVIDENCE_SERVICE_URL — base URL for incoming calls (set by orchestrator or docker-compose)
// EVIDENCE_SERVICE_PORT — port the service listens on (default: 3005)
// EVIDENCE_SERVICE_TOKEN — shared service token checked on every route except /health
const port = Number(process.env.EVIDENCE_SERVICE_PORT ?? 3005);

const server = await buildServer();
await server.listen({ port, host: '0.0.0.0' });
console.log(`evidence-service listening on port ${port}`);


