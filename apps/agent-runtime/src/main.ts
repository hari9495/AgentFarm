import { startRuntimeServer } from './runtime-server.js';
import { ensureVoiceboxRegistered } from './voicebox-mcp-registrar.js';
import { seedVoiceProfiles } from './voice-profile-seeder.js';

// Agent MCP provisioners — existing
import { ensureTesterMcpServers } from './agents/tester/tester-mcp-provisioner.js';
import { ensureSalesRepMcpServers } from './agents/sales-agent/sales-rep-mcp-provisioner.js';
import { ensureTechnicalWriterMcpServers } from './agents/technical-writer/technical-writer-mcp-provisioner.js';
import { ensureContentWriterMcpServers } from './agents/content-writer/content-writer-mcp-provisioner.js';
import { ensureCorporateAssistantMcpServers } from './agents/corporate-assistant/corporate-assistant-mcp-provisioner.js';
import { ensureMarketingSpecialistMcpServers } from './agents/marketing-specialist/marketing-specialist-mcp-provisioner.js';

// Agent MCP provisioners — new
import { ensureDeveloperMcpServers } from './agents/developer/developer-mcp-provisioner.js';
import { ensureFsdMcpServers } from './agents/full-stack-developer/fsd-mcp-provisioner.js';
import { ensureDevopsMcpServers } from './agents/devops/devops-mcp-provisioner.js';
import { ensureRecruiterMcpServers } from './agents/recruiter/recruiter-mcp-provisioner.js';
import { ensureBusinessAnalystMcpServers } from './agents/business-analyst/business-analyst-mcp-provisioner.js';
import { ensureProjectManagerMcpServers } from './agents/project-manager/project-manager-mcp-provisioner.js';
import { ensureCseMcpServers } from './agents/customer-support-executive/customer-support-executive-mcp-provisioner.js';
import { ensureMobileMcpServers } from './agents/mobile/mobile-mcp-provisioner.js';

void startRuntimeServer().catch((err: unknown) => {
    console.error('agent-runtime failed to start', err);
    process.exit(1);
});

// Fire-and-forget: register Voicebox MCP server for the default tenant at startup.
const agentTenantId = process.env['AGENT_TENANT_ID'] ?? 'default';
ensureVoiceboxRegistered(agentTenantId).catch((err: unknown) => {
    console.error('[voicebox-registrar] startup registration failed:', err);
});

// Fire-and-forget: pre-warm MCP connector servers for all 14 agent roles.
// Each provisioner auto-registers only connectors that have an env-var URL
// configured, so roles without relevant env vars are a safe no-op.
const agentMcpProvisioners: Array<(tenantId: string) => Promise<void>> = [
    ensureTesterMcpServers,
    ensureSalesRepMcpServers,
    ensureTechnicalWriterMcpServers,
    ensureContentWriterMcpServers,
    ensureCorporateAssistantMcpServers,
    ensureMarketingSpecialistMcpServers,
    ensureDeveloperMcpServers,
    ensureFsdMcpServers,
    ensureDevopsMcpServers,
    ensureRecruiterMcpServers,
    ensureBusinessAnalystMcpServers,
    ensureProjectManagerMcpServers,
    ensureCseMcpServers,
    ensureMobileMcpServers,
];

for (const provision of agentMcpProvisioners) {
    provision(agentTenantId).catch((err: unknown) => {
        console.warn('[mcp-startup] provisioner failed (non-fatal):', String(err));
    });
}

// Fire-and-forget: seed default voice profiles for all 12 roles.
seedVoiceProfiles().catch((err: unknown) => {
    console.warn('[voice-profile-seeder] startup seeding failed (non-fatal):', err);
});
