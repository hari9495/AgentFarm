/**
 * Business Analyst — Sign-off Ledger
 *
 * Maintains a persistent, queryable audit trail of every approval and rejection
 * decision made on BA documents. Each entry records: who decided, on which
 * document, at which version, and when.
 *
 * Storage layout in the gateway memory patterns API:
 *   Entry key: ba:signoff:<workspaceId>:<documentId>:v<version>:<stakeholderId>
 *   summary:   "<stakeholderName> <decision> <documentTitle> v<version> on <date>"
 *   metadata:  full SignoffEntry JSON
 *
 * Query patterns:
 *   - All sign-offs for a document (any version)      → getDocumentSignoffs()
 *   - All sign-offs by a stakeholder                  → getStakeholderSignoffs()
 *   - Full workspace audit trail                       → generateAuditReport()
 *   - Approval chain for a specific document+version  → getApprovalChain()
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignoffDecision = 'approved' | 'rejected' | 'approved_with_conditions';

export interface SignoffEntry {
    entryId: string;
    documentId: string;
    documentTitle: string;
    documentVersion: number;
    documentType: string;
    stakeholderId: string;
    stakeholderName: string;
    stakeholderRole?: string;
    decision: SignoffDecision;
    comments?: string;
    conditions?: string[];   // For conditional approvals — what must change
    signedAt: string;        // ISO-8601
    workspaceId: string;
}

// ---------------------------------------------------------------------------
// Pattern key helpers
// ---------------------------------------------------------------------------

function entryKey(
    workspaceId: string,
    documentId: string,
    version: number,
    stakeholderId: string,
): string {
    return `ba:signoff:${workspaceId}:${documentId}:v${version}:${stakeholderId}`;
}

function entryPrefix(workspaceId: string): string {
    return `ba:signoff:${workspaceId}:`;
}

function entryId(
    documentId: string,
    version: number,
    stakeholderId: string,
): string {
    return `${documentId}-v${version}-${stakeholderId}`;
}

// ---------------------------------------------------------------------------
// Gateway helpers
// ---------------------------------------------------------------------------

async function fetchAllSignoffs(
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<SignoffEntry[]> {
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

        const prefix = entryPrefix(workspaceId);
        return (data.patterns ?? [])
            .filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith(prefix))
            .map((p) => {
                const meta = p.metadata ?? {};
                const raw = meta['entry'];
                if (typeof raw === 'string') {
                    try { return JSON.parse(raw) as SignoffEntry; } catch { /* fall through */ }
                }
                // Reconstruct from metadata fields if full JSON unavailable
                return {
                    entryId: String(meta['entryId'] ?? ''),
                    documentId: String(meta['documentId'] ?? ''),
                    documentTitle: String(meta['documentTitle'] ?? ''),
                    documentVersion: typeof meta['documentVersion'] === 'number' ? meta['documentVersion'] : 0,
                    documentType: String(meta['documentType'] ?? ''),
                    stakeholderId: String(meta['stakeholderId'] ?? ''),
                    stakeholderName: String(meta['stakeholderName'] ?? ''),
                    stakeholderRole: typeof meta['stakeholderRole'] === 'string' ? meta['stakeholderRole'] : undefined,
                    decision: (meta['decision'] as SignoffDecision) ?? 'approved',
                    comments: typeof meta['comments'] === 'string' ? meta['comments'] : undefined,
                    conditions: Array.isArray(meta['conditions']) ? meta['conditions'] as string[] : undefined,
                    signedAt: String(meta['signedAt'] ?? ''),
                    workspaceId,
                } as SignoffEntry;
            })
            .filter((e) => e.entryId && e.documentId);
    } catch {
        return [];
    }
}

