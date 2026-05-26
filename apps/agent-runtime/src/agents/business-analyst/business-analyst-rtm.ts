/**
 * Business Analyst — Requirements Traceability Matrix (RTM)
 *
 * Builds and maintains a Requirements Traceability Matrix that links:
 *   Business Objective → Requirement (REQ-NNN) → User Story → Test Case
 *
 * Storage layout in the gateway memory patterns API:
 *   Index key:  ba:rtm-index:<workspaceId>
 *     metadata.entries = JSON-serialised RtmEntry[]
 *
 * Three ingestion paths populate the matrix automatically:
 *   1. extractRequirementsFromBrd()   — parse a BRD → create RtmEntry per REQ-NNN
 *   2. linkStoriesToRequirements()    — parse user stories → link to existing entries
 *      by explicit REQ-NNN reference or LLM semantic match
 *   3. linkTestCasesToStories()       — parse UAT checklists → link Test IDs to stories
 *
 * Call generateRtmDocument() to produce a markdown table ready for Confluence,
 * Notion, or a workspace file.
 *
 * Call getRtmCoverage() to get a gap report: which requirements have no story?
 * Which stories have no test case?
 */

import type { BaProseCallerFn } from './business-analyst-tone-adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RtmEntry {
    requirementId: string;        // "REQ-001"
    requirementText: string;      // Short description of the requirement
    businessObjective?: string;   // The BRD objective this requirement serves
    userStoryRefs: string[];      // Story identifiers or first-line summaries
    testCaseRefs: string[];       // Test case IDs (e.g. "TC-001")
    status: 'uncovered' | 'story_linked' | 'test_linked';
    sourceDocumentId?: string;    // Document ID where the requirement originated
    addedAt: string;              // ISO-8601
}

export interface RtmCoverageReport {
    totalRequirements: number;
    requirementsCoveredByStory: number;
    storiesCoveredByTest: number;
    coveragePercent: number;
    uncoveredRequirements: string[];   // REQ IDs with no linked story
    untestedStories: string[];         // Story refs with no linked test case
    generatedAt: string;
}

// ---------------------------------------------------------------------------
// Gateway storage
// ---------------------------------------------------------------------------

const RTM_KEY = (workspaceId: string) => `ba:rtm-index:${workspaceId}`;

async function loadEntries(
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<RtmEntry[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            {
                method: 'GET',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
                signal: AbortSignal.timeout(10_000),
            },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as {
            patterns?: Array<{ pattern?: string; metadata?: Record<string, unknown> }>;
        };
        const record = (data.patterns ?? []).find((p) => p.pattern === RTM_KEY(workspaceId));
        if (!record?.metadata?.['entries']) return [];
        const raw = record.metadata['entries'];
        return typeof raw === 'string' ? (JSON.parse(raw) as RtmEntry[]) : [];
    } catch {
        return [];
    }
}

