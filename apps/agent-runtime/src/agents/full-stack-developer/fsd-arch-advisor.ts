// ============================================================================
// FSD ARCH ADVISOR
// Sprint 16 — Full-Stack Developer Role
//
// LLM-powered architectural decision advisor.  Given an architectural question
// and the current codebase context, the agent produces a structured
// Architecture Decision Record (ADR) with options, trade-offs, a
// recommendation, and a concrete implementation plan.
//
// buildArchReviewContext    → extracts stack fingerprint from codebase output
// buildAdrPrompt            → crafts the LLM prompt for ADR generation
// parseAdrFromLlm           → structures the raw LLM response into an ADR
// buildTradeOffMatrix       → pure helper for option comparison
// formatAdrAsMarkdown       → renders an ADR as a Markdown document
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArchOptionStatus = 'recommended' | 'viable' | 'not_recommended';

export interface ArchTradeOff {
    dimension: string;   // e.g. "Performance", "Developer experience", "Cost"
    rating:    1 | 2 | 3 | 4 | 5;    // 5 = best
    note:      string;
}

export interface ArchOption {
    name:        string;
    description: string;
    status:      ArchOptionStatus;
    pros:        string[];
    cons:        string[];
    tradeOffs:   ArchTradeOff[];
    effort:      'low' | 'medium' | 'high';
    riskLevel:   'low' | 'medium' | 'high';
}

export interface ArchImplementationStep {
    order:       number;
    action:      string;
    owner:       'agent' | 'team' | 'both';
    estimateDays?: number;
}

export interface ArchDecisionRecord {
    title:              string;
    status:             'proposed' | 'accepted' | 'deprecated' | 'superseded';
    context:            string;       // why the decision is needed
    decision:           string;       // the chosen option + one-line rationale
    options:            ArchOption[];
    consequences:       string[];     // what changes after this decision
    implementationPlan: ArchImplementationStep[];
    reviewedAt:         string;       // ISO date string
}

// ---------------------------------------------------------------------------
// buildArchReviewContext
// ---------------------------------------------------------------------------

/**
 * Extracts a concise "stack fingerprint" from workspace_scout output or
 * package.json content. Pure function.
 */
export function buildArchReviewContext(rawCodbaseOutput: string): string {
    const lines: string[] = [];

    // Extract package.json dependencies if embedded in the scout output
    const depsMatch = rawCodbaseOutput.match(/"dependencies"\s*:\s*\{([^}]+)\}/s);
    if (depsMatch) {
        const depLines = depsMatch[1]!
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(0, 20);
        lines.push('Dependencies:', ...depLines);
    }

    // Extract framework signals
    const frameworkHints: string[] = [];
    if (/react/i.test(rawCodbaseOutput))     frameworkHints.push('React');
    if (/next/i.test(rawCodbaseOutput))      frameworkHints.push('Next.js');
    if (/vue/i.test(rawCodbaseOutput))       frameworkHints.push('Vue');
    if (/nuxt/i.test(rawCodbaseOutput))      frameworkHints.push('Nuxt');
    if (/angular/i.test(rawCodbaseOutput))   frameworkHints.push('Angular');
    if (/svelte/i.test(rawCodbaseOutput))    frameworkHints.push('Svelte');
    if (/express/i.test(rawCodbaseOutput))   frameworkHints.push('Express');
    if (/fastify/i.test(rawCodbaseOutput))   frameworkHints.push('Fastify');
    if (/nestjs|nest\.js/i.test(rawCodbaseOutput)) frameworkHints.push('NestJS');
    if (/graphql/i.test(rawCodbaseOutput))   frameworkHints.push('GraphQL');
    if (/prisma/i.test(rawCodbaseOutput))    frameworkHints.push('Prisma');
    if (/drizzle/i.test(rawCodbaseOutput))   frameworkHints.push('Drizzle');
    if (/postgres|pg\b/i.test(rawCodbaseOutput)) frameworkHints.push('PostgreSQL');
    if (/mongodb|mongoose/i.test(rawCodbaseOutput)) frameworkHints.push('MongoDB');
    if (/redis/i.test(rawCodbaseOutput))     frameworkHints.push('Redis');
    if (/docker/i.test(rawCodbaseOutput))    frameworkHints.push('Docker');
    if (/kubernetes|k8s/i.test(rawCodbaseOutput)) frameworkHints.push('Kubernetes');
    if (/aws|lambda/i.test(rawCodbaseOutput)) frameworkHints.push('AWS');
    if (/vercel/i.test(rawCodbaseOutput))    frameworkHints.push('Vercel');

    if (frameworkHints.length > 0) {
        lines.push(`Detected stack: ${frameworkHints.join(', ')}`);
    }

    // File count hints
    const tsFiles  = (rawCodbaseOutput.match(/\.tsx?/g) ?? []).length;
    const testFiles = (rawCodbaseOutput.match(/\.test\.|\.spec\./g) ?? []).length;
    if (tsFiles > 0)   lines.push(`TypeScript files detected: ~${tsFiles}`);
    if (testFiles > 0) lines.push(`Test files detected: ~${testFiles}`);

    return lines.join('\n') || rawCodbaseOutput.slice(0, 500);
}

