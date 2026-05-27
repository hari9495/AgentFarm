// ============================================================================
// DEVOPS INCIDENT CONTEXT BUILDER
//
// Builds rich incident context for triage by combining:
//   1. Episodic memory lookup — past similar incidents (noise filter)
//   2. Backstage catalog     — service ownership, lifecycle, dependencies
//   3. Runtime diagnostics   — current metrics/logs snapshot
//
// Used by workspace_devops_incident_context action.
//
// Sub-actions:
//   build_context   — Assemble full context from all sources
//   noise_filter    — Classify alert as noise vs real using past incidents
//   enrich          — Add org knowledge (owner, runbook, deps) to raw alert
//   suggest_triage  — LLM prompt for triage suggestions given full context
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawAlert {
    alertname:   string;
    severity?:   string;
    service?:    string;
    namespace?:  string;
    instance?:   string;
    message?:    string;
    labels?:     Record<string, string>;
    annotations?: Record<string, string>;
    firedAt?:    string;
}

export interface PastIncident {
    id:           string;
    alertname?:   string;
    service?:     string;
    severity?:    string;
    summary:      string;
    resolution?:  string;
    rootCause?:   string;
    duration?:    string;
    wasNoise:     boolean;
    resolvedAt?:  string;
    tags?:        string[];
}

export interface ServiceContext {
    name:         string;
    owner?:       string;
    lifecycle?:   string;
    oncallTeam?:  string;
    runbookUrl?:  string;
    dashboardUrl?: string;
    pagerDutyId?: string;
    dependencies?: string[];
    tier?:        string;   // 'tier-1' | 'tier-2' | 'tier-3'
}

export interface IncidentContext {
    alert:          RawAlert;
    service?:       ServiceContext;
    pastIncidents:  PastIncident[];
    noiseScore:     number;   // 0.0 – 1.0, higher = more likely noise
    noiseReason?:   string;
    isKnownPattern: boolean;
    suggestedOwner?: string;
    runbookUrl?:    string;
    enrichedAt:     string;
}

// ---------------------------------------------------------------------------
// Noise filter
// ---------------------------------------------------------------------------

/**
 * Computes a noise score based on past incident history.
 * Returns 0.0 (definitely real) → 1.0 (almost certainly noise).
 */
export function computeNoiseScore(alert: RawAlert, pastIncidents: PastIncident[]): { score: number; reason: string } {
    const matches = pastIncidents.filter((p) => {
        const nameMatch  = p.alertname  === alert.alertname;
        const svcMatch   = !p.service || p.service === alert.service;
        return nameMatch && svcMatch;
    });

    if (matches.length === 0) {
        return { score: 0.1, reason: 'No historical data — treating as real' };
    }

    const noiseMatches  = matches.filter((m) => m.wasNoise);
    const noiseRatio    = noiseMatches.length / matches.length;

    // Recent recurrence check: if fired > 3 times in last 24h it may be flapping
    const recentFired = matches.filter((m) => {
        if (!m.resolvedAt) return false;
        const age = Date.now() - new Date(m.resolvedAt).getTime();
        return age < 86_400_000; // 24 hours
    });

    let score  = noiseRatio;
    let reason = `${noiseMatches.length}/${matches.length} past occurrences were noise`;

    if (recentFired.length >= 3) {
        score  = Math.min(1.0, score + 0.25);
        reason += `; alert fired ${recentFired.length} times in last 24h (possible flap)`;
    }

    if (matches.some((m) => m.wasNoise && m.rootCause?.toLowerCase().includes('maintenance'))) {
        score  = Math.min(1.0, score + 0.2);
        reason += '; past occurrences during maintenance windows';
    }

    return { score: Math.min(1.0, score), reason };
}

/**
 * Returns true if this alert matches a known recurring benign pattern.
 */
