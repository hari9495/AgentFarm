export type ApprovalPacket = {
    change_summary: string;
    impacted_scope: string | null;
    risk_reason: string | null;
    proposed_rollback: string | null;
    lint_status: string | null;
    test_status: string | null;
    packet_complete: boolean;
};

type ParsedApprovalPacketFields = Omit<ApprovalPacket, 'packet_complete'>;

const FIELD_PREFIXES = {
    change_summary: 'Change summary:',
    impacted_scope: 'Impacted scope:',
    risk_reason: 'Risk reason:',
    proposed_rollback: 'Proposed rollback:',
    lint_status: 'Lint status:',
    test_status: 'Test status:',
} as const;

export const parseApprovalPacket = (actionSummary: string): ApprovalPacket => {
    const trimmed = actionSummary.trim();
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
        if (line.startsWith(FIELD_PREFIXES.change_summary)) {
            packet.change_summary = line.slice(FIELD_PREFIXES.change_summary.length).trim();
            continue;
        }
        if (line.startsWith(FIELD_PREFIXES.impacted_scope)) {
            packet.impacted_scope = line.slice(FIELD_PREFIXES.impacted_scope.length).trim() || null;
            continue;
        }
        if (line.startsWith(FIELD_PREFIXES.risk_reason)) {
            packet.risk_reason = line.slice(FIELD_PREFIXES.risk_reason.length).trim() || null;
            continue;
        }
        if (line.startsWith(FIELD_PREFIXES.proposed_rollback)) {
            packet.proposed_rollback = line.slice(FIELD_PREFIXES.proposed_rollback.length).trim() || null;
            continue;
        }
        if (line.startsWith(FIELD_PREFIXES.lint_status)) {
            packet.lint_status = line.slice(FIELD_PREFIXES.lint_status.length).trim() || null;
            continue;
        }
        if (line.startsWith(FIELD_PREFIXES.test_status)) {
            packet.test_status = line.slice(FIELD_PREFIXES.test_status.length).trim() || null;
        }
    }

    if (!packet.change_summary) {
        packet.change_summary = trimmed;
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
    };
};
