import { startRuntimeServer } from './runtime-server.js';

void startRuntimeServer().catch((err: unknown) => {
    console.error('agent-runtime failed to start', err);
    process.exit(1);
});