export function isKnownPattern(alert: RawAlert, pastIncidents: PastIncident[]): boolean {
    return pastIncidents.some((p) =>
        p.alertname === alert.alertname &&
        !p.wasNoise &&
        p.rootCause !== undefined &&
        p.resolution !== undefined
    );
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

export function assembleIncidentContext(params: {
    alert:         RawAlert;
    service?:      ServiceContext;
    pastIncidents: PastIncident[];
}): IncidentContext {
    const { score, reason } = computeNoiseScore(params.alert, params.pastIncidents);
    return {
        alert:          params.alert,
        service:        params.service,
        pastIncidents:  params.pastIncidents.filter((p) =>
            p.alertname === params.alert.alertname ||
            (p.service && p.service === params.alert.service)
        ).slice(0, 10),
        noiseScore:     score,
        noiseReason:    reason,
        isKnownPattern: isKnownPattern(params.alert, params.pastIncidents),
        suggestedOwner: params.service?.owner,
        runbookUrl:     params.service?.runbookUrl,
        enrichedAt:     new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// LLM prompt builders
// ---------------------------------------------------------------------------

export function buildIncidentTriagePrompt(ctx: IncidentContext): string {
    const noiseLabel  = ctx.noiseScore > 0.7 ? '⚠️ HIGH NOISE PROBABILITY' :
                        ctx.noiseScore > 0.4 ? '🔶 MODERATE NOISE PROBABILITY' :
                        '🔴 LIKELY REAL INCIDENT';

    const pastSection = ctx.pastIncidents.length === 0 ? 'No historical data.' :
        ctx.pastIncidents.slice(0, 5).map((p, i) =>
            `${i + 1}. [${p.wasNoise ? 'NOISE' : 'REAL'}] ${p.summary}` +
            (p.resolution ? ` → Resolution: ${p.resolution}` : '') +
            (p.rootCause  ? ` | Root cause: ${p.rootCause}` : '')
        ).join('\n');

    const serviceSection = ctx.service ? [
        `Service: ${ctx.service.name}`,
        `Owner: ${ctx.service.owner ?? 'unknown'}`,
        `Lifecycle: ${ctx.service.lifecycle ?? 'unknown'}`,
        ...(ctx.service.tier        ? [`Tier: ${ctx.service.tier}`]             : []),
        ...(ctx.service.runbookUrl  ? [`Runbook: ${ctx.service.runbookUrl}`]    : []),
        ...(ctx.service.dependencies?.length ? [`Dependencies: ${ctx.service.dependencies.join(', ')}`] : []),
    ].join('\n') : 'No service catalog data available.';

    return [
        '# Incident Triage Request',
        '',
        `## Alert: ${ctx.alert.alertname}`,
        `- **Severity:** ${ctx.alert.severity ?? 'unknown'}`,
        `- **Service:** ${ctx.alert.service ?? ctx.alert.namespace ?? 'unknown'}`,
        `- **Message:** ${ctx.alert.message ?? ctx.alert.annotations?.['summary'] ?? 'none'}`,
        `- **Instance:** ${ctx.alert.instance ?? 'unknown'}`,
        `- **Noise Assessment:** ${noiseLabel} (score: ${ctx.noiseScore.toFixed(2)})`,
        ...(ctx.noiseReason ? [`- **Noise Reason:** ${ctx.noiseReason}`] : []),
        '',
        '## Service Context',
        serviceSection,
        '',
        '## Past Incidents (similar)',
        pastSection,
        '',
        '## Task',
        'Based on the above context:',
        '1. Is this alert real or likely noise? Explain your reasoning.',
        '2. What is the most likely root cause?',
        '3. What are the first 3 investigation steps?',
        '4. Who should be paged (if anyone)?',
        '5. Is there a known runbook for this? If yes, cite it.',
        '',
        'Respond in structured JSON:',
        '```json',
        '{',
        '  "isNoise": false,',
        '  "confidence": 0.85,',
        '  "likelyRootCause": "...",',
        '  "investigationSteps": ["step1", "step2", "step3"],',
        '  "pageOwner": true,',
        '  "runbookRef": "https://...",',
        '  "summary": "one-sentence summary for incident channel"',
        '}',
        '```',
    ].join('\n');
}

export interface TriageSuggestion {
    isNoise:            boolean;
    confidence:         number;
    likelyRootCause?:   string;
    investigationSteps: string[];
    pageOwner:          boolean;
    runbookRef?:        string;
    summary:            string;
}

export function parseTriageSuggestion(raw: string): TriageSuggestion | null {
    try {
        const match = raw.match(/```json\s*([\s\S]*?)```/);
        const json  = match ? match[1]! : raw;
        const j     = JSON.parse(json.trim());
        return {
            isNoise:            Boolean(j.isNoise),
            confidence:         Number(j.confidence   ?? 0.5),
            likelyRootCause:    j.likelyRootCause     || undefined,
            investigationSteps: Array.isArray(j.investigationSteps) ? j.investigationSteps : [],
            pageOwner:          Boolean(j.pageOwner),
            runbookRef:         j.runbookRef           || undefined,
            summary:            String(j.summary       ?? ''),
        };
    } catch { return null; }
}

// ---------------------------------------------------------------------------
// Enrichment builder (adds org knowledge to a raw alert)
// ---------------------------------------------------------------------------

export function buildEnrichedAlertSummary(ctx: IncidentContext, triage?: TriageSuggestion): string {
    const noiseFlag = ctx.noiseScore > 0.7 ? ' [POSSIBLE NOISE]' : '';
    const lines = [
        `# Incident Context: ${ctx.alert.alertname}${noiseFlag}`,
        `- **Service:** ${ctx.alert.service ?? ctx.alert.namespace ?? 'unknown'}`,
        `- **Severity:** ${ctx.alert.severity ?? 'unknown'}`,
        `- **Fired At:** ${ctx.alert.firedAt ?? 'unknown'}`,
        `- **Enriched At:** ${ctx.enrichedAt}`,
    ];

    if (ctx.service) {
        lines.push('', '## Service Catalog');
        lines.push(`- **Owner:** ${ctx.service.owner ?? 'unknown'}`);
        if (ctx.service.lifecycle)    { lines.push(`- **Lifecycle:** ${ctx.service.lifecycle}`); }
        if (ctx.service.tier)         { lines.push(`- **Tier:** ${ctx.service.tier}`); }
        if (ctx.service.runbookUrl)   { lines.push(`- **Runbook:** ${ctx.service.runbookUrl}`); }
        if (ctx.service.dashboardUrl) { lines.push(`- **Dashboard:** ${ctx.service.dashboardUrl}`); }
        if (ctx.service.pagerDutyId)  { lines.push(`- **PagerDuty:** ${ctx.service.pagerDutyId}`); }
    }

    lines.push('', '## Noise Analysis');
    lines.push(`- **Score:** ${ctx.noiseScore.toFixed(2)} (0=real, 1=noise)`);
    if (ctx.noiseReason) { lines.push(`- **Reason:** ${ctx.noiseReason}`); }

    if (ctx.pastIncidents.length > 0) {
        lines.push('', '## Past Similar Incidents');
        for (const p of ctx.pastIncidents.slice(0, 3)) {
            lines.push(`- [${p.wasNoise ? 'NOISE' : 'REAL'}] ${p.summary}${p.resolution ? ` → ${p.resolution}` : ''}`);
        }
    }

    if (triage) {
        lines.push('', '## Triage Suggestion');
        lines.push(`- **Verdict:** ${triage.isNoise ? 'Likely noise' : 'Real incident'} (confidence: ${(triage.confidence * 100).toFixed(0)}%)`);
        if (triage.likelyRootCause)      { lines.push(`- **Root Cause:** ${triage.likelyRootCause}`); }
        if (triage.investigationSteps.length) {
            lines.push('- **Next Steps:**');
            triage.investigationSteps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
        }
        if (triage.runbookRef) { lines.push(`- **Runbook:** ${triage.runbookRef}`); }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Memory injection helper
// ---------------------------------------------------------------------------

/**
 * Given a list of past incidents from episodic memory, picks the top-N
 * most relevant to inject into the triage prompt context.
 * Relevance = alertname match > service match > tag overlap.
 */
export function selectRelevantPastIncidents(
    alert: RawAlert,
    allIncidents: PastIncident[],
    topN: number = 5
): PastIncident[] {
    const scored = allIncidents.map((p) => {
        let score = 0;
        if (p.alertname === alert.alertname)   { score += 10; }
        if (p.service   === alert.service)      { score += 5; }
        if (p.severity  === alert.severity)     { score += 2; }
        const alertTags = Object.values(alert.labels ?? {});
        for (const tag of p.tags ?? []) {
            if (alertTags.includes(tag)) { score += 1; }
        }
        return { p, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((s) => s.p);
}
