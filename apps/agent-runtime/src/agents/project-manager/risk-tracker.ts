/**
 * Risk Tracker
 *
 * Pure functions for creating and updating a project risk register,
 * detecting high-risk conditions, and formatting escalation messages.
 *
 * Follows PM best practices:
 *   - Each risk has probability, impact, and a mitigation strategy
 *   - Risk score = probability × impact (both 1–5 scale)
 *   - Scores ≥12 are HIGH, 6–11 are MEDIUM, <6 are LOW
 *   - Owner and review date are required for any HIGH risk
 *
 * No I/O — all data passed in; output is a plain object.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskCategory =
    | 'scope'
    | 'timeline'
    | 'budget'
    | 'resource'
    | 'technical'
    | 'dependency'
    | 'quality'
    | 'stakeholder'
    | 'compliance'
    | 'external';

export type RiskStatus = 'open' | 'mitigated' | 'accepted' | 'closed' | 'materialised';

export interface RiskItem {
    id: string;
    title: string;
    description: string;
    category: RiskCategory;
    /** 1–5: how likely is this to occur? */
    probability: number;
    /** 1–5: how bad is the impact if it occurs? */
    impact: number;
    mitigation: string;
    owner?: string;
    /** ISO-8601 date for next review. */
    reviewDate?: string;
    status: RiskStatus;
    /** Date risk was first identified (ISO-8601). */
    raisedAt: string;
    /** Date risk was last updated (ISO-8601). */
    updatedAt: string;
}

export interface RiskRegisterResult {
    projectName: string;
    risks: RiskItem[];
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    /** Risks without an owner or review date that need attention. */
    unowned: RiskItem[];
    warnings: string[];
    markdown: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskScore(r: RiskItem): number {
    return r.probability * r.impact;
}

function riskLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (score >= 12) return 'HIGH';
    if (score >= 6)  return 'MEDIUM';
    return 'LOW';
}

