export type ArtifactReference = {
    url: string;
    sha256: string;
    sizeBytes: number;
    contentType: string;
    provider: 'azure_blob' | 'inline';
};

export type EvidenceBundle = {
    screenshotBefore: ArtifactReference;
    screenshotAfter: ArtifactReference;
    domCheckpoint: ArtifactReference | null;
    domSnapshotStored: boolean;
};

export type ApprovalPacket = {
    change_summary: string;
    impacted_scope: string | null;
    risk_reason: string | null;
    proposed_rollback: string | null;
    lint_status: string | null;
    test_status: string | null;
    packet_complete: boolean;
    evidence_bundle?: EvidenceBundle;
};

type ParsedApprovalPacketFields = Omit<ApprovalPacket, 'packet_complete' | 'evidence_bundle'>;

const FIELD_PREFIXES = {
    change_summary: 'Change summary:',
    impacted_scope: 'Impacted scope:',
    risk_reason: 'Risk reason:',
    proposed_rollback: 'Proposed rollback:',
    lint_status: 'Lint status:',
    test_status: 'Test status:',
} as const;

const normalizeLineForPrefixMatch = (line: string): string => {
    return line
        .trim()
        .replace(/^[\-\*\u2022]+\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .toLowerCase();
};

const extractFieldValue = (line: string, prefix: string): string | null => {
    const normalized = normalizeLineForPrefixMatch(line);
    const normalizedPrefix = prefix.toLowerCase();
    if (!normalized.startsWith(normalizedPrefix)) {
        return null;
    }

    const prefixIndex = normalized.indexOf(normalizedPrefix);
    const rawWithoutDecorators = line
        .trim()
        .replace(/^[\-\*\u2022]+\s*/, '')
        .replace(/^\d+[.)]\s*/, '');
    const value = rawWithoutDecorators.slice(prefixIndex + prefix.length).trim();
    return value.length > 0 ? value : null;
};

export const parseApprovalPacket = (actionSummary: string, evidenceBundle?: EvidenceBundle): ApprovalPacket => {
    const trimmed = (actionSummary ?? '').trim();
    const lines = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const packet: ParsedApprovalPacketFields = {
        change_summary: '',
        impacted_scope: null,
        risk_reason: null,
        proposed_rollback: null,
        lint_status: null,
        test_status: null,
    };

    for (const line of lines) {
        const changeSummary = extractFieldValue(line, FIELD_PREFIXES.change_summary);
        if (changeSummary !== null) {
            packet.change_summary = changeSummary;
            continue;
        }
        const impactedScope = extractFieldValue(line, FIELD_PREFIXES.impacted_scope);
        if (impactedScope !== null) {
            packet.impacted_scope = impactedScope;
            continue;
        }
        const riskReason = extractFieldValue(line, FIELD_PREFIXES.risk_reason);
        if (riskReason !== null) {
            packet.risk_reason = riskReason;
            continue;
        }
        const rollback = extractFieldValue(line, FIELD_PREFIXES.proposed_rollback);
        if (rollback !== null) {
            packet.proposed_rollback = rollback;
            continue;
        }
        const lintStatus = extractFieldValue(line, FIELD_PREFIXES.lint_status);
        if (lintStatus !== null) {
            packet.lint_status = lintStatus;
            continue;
        }
        const testStatus = extractFieldValue(line, FIELD_PREFIXES.test_status);
        if (testStatus !== null) {
            packet.test_status = testStatus;
        }
    }

    if (!packet.change_summary) {
        packet.change_summary = trimmed || 'No change summary provided';
    }

    const packetComplete = Boolean(
        packet.change_summary
        && packet.impacted_scope
        && packet.risk_reason
        && packet.proposed_rollback
        && packet.lint_status
        && packet.test_status,
    );

    return {
        ...packet,
        packet_complete: packetComplete,
        ...(evidenceBundle ? { evidence_bundle: evidenceBundle } : {}),
    };
};