// ---------------------------------------------------------------------------
// buildAdrPrompt
// ---------------------------------------------------------------------------

/**
 * Crafts the LLM prompt that produces an Architecture Decision Record.
 * Pure function.
 */
export function buildAdrPrompt(params: {
    question:          string;
    codebaseContext:   string;
    requirements?:     string[];
    constraints?:      string[];
    teamSize?:         number;
    deliveryTimeline?: string;
}): string {
    const { question, codebaseContext, requirements, constraints, teamSize, deliveryTimeline } = params;

    const reqBlock = requirements?.length
        ? `Requirements:\n${requirements.map((r) => `- ${r}`).join('\n')}`
        : '';
    const conBlock = constraints?.length
        ? `Constraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`
        : '';
    const teamBlock  = teamSize         ? `Team size: ${teamSize} developer(s)` : '';
    const timeBlock  = deliveryTimeline ? `Delivery timeline: ${deliveryTimeline}` : '';

    return [
        `You are a principal software architect. Produce a structured Architecture Decision Record (ADR).`,
        ``,
        `Architectural question:`,
        question,
        ``,
        `Current codebase context:`,
        codebaseContext.slice(0, 1500),
        reqBlock,
        conBlock,
        teamBlock,
        timeBlock,
        ``,
        `Instructions:`,
        `1. Identify 2–4 realistic architectural options for this decision.`,
        `2. For each option: describe it, list pros/cons, estimate effort (low/medium/high), and rate risk (low/medium/high).`,
        `3. Select the BEST option given the context and explain why in one sentence.`,
        `4. List the top 3 consequences of the chosen option.`,
        `5. Provide a 3–5 step implementation plan (who does each step: agent | team | both).`,
        ``,
        `Return a JSON object with this exact shape:`,
        `{`,
        `  "title": "short ADR title",`,
        `  "context": "why this decision is needed (2-3 sentences)",`,
        `  "decision": "chosen option + one-line rationale",`,
        `  "options": [`,
        `    {`,
        `      "name": "Option name",`,
        `      "description": "...",`,
        `      "status": "recommended | viable | not_recommended",`,
        `      "pros": ["...", "..."],`,
        `      "cons": ["...", "..."],`,
        `      "tradeOffs": [{ "dimension": "Performance", "rating": 4, "note": "..." }],`,
        `      "effort": "low | medium | high",`,
        `      "riskLevel": "low | medium | high"`,
        `    }`,
        `  ],`,
        `  "consequences": ["...", "..."],`,
        `  "implementationPlan": [`,
        `    { "order": 1, "action": "...", "owner": "agent | team | both", "estimateDays": 2 }`,
        `  ]`,
        `}`,
        ``,
        `No markdown fences, no prose — only the JSON object.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// parseAdrFromLlm
// ---------------------------------------------------------------------------

/**
 * Parses the raw LLM string into an ArchDecisionRecord. Pure function.
 */
export function parseAdrFromLlm(raw: string, question: string): ArchDecisionRecord {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('{');
    const end     = cleaned.lastIndexOf('}');

    const fallback: ArchDecisionRecord = {
        title:              `ADR: ${question.slice(0, 60)}`,
        status:             'proposed',
        context:            question,
        decision:           'LLM response could not be parsed — please review the raw output.',
        options:            [],
        consequences:       [],
        implementationPlan: [],
        reviewedAt:         new Date().toISOString(),
    };

    if (start === -1 || end === -1) return fallback;

    try {
        const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;

        const options: ArchOption[] = Array.isArray(obj['options'])
            ? (obj['options'] as Record<string, unknown>[]).map((o) => ({
                name:        String(o['name']        ?? 'Unnamed option'),
                description: String(o['description'] ?? ''),
                status:      isOptionStatus(o['status']) ? o['status'] : 'viable',
                pros:        Array.isArray(o['pros']) ? o['pros'].map(String) : [],
                cons:        Array.isArray(o['cons']) ? o['cons'].map(String) : [],
                tradeOffs:   parseTradeOffs(o['tradeOffs']),
                effort:      isEffort(o['effort'])     ? o['effort']    : 'medium',
                riskLevel:   isRisk(o['riskLevel'])    ? o['riskLevel'] : 'medium',
            } satisfies ArchOption))
            : [];

        const implementationPlan: ArchImplementationStep[] = Array.isArray(obj['implementationPlan'])
            ? (obj['implementationPlan'] as Record<string, unknown>[]).map((s, i) => ({
                order:        typeof s['order']        === 'number' ? s['order']        : i + 1,
                action:       String(s['action']       ?? ''),
                owner:        isOwner(s['owner'])      ? s['owner']                     : 'both',
                estimateDays: typeof s['estimateDays'] === 'number' ? s['estimateDays'] : undefined,
            } satisfies ArchImplementationStep))
            : [];

        return {
            title:              String(obj['title']    ?? fallback.title),
            status:             'proposed',
            context:            String(obj['context']  ?? question),
            decision:           String(obj['decision'] ?? fallback.decision),
            options,
            consequences:       Array.isArray(obj['consequences'])
                ? obj['consequences'].map(String)
                : [],
            implementationPlan,
            reviewedAt:         new Date().toISOString(),
        };
    } catch {
        return fallback;
    }
}

function isOptionStatus(v: unknown): v is ArchOptionStatus {
    return ['recommended', 'viable', 'not_recommended'].includes(v as string);
}
function isEffort(v: unknown): v is ArchOption['effort'] {
    return ['low', 'medium', 'high'].includes(v as string);
}
function isRisk(v: unknown): v is ArchOption['riskLevel'] {
    return ['low', 'medium', 'high'].includes(v as string);
}
function isOwner(v: unknown): v is ArchImplementationStep['owner'] {
    return ['agent', 'team', 'both'].includes(v as string);
}
function parseTradeOffs(raw: unknown): ArchTradeOff[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
        .map((t) => ({
            dimension: String(t['dimension'] ?? ''),
            rating:    ([1, 2, 3, 4, 5].includes(t['rating'] as number) ? t['rating'] : 3) as ArchTradeOff['rating'],
            note:      String(t['note'] ?? ''),
        }));
}

// ---------------------------------------------------------------------------
// formatAdrAsMarkdown
// ---------------------------------------------------------------------------

/**
 * Renders an ADR as a Markdown document for storage in docs/ or a PR comment.
 * Pure function.
 */
export function formatAdrAsMarkdown(adr: ArchDecisionRecord): string {
    const lines: string[] = [
        `# ADR: ${adr.title}`,
        ``,
        `**Status:** ${adr.status}  |  **Reviewed:** ${adr.reviewedAt.slice(0, 10)}`,
        ``,
        `## Context`,
        adr.context,
        ``,
        `## Decision`,
        `**${adr.decision}**`,
        ``,
        `## Options Considered`,
    ];

    for (const opt of adr.options) {
        const badge = opt.status === 'recommended' ? '✅ Recommended' : opt.status === 'not_recommended' ? '❌ Not recommended' : '🔵 Viable';
        lines.push(``, `### ${badge} — ${opt.name}`);
        lines.push(opt.description);
        if (opt.pros.length)  lines.push(``, `**Pros:** ${opt.pros.join(' · ')}`);
        if (opt.cons.length)  lines.push(`**Cons:** ${opt.cons.join(' · ')}`);
        lines.push(`**Effort:** ${opt.effort}  |  **Risk:** ${opt.riskLevel}`);
        if (opt.tradeOffs.length) {
            lines.push(``, `| Dimension | Rating | Note |`, `|---|---|---|`);
            for (const t of opt.tradeOffs) {
                lines.push(`| ${t.dimension} | ${'⭐'.repeat(t.rating)} | ${t.note} |`);
            }
        }
    }

    lines.push(``, `## Consequences`);
    for (const c of adr.consequences) lines.push(`- ${c}`);

    lines.push(``, `## Implementation Plan`);
    for (const step of adr.implementationPlan) {
        const days = step.estimateDays ? ` (~${step.estimateDays}d)` : '';
        const owner = step.owner === 'agent' ? '🤖' : step.owner === 'team' ? '👥' : '🤝';
        lines.push(`${step.order}. ${owner} ${step.action}${days}`);
    }

    return lines.join('\n');
}
