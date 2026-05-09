import { startRuntimeServer } from './runtime-server.js';
import { ensureVoiceboxRegistered } from './voicebox-mcp-registrar.js';

void startRuntimeServer().catch((err: unknown) => {
    console.error('agent-runtime failed to start', err);
    process.exit(1);
});

// Fire-and-forget: register Voicebox MCP server for the default tenant at startup.
const agentTenantId = process.env['AGENT_TENANT_ID'] ?? 'default';
ensureVoiceboxRegistered(agentTenantId).catch((err: unknown) => {
    console.error('[voicebox-registrar] startup registration failed:', err);
});