async function saveEntries(
    entries: RtmEntry[],
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<void> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const covered = entries.filter((e) => e.status !== 'uncovered').length;
    const total = entries.length;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

    try {
        await fetch(`${base}/v1/memory/patterns`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify({
                workspaceId,
                pattern: RTM_KEY(workspaceId),
                summary: `RTM: ${total} requirements, ${covered} linked, ${pct}% coverage`,
                confidence: 1.0,
                observedCount: total,
                lastSeen: new Date().toISOString(),
                metadata: {
                    entries: JSON.stringify(entries),
                    totalRequirements: total,
                    coveragePercent: pct,
                    updatedAt: new Date().toISOString(),
                },
            }),
            signal: AbortSignal.timeout(12_000),
        });
    } catch (err) {
        console.warn(`[ba-rtm] saveEntries failed: ${String(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Requirement extractor (from BRD)
// ---------------------------------------------------------------------------

/**
 * Parse a BRD and extract all numbered requirements into RTM entries.
 *
 * Recognises:
 *   - "REQ-001: …" or "REQ-001 …"
 *   - "1. The system must …" / "1. The system shall …"
 *   - Markdown table rows with REQ-NNN in the first cell
 */
function extractReqsFromText(
    brdText: string,
    sourceDocumentId?: string,
): RtmEntry[] {
    const entries: RtmEntry[] = [];
    const seen = new Set<string>();
    const addedAt = new Date().toISOString();

    // Pattern 1 — explicit REQ-NNN label
    const reqPattern = /\bREQ-(\d{3,4})\b[:\s]+(.{10,200})/gi;
    let m: RegExpExecArray | null;
    while ((m = reqPattern.exec(brdText)) !== null) {
        const id = `REQ-${m[1]}`;
        if (seen.has(id)) continue;
        seen.add(id);
        entries.push({
            requirementId: id,
            requirementText: m[2]?.trim().slice(0, 200) ?? '',
            userStoryRefs: [],
            testCaseRefs: [],
            status: 'uncovered',
            sourceDocumentId,
            addedAt,
        });
    }

    // Pattern 2 — numbered requirements with must/shall on their own line
    if (entries.length === 0) {
        const lines = brdText.split('\n');
        let autoIndex = 1;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length < 20) continue;
            if (/^(?:\d+\.|[-*])\s+(?:the\s+)?system\s+(?:must|shall)\b/i.test(trimmed)) {
                const id = `REQ-${String(autoIndex).padStart(3, '0')}`;
                if (!seen.has(id)) {
                    seen.add(id);
                    entries.push({
                        requirementId: id,
                        requirementText: trimmed.replace(/^\d+\.\s*|^[-*]\s*/, '').slice(0, 200),
                        userStoryRefs: [],
                        testCaseRefs: [],
                        status: 'uncovered',
                        sourceDocumentId,
                        addedAt,
                    });
                    autoIndex++;
                }
            }
        }
    }

    // Extract business objective for each entry (look for the nearest preceding heading)
    const lines = brdText.split('\n');
    for (const entry of entries) {
        const idx = lines.findIndex((l) => l.includes(entry.requirementId));
        if (idx === -1) continue;
        for (let i = idx - 1; i >= 0; i--) {
            if (/^#{1,3}\s/.test(lines[i] ?? '')) {
                entry.businessObjective = (lines[i] ?? '').replace(/^#{1,3}\s+/, '').trim();
                break;
            }
        }
    }

    return entries;
}

// ---------------------------------------------------------------------------
// Story → requirement linker
// ---------------------------------------------------------------------------

async function llmLinkStories(
    stories: string[],
    requirementIds: string[],
    callLlm: BaProseCallerFn,
): Promise<Record<string, string[]>> {
    if (stories.length === 0 || requirementIds.length === 0) return {};
    try {
        const raw = await callLlm(
            'You are a requirements analyst. Return valid JSON only, no markdown.',
            `For each user story below, identify which requirement IDs from the list it satisfies (partial or full coverage).

Requirement IDs available: ${requirementIds.slice(0, 30).join(', ')}

User stories:
${stories.slice(0, 5).map((s, i) => `Story ${i + 1}: ${s.slice(0, 300)}`).join('\n\n')}

Respond with JSON mapping story index (0-based) to array of requirement IDs:
{"0": ["REQ-001"], "1": ["REQ-002", "REQ-003"]}`,
        );
        if (!raw.text) return {};
        const cleaned = raw.text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
        return JSON.parse(cleaned) as Record<string, string[]>;
    } catch {
        return {};
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a BRD document and add its requirements to the workspace RTM.
 *
 * New entries are merged with any existing ones — duplicate REQ-NNN IDs
 * are skipped if already present.
 */
export async function extractRequirementsFromBrd(params: {
    brdContent: string;
    sourceDocumentId?: string;
    workspaceId: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<{ added: number; total: number }> {
    const existing = await loadEntries(params.workspaceId, params.gatewayBaseUrl, params.serviceToken);
    const existingIds = new Set(existing.map((e) => e.requirementId));

    const extracted = extractReqsFromText(params.brdContent, params.sourceDocumentId);
    const newEntries = extracted.filter((e) => !existingIds.has(e.requirementId));

    const merged = [...existing, ...newEntries];
    await saveEntries(merged, params.workspaceId, params.gatewayBaseUrl, params.serviceToken);

    return { added: newEntries.length, total: merged.length };
}

/**
 * Parse a user story document and link each story to matching RTM entries.
 *
 * First tries explicit REQ-NNN references in the story text.
 * Falls back to LLM semantic matching when no explicit references exist.
 */
export async function linkStoriesToRequirements(params: {
    storyContent: string;
    workspaceId: string;
    gatewayBaseUrl: string;
    serviceToken: string;
    callLlm?: BaProseCallerFn;
}): Promise<{ linked: number; totalEntries: number }> {
    const entries = await loadEntries(params.workspaceId, params.gatewayBaseUrl, params.serviceToken);
    if (entries.length === 0) return { linked: 0, totalEntries: 0 };

    // Split story document into individual story blocks
    const storyBlocks = params.storyContent
        .split(/(?=(?:\n|\r\n)(?:\d+\.\s+)?As\s+a\b|\n#{1,4}\s)/i)
        .map((b) => b.trim())
        .filter((b) => b.length > 20);

    let linked = 0;

    for (let si = 0; si < storyBlocks.length; si++) {
        const block = storyBlocks[si] ?? '';
        const storyRef = block.split('\n')[0]?.trim().slice(0, 120) ?? `Story ${si + 1}`;

        // Explicit REQ-NNN references in the story text
        const explicitRefs = [...block.matchAll(/\bREQ-(\d{3,4})\b/gi)].map((m) => `REQ-${m[1]}`);

        if (explicitRefs.length > 0) {
            for (const entry of entries) {
                if (explicitRefs.includes(entry.requirementId) && !entry.userStoryRefs.includes(storyRef)) {
                    entry.userStoryRefs.push(storyRef);
                    entry.status = entry.testCaseRefs.length > 0 ? 'test_linked' : 'story_linked';
                    linked++;
                }
            }
        }
    }

    // LLM fallback for stories without explicit REQ references
    const unlinkedStories = storyBlocks.filter(
        (b) => !/\bREQ-\d{3,4}\b/i.test(b),
    );

    if (unlinkedStories.length > 0 && params.callLlm) {
        const reqIds = entries.map((e) => e.requirementId);
        const llmLinks = await llmLinkStories(unlinkedStories, reqIds, params.callLlm);

        for (const [idxStr, reqList] of Object.entries(llmLinks)) {
            const idx = parseInt(idxStr, 10);
            const block = unlinkedStories[idx];
            if (!block) continue;
            const storyRef = block.split('\n')[0]?.trim().slice(0, 120) ?? `Story ${idx + 1}`;

            for (const reqId of reqList) {
                const entry = entries.find((e) => e.requirementId === reqId);
                if (entry && !entry.userStoryRefs.includes(storyRef)) {
                    entry.userStoryRefs.push(storyRef);
                    entry.status = entry.testCaseRefs.length > 0 ? 'test_linked' : 'story_linked';
                    linked++;
                }
            }
        }
    }

    await saveEntries(entries, params.workspaceId, params.gatewayBaseUrl, params.serviceToken);
    return { linked, totalEntries: entries.length };
}

/**
 * Parse a UAT checklist and link test case IDs to stories in the RTM.
 *
 * Recognises: "TC-001", "Test ID: TC-001", "Test 1:", or table rows with
 * "Test ID" in the first column.
 */
export async function linkTestCasesToStories(params: {
    uatContent: string;
    workspaceId: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<{ linked: number; totalEntries: number }> {
    const entries = await loadEntries(params.workspaceId, params.gatewayBaseUrl, params.serviceToken);
    if (entries.length === 0) return { linked: 0, totalEntries: 0 };

    // Extract test case IDs and the REQ/story references they mention
    const lines = params.uatContent.split('\n');
    let currentTcId = '';
    let linked = 0;

    for (const line of lines) {
        // Detect test case ID
        const tcMatch = line.match(/\b(TC-\d{3,4})\b/i);
        if (tcMatch) currentTcId = tcMatch[1]?.toUpperCase() ?? '';

        if (!currentTcId) continue;

        // Link to any REQ-NNN mentioned on the same line or nearby
        const reqRefs = [...line.matchAll(/\bREQ-(\d{3,4})\b/gi)].map((m) => `REQ-${m[1]}`);
        for (const reqId of reqRefs) {
            const entry = entries.find((e) => e.requirementId === reqId);
            if (entry && !entry.testCaseRefs.includes(currentTcId)) {
                entry.testCaseRefs.push(currentTcId);
                entry.status = 'test_linked';
                linked++;
            }
        }

        // Also link to story refs by scanning for "As a" excerpts referenced in the UAT
        const storyMatch = line.match(/(?:story|scenario)\s*[:#]?\s*(.{10,80})/i);
        if (storyMatch) {
            const storySnippet = storyMatch[1]?.toLowerCase() ?? '';
            for (const entry of entries) {
                const matchesStory = entry.userStoryRefs.some(
                    (r) => r.toLowerCase().includes(storySnippet.slice(0, 30)),
                );
                if (matchesStory && !entry.testCaseRefs.includes(currentTcId)) {
                    entry.testCaseRefs.push(currentTcId);
                    entry.status = 'test_linked';
                    linked++;
                }
            }
        }
    }

    await saveEntries(entries, params.workspaceId, params.gatewayBaseUrl, params.serviceToken);
    return { linked, totalEntries: entries.length };
}

/**
 * Compute traceability coverage gaps for a workspace.
 */
export async function getRtmCoverage(
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<RtmCoverageReport> {
    const entries = await loadEntries(workspaceId, gatewayBaseUrl, serviceToken);
    const total = entries.length;

    const withStory = entries.filter((e) => e.userStoryRefs.length > 0).length;
    const withTest = entries.filter((e) => e.testCaseRefs.length > 0).length;
    const pct = total > 0 ? Math.round((withStory / total) * 100) : 0;

    const allStoryRefs = [...new Set(entries.flatMap((e) => e.userStoryRefs))];
    const storiesWithTest = new Set(
        entries.filter((e) => e.testCaseRefs.length > 0).flatMap((e) => e.userStoryRefs),
    );
    const untestedStories = allStoryRefs.filter((r) => !storiesWithTest.has(r));

    return {
        totalRequirements: total,
        requirementsCoveredByStory: withStory,
        storiesCoveredByTest: withTest,
        coveragePercent: pct,
        uncoveredRequirements: entries.filter((e) => e.userStoryRefs.length === 0).map((e) => e.requirementId),
        untestedStories,
        generatedAt: new Date().toISOString(),
    };
}

/**
 * Generate a full Requirements Traceability Matrix as a markdown document.
 *
 * The table has columns:
 *   Req ID | Requirement | Business Objective | User Stories | Test Cases | Status
 */
export async function generateRtmDocument(
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<string> {
    const entries = await loadEntries(workspaceId, gatewayBaseUrl, serviceToken);
    const coverage = await getRtmCoverage(workspaceId, gatewayBaseUrl, serviceToken);

    if (entries.length === 0) {
        return '# Requirements Traceability Matrix\n\n_No requirements have been extracted yet. Approve a BRD to populate the matrix._';
    }

    const statusEmoji: Record<RtmEntry['status'], string> = {
        uncovered: '🔴',
        story_linked: '🟡',
        test_linked: '✅',
    };

    const rows = entries.map((e) => {
        const stories = e.userStoryRefs.length > 0
            ? e.userStoryRefs.map((s) => s.slice(0, 60)).join('<br>')
            : '—';
        const tests = e.testCaseRefs.length > 0 ? e.testCaseRefs.join(', ') : '—';
        const obj = e.businessObjective?.slice(0, 50) ?? '—';
        return `| ${e.requirementId} | ${e.requirementText.slice(0, 80)} | ${obj} | ${stories} | ${tests} | ${statusEmoji[e.status]} ${e.status.replace(/_/g, ' ')} |`;
    });

    const lines = [
        '# Requirements Traceability Matrix',
        '',
        `**Generated:** ${new Date().toISOString().slice(0, 10)}  `,
        `**Requirements:** ${coverage.totalRequirements}  `,
        `**Story coverage:** ${coverage.requirementsCoveredByStory}/${coverage.totalRequirements} (${coverage.coveragePercent}%)  `,
        `**Test coverage:** ${coverage.storiesCoveredByTest}/${coverage.totalRequirements}  `,
        '',
        '| Req ID | Requirement | Business Objective | User Stories | Test Cases | Status |',
        '|--------|-------------|-------------------|--------------|------------|--------|',
        ...rows,
    ];

    if (coverage.uncoveredRequirements.length > 0) {
        lines.push('', '## Coverage Gaps', '');
        lines.push(`**Requirements without user stories:** ${coverage.uncoveredRequirements.join(', ')}`);
    }

    if (coverage.untestedStories.length > 0) {
        lines.push('', `**User stories without test cases:** ${coverage.untestedStories.slice(0, 10).join('; ')}`);
    }

    return lines.join('\n');
}
