import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import type { LeadCandidate } from './lead-source-provider.js';

const SIZE_SCORE: Record<string, number> = {
    '1-10': 5,
    '11-50': 15,
    '51-200': 40,
    '201-500': 60,
    '501-1000': 70,
    '1001-5000': 80,
    '5001+': 90,
};

function sizeScore(companySize?: string): number {
    if (!companySize) return 0;

    for (const [key, score] of Object.entries(SIZE_SCORE)) {
        if (companySize.includes(key)) return score;
    }

    const n = parseInt(companySize, 10);
    if (isNaN(n)) return 0;
    if (n >= 5001) return 90;
    if (n >= 1001) return 80;
    if (n >= 501) return 70;
    if (n >= 201) return 60;
    if (n >= 51) return 40;
    if (n >= 11) return 15;
    return 5;
}

export function scoreProspect(
    candidate: LeadCandidate,
    config: SalesAgentConfigRecord,
): number {
    let score = 0;

    // ICP keyword match — up to 40 pts
    const icpLower = config.icp.toLowerCase();
    const productLower = config.productDescription.toLowerCase();
    const candidateText = [candidate.title ?? '', candidate.industry ?? '', candidate.company]
        .join(' ')
        .toLowerCase();
    const icpKeywords = icpLower.split(/[\s,]+/).filter((kw) => kw.length > 3);
    if (icpKeywords.length > 0) {
        const matchCount = icpKeywords.filter((kw) => candidateText.includes(kw)).length;
        score += Math.round((matchCount / icpKeywords.length) * 40);
    }

    // Company size — up to 30 pts
    score += Math.round(sizeScore(candidate.companySize) * 0.3);

    // Valid email — 10 pts
    if (candidate.email && candidate.email.includes('@')) score += 10;

    // LinkedIn present — 10 pts
    if (candidate.linkedinUrl) score += 10;

    // Title aligns with product keywords — 10 pts
    if (
        candidate.title &&
        productLower
            .split(/[\s,]+/)
            .some((kw) => kw.length > 3 && candidate.title!.toLowerCase().includes(kw))
    ) {
        score += 10;
    }

    return Math.min(100, Math.max(0, score));
}

export function qualifyProspect(
    candidate: LeadCandidate,
    config: SalesAgentConfigRecord,
    threshold = 50,
): boolean {
    return scoreProspect(candidate, config) >= threshold;
}
