import type { ActionAuditRecord } from './audit-log-writer.js';

export interface CorrectnessScore {
    totalActions: number;
    verifiedActions: number;
    weightedTotal: number;
    weightedVerified: number;
    correctnessScore: number;
}

const riskWeight = (riskLevel: ActionAuditRecord['riskLevel']): number => {
    if (riskLevel === 'high') {
        return 3;
    }
    if (riskLevel === 'medium') {
        return 2;
    }
    return 1;
};

export const scoreTaskCorrectness = (events: ActionAuditRecord[]): CorrectnessScore => {
    if (events.length === 0) {
        return {
            totalActions: 0,
            verifiedActions: 0,
            weightedTotal: 0,
            weightedVerified: 0,
            correctnessScore: 0,
        };
    }

    let weightedTotal = 0;
    let weightedVerified = 0;
    let verifiedActions = 0;

    for (const event of events) {
        const weight = riskWeight(event.riskLevel);
        weightedTotal += weight;
        if (event.verified && event.success) {
            verifiedActions += 1;
            weightedVerified += weight;
        }
    }

    const correctnessScore = weightedTotal === 0
        ? 0
        : Number(((weightedVerified / weightedTotal) * 100).toFixed(2));

    return {
        totalActions: events.length,
        verifiedActions,
        weightedTotal,
        weightedVerified,
        correctnessScore,
    };
};

export interface QualitySignalPayload {
    provider: string;
    actionType: string;
    score: number;
    source: 'runtime_outcome';
    reason: string;
    metadata: {
        correctnessScore: number;
        verifiedActions: number;
        totalActions: number;
        weightedVerified: number;
        weightedTotal: number;
    };
}

export const toRuntimeQualitySignal = (
    score: CorrectnessScore,
    provider: string,
    actionType = 'observability_action',
): QualitySignalPayload => ({
    provider,
    actionType,
    score: Number((score.correctnessScore / 100).toFixed(3)),
    source: 'runtime_outcome',
    reason: 'task_correctness_score',
    metadata: {
        correctnessScore: score.correctnessScore,
        verifiedActions: score.verifiedActions,
        totalActions: score.totalActions,
        weightedVerified: score.weightedVerified,
        weightedTotal: score.weightedTotal,
    },
});