async function writeEntry(
    entry: SignoffEntry,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<void> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const decisionLabel =
        entry.decision === 'approved' ? 'approved'
        : entry.decision === 'rejected' ? 'rejected'
        : 'conditionally approved';
    const dateStr = entry.signedAt.slice(0, 10);
    const summary = `${entry.stakeholderName} ${decisionLabel} "${entry.documentTitle}" v${entry.documentVersion} on ${dateStr}`;

    try {
        await fetch(`${base}/v1/memory/patterns`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify({
                workspaceId: entry.workspaceId,
                pattern: entryKey(entry.workspaceId, entry.documentId, entry.documentVersion, entry.stakeholderId),
                summary: summary.slice(0, 500),
                confidence: 1.0,
                observedCount: 1,
                lastSeen: entry.signedAt,
                metadata: {
                    entry: JSON.stringify(entry),
                    entryId: entry.entryId,
                    documentId: entry.documentId,
                    documentTitle: entry.documentTitle,
                    documentVersion: entry.documentVersion,
                    documentType: entry.documentType,
                    stakeholderId: entry.stakeholderId,
                    stakeholderName: entry.stakeholderName,
                    stakeholderRole: entry.stakeholderRole,
                    decision: entry.decision,
                    comments: entry.comments,
                    conditions: entry.conditions,
                    signedAt: entry.signedAt,
                },
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        console.warn(`[ba-signoff-ledger] writeEntry failed: ${String(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a sign-off decision for a BA document.
 *
 * Call this from onBaDocumentApproved() and onBaDocumentRejected() to build
 * a complete audit trail automatically.
 *
 * Fire-and-forget safe — never throws.
 */
export async function recordSignoff(
    entry: Omit<SignoffEntry, 'entryId' | 'signedAt'> & { signedAt?: string },
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<SignoffEntry> {
    const fullEntry: SignoffEntry = {
        ...entry,
        entryId: entryId(entry.documentId, entry.documentVersion, entry.stakeholderId),
        signedAt: entry.signedAt ?? new Date().toISOString(),
    };

    await writeEntry(fullEntry, gatewayBaseUrl, serviceToken);
    return fullEntry;
}

/**
 * Get all sign-off decisions for a specific document (across all versions).
 *
 * Returns entries sorted by version descending, then by signedAt descending.
 */
export async function getDocumentSignoffs(
    documentId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<SignoffEntry[]> {
    const all = await fetchAllSignoffs(workspaceId, gatewayBaseUrl, serviceToken);
    return all
        .filter((e) => e.documentId === documentId)
        .sort((a, b) =>
            b.documentVersion !== a.documentVersion
                ? b.documentVersion - a.documentVersion
                : b.signedAt.localeCompare(a.signedAt),
        );
}

/**
 * Get the approval chain for a specific document version.
 *
 * Returns all stakeholders who made a decision on this exact version,
 * in chronological order.
 */
export async function getApprovalChain(
    documentId: string,
    version: number,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<SignoffEntry[]> {
    const all = await fetchAllSignoffs(workspaceId, gatewayBaseUrl, serviceToken);
    return all
        .filter((e) => e.documentId === documentId && e.documentVersion === version)
        .sort((a, b) => a.signedAt.localeCompare(b.signedAt));
}

/**
 * Get all sign-off decisions made by a specific stakeholder.
 *
 * Returns entries sorted by signedAt descending (most recent first).
 */
export async function getStakeholderSignoffs(
    stakeholderId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<SignoffEntry[]> {
    const all = await fetchAllSignoffs(workspaceId, gatewayBaseUrl, serviceToken);
    return all
        .filter((e) => e.stakeholderId === stakeholderId)
        .sort((a, b) => b.signedAt.localeCompare(a.signedAt));
}

/**
 * Generate a full audit report for a workspace as a markdown document.
 *
 * Groups entries by document, showing version history and the full
 * stakeholder approval chain for each.
 */
export async function generateAuditReport(
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<string> {
    const all = await fetchAllSignoffs(workspaceId, gatewayBaseUrl, serviceToken);

    if (all.length === 0) {
        return '# BA Document Sign-off Audit Report\n\n_No sign-off decisions recorded yet._';
    }

    // Group by documentId
    const byDoc = new Map<string, SignoffEntry[]>();
    for (const entry of all) {
        const list = byDoc.get(entry.documentId) ?? [];
        list.push(entry);
        byDoc.set(entry.documentId, list);
    }

    const lines: string[] = [
        '# BA Document Sign-off Audit Report',
        '',
        `**Generated:** ${new Date().toISOString().slice(0, 10)}  `,
        `**Total decisions recorded:** ${all.length}  `,
        `**Documents covered:** ${byDoc.size}  `,
        '',
    ];

    for (const [, entries] of byDoc) {
        const sorted = entries.sort((a, b) =>
            b.documentVersion !== a.documentVersion
                ? b.documentVersion - a.documentVersion
                : b.signedAt.localeCompare(a.signedAt),
        );
        const first = sorted[0]!;

        lines.push(`## ${first.documentTitle}`);
        lines.push(`*Type: ${first.documentType} | Document ID: ${first.documentId}*`);
        lines.push('');
        lines.push('| Version | Stakeholder | Role | Decision | Date | Comments |');
        lines.push('|---------|-------------|------|----------|------|----------|');

        for (const e of sorted) {
            const decisionEmoji =
                e.decision === 'approved' ? '✅ Approved'
                : e.decision === 'rejected' ? '❌ Rejected'
                : '⚠️ Conditional';
            const role = e.stakeholderRole ?? '—';
            const comments = e.comments ? e.comments.slice(0, 60) : '—';
            const date = e.signedAt.slice(0, 10);
            lines.push(`| v${e.documentVersion} | ${e.stakeholderName} | ${role} | ${decisionEmoji} | ${date} | ${comments} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Quick summary: how many documents are fully approved vs pending vs rejected?
 */
export async function getLedgerSummary(
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<{
    totalDecisions: number;
    approvals: number;
    rejections: number;
    conditionalApprovals: number;
    uniqueDocuments: number;
    uniqueStakeholders: number;
}> {
    const all = await fetchAllSignoffs(workspaceId, gatewayBaseUrl, serviceToken);
    return {
        totalDecisions: all.length,
        approvals: all.filter((e) => e.decision === 'approved').length,
        rejections: all.filter((e) => e.decision === 'rejected').length,
        conditionalApprovals: all.filter((e) => e.decision === 'approved_with_conditions').length,
        uniqueDocuments: new Set(all.map((e) => e.documentId)).size,
        uniqueStakeholders: new Set(all.map((e) => e.stakeholderId)).size,
    };
}