function riskEmoji(level: 'HIGH' | 'MEDIUM' | 'LOW'): string {
    return { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' }[level];
}

// ---------------------------------------------------------------------------
// Parsing helpers (convert LLM output to risk items)
// ---------------------------------------------------------------------------

/**
 * Parse a loose risk description string into a structured RiskItem.
 * Used when the LLM returns freeform risk text rather than JSON.
 */
export function parseRiskFromText(
    id: string,
    text: string,
    category: RiskCategory = 'technical',
): RiskItem {
    const lower = text.toLowerCase();

    let probability = 3;
    if (lower.includes('very likely') || lower.includes('almost certain')) probability = 5;
    else if (lower.includes('likely') || lower.includes('probable'))        probability = 4;
    else if (lower.includes('unlikely') || lower.includes('rare'))          probability = 2;
    else if (lower.includes('very unlikely') || lower.includes('remote'))   probability = 1;

    let impact = 3;
    if (lower.includes('critical') || lower.includes('severe'))   impact = 5;
    else if (lower.includes('major') || lower.includes('high'))   impact = 4;
    else if (lower.includes('minor') || lower.includes('low'))    impact = 2;
    else if (lower.includes('negligible') || lower.includes('insignificant')) impact = 1;

    const firstLine = text.split('\n')[0]?.trim() ?? text.slice(0, 80);
    const now = new Date().toISOString();

    return {
        id,
        title: firstLine.slice(0, 100),
        description: text.slice(0, 500),
        category,
        probability,
        impact,
        mitigation: 'To be defined by risk owner.',
        status: 'open',
        raisedAt: now,
        updatedAt: now,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate and summarise a risk register, computing scores and generating
 * a formatted markdown report.
 */
export function buildRiskRegister(
    projectName: string,
    risks: RiskItem[],
): RiskRegisterResult {
    const warnings: string[] = [];

    const openRisks = risks.filter((r) => r.status === 'open' || r.status === 'mitigated');
    const sorted = [...openRisks].sort((a, b) => riskScore(b) - riskScore(a));

    const highRisks   = sorted.filter((r) => riskScore(r) >= 12);
    const mediumRisks = sorted.filter((r) => riskScore(r) >= 6 && riskScore(r) < 12);
    const lowRisks    = sorted.filter((r) => riskScore(r) < 6);

    const unowned = highRisks.filter((r) => !r.owner || !r.reviewDate);
    if (unowned.length > 0) {
        warnings.push(`${unowned.length} HIGH risk(s) have no owner or review date — assign immediately.`);
    }

    const expiredReview = openRisks.filter((r) => {
        if (!r.reviewDate) return false;
        return new Date(r.reviewDate) < new Date();
    });
    if (expiredReview.length > 0) {
        warnings.push(`${expiredReview.length} risk(s) are overdue for review.`);
    }

    if (highRisks.length >= 5) {
        warnings.push(`${highRisks.length} HIGH risks on the register — escalate to executive sponsor.`);
    }

    const markdown = formatRiskMarkdown({
        projectName,
        highRisks,
        mediumRisks,
        lowRisks,
        warnings,
    });

    return {
        projectName,
        risks: sorted,
        highRiskCount: highRisks.length,
        mediumRiskCount: mediumRisks.length,
        lowRiskCount: lowRisks.length,
        unowned,
        warnings,
        markdown,
    };
}

function formatRiskMarkdown(params: {
    projectName: string;
    highRisks: RiskItem[];
    mediumRisks: RiskItem[];
    lowRisks: RiskItem[];
    warnings: string[];
}): string {
    const { projectName, highRisks, mediumRisks, lowRisks, warnings } = params;
    const lines: string[] = [];

    lines.push(`# 🔐 Risk Register — ${projectName}`);
    lines.push('');
    lines.push(`| Level | Count |`);
    lines.push(`|---|---|`);
    lines.push(`| 🔴 HIGH | ${highRisks.length} |`);
    lines.push(`| 🟡 MEDIUM | ${mediumRisks.length} |`);
    lines.push(`| 🟢 LOW | ${lowRisks.length} |`);
    lines.push('');

    const allGroups: Array<[string, RiskItem[]]> = [
        ['🔴 High Risk (Score ≥ 12)', highRisks],
        ['🟡 Medium Risk (Score 6–11)', mediumRisks],
        ['🟢 Low Risk (Score < 6)', lowRisks],
    ];

    for (const [heading, group] of allGroups) {
        if (group.length === 0) continue;
        lines.push(`## ${heading}`);
        lines.push('');
        lines.push('| ID | Risk | Category | P | I | Score | Owner | Status |');
        lines.push('|---|---|---|---|---|---|---|---|');
        for (const r of group) {
            const score = riskScore(r);
            const level = riskLevel(score);
            const emoji = riskEmoji(level);
            lines.push(`| ${r.id} | ${r.title} | ${r.category} | ${r.probability} | ${r.impact} | ${emoji} ${score} | ${r.owner ?? 'Unassigned'} | ${r.status} |`);
        }
        lines.push('');

        for (const r of group) {
            lines.push(`### ${r.id} — ${r.title}`);
            lines.push(`**Description:** ${r.description}`);
            lines.push(`**Mitigation:** ${r.mitigation}`);
            if (r.reviewDate) lines.push(`**Next Review:** ${r.reviewDate}`);
            lines.push('');
        }
    }

    if (warnings.length > 0) {
        lines.push('## ⚠️ Warnings');
        for (const w of warnings) {
            lines.push(`- ${w}`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(`_Generated by AgentFarm PM Agent — ${new Date().toISOString().split('T')[0]}_`);

    return lines.join('\n');
}

/**
 * Format a concise escalation message for a single high-risk item.
 * Used when posting to Slack/Teams/email to flag a risk that needs immediate attention.
 */
export function formatRiskEscalationMessage(risk: RiskItem): string {
    const score = riskScore(risk);
    const level = riskLevel(score);
    return [
        `🚨 **Risk Escalation — ${level}** (Score: ${score}/25)`,
        `**[${risk.id}] ${risk.title}**`,
        `Category: ${risk.category} | Probability: ${risk.probability}/5 | Impact: ${risk.impact}/5`,
        `${risk.description}`,
        `**Mitigation:** ${risk.mitigation}`,
        risk.owner ? `**Owner:** ${risk.owner}` : '**Owner:** _Not assigned — please assign immediately_',
        risk.reviewDate ? `**Review by:** ${risk.reviewDate}` : '**Review date:** _Not set_',
    ].join('\n');
}
