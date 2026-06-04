import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'D:/AgentFarm/apps/agent-runtime/src/agents';

const IMPORT_LINE = "import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';";
const IMPORT_ADD  = "\nimport type { MemoryRetrievalConfig } from '@agentfarm/memory-service';";

// Multi-line signature retrievers
const MULTI = [
    {
        rel: 'sales-agent/sales-agent-rag-retriever.ts',
        vars: ['similarArtifacts', 'playbookChunks', 'lessons'],
        calls: [
            'retrieveSimilarSalesArtifacts(query, gatewayBaseUrl, serviceToken)',
            'retrieveSalesPlaybooks(query, gatewayBaseUrl, serviceToken)',
            'retrieveSalesLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'recruiter/recruiter-rag-retriever.ts',
        vars: ['similarDocs', 'complianceChunks', 'lessons'],
        calls: [
            'retrieveSimilarHiringArtifacts(query, gatewayBaseUrl, serviceToken)',
            'retrieveRecruiterCompliance(query, gatewayBaseUrl, serviceToken)',
            'retrieveRecruiterLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'content-writer/content-writer-rag-retriever.ts',
        vars: ['similarContent', 'brandGuideChunks', 'lessons'],
        calls: [
            'retrieveSimilarContent(query, gatewayBaseUrl, serviceToken)',
            'retrieveBrandGuide(query, gatewayBaseUrl, serviceToken)',
            'retrieveContentLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'technical-writer/technical-writer-rag-retriever.ts',
        vars: ['similarDocs', 'styleChunks', 'lessons'],
        calls: [
            'retrieveSimilarDocs(query, gatewayBaseUrl, serviceToken)',
            'retrieveStyleGuide(query, gatewayBaseUrl, serviceToken)',
            'retrieveTwLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'project-manager/project-manager-rag-retriever.ts',
        vars: ['similarDocs', 'templateChunks', 'lessons'],
        calls: [
            'retrieveSimilarPmArtifacts(query, gatewayBaseUrl, serviceToken)',
            'retrievePmTemplates(query, gatewayBaseUrl, serviceToken)',
            'retrievePmLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'developer/developer-rag-retriever.ts',
        vars: ['similarImpls', 'patternChunks', 'lessons'],
        calls: [
            'retrieveSimilarDevImplementations(query, gatewayBaseUrl, serviceToken)',
            'retrieveArchitecturePatterns(query, gatewayBaseUrl, serviceToken)',
            'retrieveDeveloperLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
];

// Single-line signature retrievers
const SINGLE = [
    {
        rel: 'marketing-specialist/marketing-specialist-rag-retriever.ts',
        fn: 'buildMarketingRagContext', q: 'MarketingRagQuery', r: 'MarketingRagContext',
        vars: ['similarCampaigns', 'playbookChunks', 'lessons'],
        calls: [
            'retrieveSimilarCampaigns(query, gatewayBaseUrl, serviceToken)',
            'retrieveChannelPlaybooks(query, gatewayBaseUrl, serviceToken)',
            'retrieveMarketingLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'devops/devops-rag-retriever.ts',
        fn: 'buildDevOpsRagContext', q: 'DevOpsRagQuery', r: 'DevOpsRagContext',
        vars: ['similarArtifacts', 'templateChunks', 'lessons'],
        calls: [
            'retrieveSimilarOpsArtifacts(query, gatewayBaseUrl, serviceToken)',
            'retrieveInfraTemplates(query, gatewayBaseUrl, serviceToken)',
            'retrieveDevOpsLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'full-stack-developer/fsd-rag-retriever.ts',
        fn: 'buildFsdRagContext', q: 'FsdRagQuery', r: 'FsdRagContext',
        vars: ['similarImpls', 'patternChunks', 'lessons'],
        calls: [
            'retrieveSimilarImplementations(query, gatewayBaseUrl, serviceToken)',
            'retrieveDesignPatterns(query, gatewayBaseUrl, serviceToken)',
            'retrieveFsdLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'customer-support-executive/customer-support-rag-retriever.ts',
        fn: 'buildSupportRagContext', q: 'SupportRagQuery', r: 'SupportRagContext',
        vars: ['similarResolutions', 'knowledgeChunks', 'lessons'],
        calls: [
            'retrieveSimilarResolutions(query, gatewayBaseUrl, serviceToken)',
            'retrieveProductKnowledge(query, gatewayBaseUrl, serviceToken)',
            'retrieveSupportLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'corporate-assistant/corporate-assistant-rag-retriever.ts',
        fn: 'buildCorporateRagContext', q: 'CorporateRagQuery', r: 'CorporateRagContext',
        vars: ['similarDocs', 'templateChunks', 'lessons'],
        calls: [
            'retrieveSimilarCommunications(query, gatewayBaseUrl, serviceToken)',
            'retrieveCommunicationTemplates(query, gatewayBaseUrl, serviceToken)',
            'retrieveCorporateLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'mobile/mobile-rag-retriever.ts',
        fn: 'buildMobileRagContext', q: 'MobileRagQuery', r: 'MobileRagContext',
        vars: ['similarComponents', 'guidelineChunks', 'lessons'],
        calls: [
            'retrieveSimilarComponents(query, gatewayBaseUrl, serviceToken)',
            'retrievePlatformGuidelines(query, gatewayBaseUrl, serviceToken)',
            'retrieveMobileLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'tester/tester-rag-retriever.ts',
        fn: 'buildTesterRagContext', q: 'TesterRagQuery', r: 'TesterRagContext',
        vars: ['similarTests', 'templateChunks', 'lessons'],
        calls: [
            'retrieveSimilarTestSuites(query, gatewayBaseUrl, serviceToken)',
            'retrieveTestingTemplates(query, gatewayBaseUrl, serviceToken)',
            'retrieveTesterLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
    {
        rel: 'meeting-agent/meeting-agent-rag-retriever.ts',
        fn: 'buildMeetingRagContext', q: 'MeetingRagQuery', r: 'MeetingRagContext',
        vars: ['similarMeetings', 'templateChunks', 'lessons'],
        calls: [
            'retrieveSimilarMeetings(query, gatewayBaseUrl, serviceToken)',
            'retrieveMeetingTemplates(query, gatewayBaseUrl, serviceToken)',
            'retrieveMeetingLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken)',
        ],
    },
];

function newPromiseAll(vars, calls) {
    const [v0, v1, v2] = vars;
    const [c0, c1, c2] = calls;
    return [
        `    const [${v0}, ${v1}, ${v2}] = await Promise.all([`,
        `        config?.usePriorWork !== false ? ${c0} : Promise.resolve([]),`,
        `        config?.useTemplates !== false ? ${c1} : Promise.resolve([]),`,
        `        config?.useLessons   !== false ? ${c2} : Promise.resolve([]),`,
        `    ]);`,
    ].join('\n');
}

function oldPromiseAll(vars, calls) {
    const [v0, v1, v2] = vars;
    const [c0, c1, c2] = calls;
    return [
        `    const [${v0}, ${v1}, ${v2}] = await Promise.all([`,
        `        ${c0},`,
        `        ${c1},`,
        `        ${c2},`,
        `    ]);`,
    ].join('\n');
}

const errors = [];

for (const { rel, vars, calls } of MULTI) {
    const path = join(BASE, rel);
    let c = readFileSync(path, 'utf-8');

    if (!c.includes(IMPORT_ADD.trim())) {
        c = c.replace(IMPORT_LINE, IMPORT_LINE + IMPORT_ADD);
    }
    const oldSigEnd = '    workspaceId: string,\n): Promise<';
    const newSigEnd = '    workspaceId: string,\n    config?: MemoryRetrievalConfig,\n): Promise<';
    if (!c.includes('config?: MemoryRetrievalConfig')) {
        if (c.includes(oldSigEnd)) c = c.replace(oldSigEnd, newSigEnd);
        else errors.push(`WARN sig: ${rel}`);
    }
    const old = oldPromiseAll(vars, calls);
    const nw  = newPromiseAll(vars, calls);
    if (c.includes(old)) c = c.replace(old, nw);
    else errors.push(`WARN pa: ${rel}`);

    writeFileSync(path, c, 'utf-8');
    console.log(`OK  ${rel}`);
}

for (const { rel, fn, q, r, vars, calls } of SINGLE) {
    const path = join(BASE, rel);
    let c = readFileSync(path, 'utf-8');

    if (!c.includes(IMPORT_ADD.trim())) {
        c = c.replace(IMPORT_LINE, IMPORT_LINE + IMPORT_ADD);
    }
    const oldSig = `export async function ${fn}(query: ${q}, gatewayBaseUrl: string, serviceToken: string, workspaceId: string): Promise<${r}> {`;
    const newSig = `export async function ${fn}(query: ${q}, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<${r}> {`;
    if (!c.includes('config?: MemoryRetrievalConfig')) {
        if (c.includes(oldSig)) c = c.replace(oldSig, newSig);
        else errors.push(`WARN sig: ${rel}`);
    }
    const old = oldPromiseAll(vars, calls);
    const nw  = newPromiseAll(vars, calls);
    if (c.includes(old)) c = c.replace(old, nw);
    else errors.push(`WARN pa: ${rel}`);

    writeFileSync(path, c, 'utf-8');
    console.log(`OK  ${rel}`);
}

if (errors.length) { for (const e of errors) console.error(e); process.exit(1); }
else console.log('\nAll 14 retrievers updated.');
