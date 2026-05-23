// ============================================================================
// FEEDBACK ANALYZER
// Technical Writer Role
//
// Ingests user feedback (GitHub issues, support tickets, survey text) and
// surfaces which documentation sections generate the most confusion, with a
// prioritised gap list and recommended doc updates.
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedbackSource = 'github_issue' | 'support_ticket' | 'survey' | 'forum' | 'other';
export type FeedbackSentiment = 'confusion' | 'bug_report' | 'feature_request' | 'positive' | 'neutral';

export interface FeedbackItem {
    id: string;
    text: string;
    source: FeedbackSource;
    /** Explicitly labelled doc section, if known. */
    docSection?: string;
    /** ISO date string. */
    date?: string;
    /** Optional metadata tags, e.g. ["auth", "login"]. */
    tags?: string[];
}

export interface FeedbackClassification {
    itemId: string;
    sentiment: FeedbackSentiment;
    /** Doc section inferred from the text. */
    inferredSection: string | null;
    confusionSignals: string[];
    /** Quoted phrases that pinpoint the exact confusion. */
    keyPhrases: string[];
    impactScore: number; // 1–10
}

export interface DocSectionGap {
    section: string;
    mentionCount: number;
    confusionCount: number;
    bugCount: number;
    featureRequestCount: number;
    /** 0–100 priority score. Higher = more urgent to fix. */
    priority: number;
    topPhrases: string[];
    /** Recommended action: 'rewrite' | 'expand' | 'add_examples' | 'add_troubleshooting' | 'create_new' */
    recommendation: string;
}

export interface FeedbackAnalysisReport {
    totalItems: number;
    sentimentBreakdown: Record<FeedbackSentiment, number>;
    topGaps: DocSectionGap[];
    allClassifications: FeedbackClassification[];
    markdownReport: string;
}

// ---------------------------------------------------------------------------
// Signal dictionaries
// ---------------------------------------------------------------------------

const CONFUSION_SIGNALS = [
    'confused', 'confusing', 'unclear', 'not clear', "don't understand",
    "doesn't make sense", 'hard to follow', 'misleading', 'wrong',
    "can't find", 'missing', 'not found', 'where is', 'how do i',
    'what is', 'why doesn\'t', "didn't work", 'not working', 'broken',
    'fails', 'failed', 'error', 'exception', 'crash', 'stuck',
    'no example', 'no examples', 'needs example', 'outdated', 'incorrect',
    'typo', 'inaccurate', 'incomplete', 'not documented', 'undocumented',
];

const POSITIVE_SIGNALS = [
    'helpful', 'clear', 'works', 'perfect', 'great', 'excellent',
    'thank you', 'thanks', 'solved', 'fixed', 'worked', 'amazing',
    'easy to follow', 'well written', 'good doc', 'good documentation',
];

const BUG_SIGNALS = [
    'bug', 'crash', 'exception thrown', 'error:', 'traceback',
    'segfault', 'null pointer', 'undefined is not', 'cannot read property',
    'regression', 'broken since', 'worked in v', 'stops working',
];

const FEATURE_REQUEST_SIGNALS = [
    'wish', 'would be nice', 'could you add', 'please add', 'support for',
    'feature request', 'enhancement', 'add support', 'would love',
    'it would be great if', 'is there a way to', 'can you document',
];

// ---------------------------------------------------------------------------
// Section keyword index
// Used to infer which doc section a piece of feedback is about.
// ---------------------------------------------------------------------------

const SECTION_KEYWORDS: Array<{ section: string; keywords: string[] }> = [
    { section: 'authentication',   keywords: ['login', 'auth', 'token', 'oauth', 'sso', 'password', 'credentials', 'jwt', 'api key', 'unauthorized', '401', '403'] },
    { section: 'installation',     keywords: ['install', 'setup', 'npm install', 'pip install', 'brew', 'docker', 'dependencies', 'version', 'node', 'python'] },
    { section: 'configuration',    keywords: ['config', 'configuration', 'env', 'settings', '.env', 'environment variable', 'yaml', 'json config', 'options'] },
    { section: 'api reference',    keywords: ['api', 'endpoint', 'request', 'response', 'parameter', 'payload', 'rest', 'graphql', 'grpc', 'sdk', 'method', 'function'] },
    { section: 'getting started',  keywords: ['getting started', 'quickstart', 'quick start', 'first time', 'hello world', 'tutorial', 'beginner', 'onboard'] },
    { section: 'troubleshooting',  keywords: ['troubleshoot', 'debug', 'error', 'fix', 'diagnose', 'log', 'trace', 'not working', 'fails'] },
    { section: 'deployment',       keywords: ['deploy', 'production', 'kubernetes', 'docker', 'ci/cd', 'pipeline', 'release', 'publish', 'host', 'cloud'] },
    { section: 'security',         keywords: ['security', 'permission', 'role', 'access control', 'encrypt', 'tls', 'ssl', 'certificate', 'vulnerability', 'cve'] },
    { section: 'integrations',     keywords: ['integration', 'webhook', 'plugin', 'extension', 'connect', 'third-party', 'slack', 'github', 'jira', 'zapier'] },
    { section: 'data model',       keywords: ['schema', 'model', 'database', 'table', 'field', 'column', 'type', 'relationship', 'foreign key', 'index'] },
    { section: 'performance',      keywords: ['slow', 'performance', 'timeout', 'rate limit', 'throttle', 'cache', 'latency', 'throughput', 'memory', 'cpu'] },
    { section: 'billing',          keywords: ['billing', 'invoice', 'payment', 'plan', 'subscription', 'cost', 'pricing', 'charge', 'refund'] },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractKeyPhrases(text: string, signals: string[]): string[] {
    const lower = text.toLowerCase();
    return signals.filter((s) => lower.includes(s));
}

function inferSection(text: string, explicitSection?: string): string | null {
    if (explicitSection) return explicitSection;
    const lower = text.toLowerCase();
    let best: { section: string; hits: number } | null = null;
    for (const { section, keywords } of SECTION_KEYWORDS) {
        const hits = keywords.filter((kw) => lower.includes(kw)).length;
        if (hits > 0 && (!best || hits > best.hits)) best = { section, hits };
    }
    return best ? best.section : null;
}

function classifySentiment(text: string): FeedbackSentiment {
    const lower = text.toLowerCase();
    const bugHits = BUG_SIGNALS.filter((s) => lower.includes(s)).length;
    const featureHits = FEATURE_REQUEST_SIGNALS.filter((s) => lower.includes(s)).length;
    const confusionHits = CONFUSION_SIGNALS.filter((s) => lower.includes(s)).length;
    const positiveHits = POSITIVE_SIGNALS.filter((s) => lower.includes(s)).length;

    if (bugHits >= 2) return 'bug_report';
    if (featureHits >= 2) return 'feature_request';
    if (confusionHits >= 1) return 'confusion';
    if (positiveHits >= 1 && confusionHits === 0) return 'positive';
    return 'neutral';
}

function impactScore(confusionHits: number, sentiment: FeedbackSentiment, textLength: number): number {
    let score = confusionHits * 2;
    if (sentiment === 'confusion') score += 3;
    if (sentiment === 'bug_report') score += 4;
    if (textLength > 200) score += 1; // longer feedback = more thought = more important
    return Math.min(10, Math.max(1, score));
}

function recommend(gap: Omit<DocSectionGap, 'recommendation'>): string {
    if (gap.section === null || gap.section === 'unknown') return 'investigate';
    if (gap.mentionCount === 0) return 'create_new';
    if (gap.bugCount > gap.confusionCount) return 'add_troubleshooting';
    if (gap.featureRequestCount > gap.confusionCount) return 'expand';
    if (gap.topPhrases.some((p) => p.includes('example'))) return 'add_examples';
    return 'rewrite';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a single feedback item.
 */
export function classifyFeedbackItem(item: FeedbackItem): FeedbackClassification {
    const sentiment = classifySentiment(item.text);
    const inferredSection = inferSection(item.text, item.docSection);
    const confusionSignals = extractKeyPhrases(item.text, CONFUSION_SIGNALS);
    const keyPhrases = [
        ...confusionSignals,
        ...extractKeyPhrases(item.text, BUG_SIGNALS),
        ...extractKeyPhrases(item.text, FEATURE_REQUEST_SIGNALS),
    ].slice(0, 5);

    return {
        itemId: item.id,
        sentiment,
        inferredSection,
        confusionSignals,
        keyPhrases,
        impactScore: impactScore(confusionSignals.length, sentiment, item.text.length),
    };
}

/**
 * Analyse a batch of feedback items against known doc sections.
 * Returns a prioritised gap list and a full Markdown report.
 */
export function analyzeFeedback(
    items: FeedbackItem[],
    knownDocSections: string[] = [],
): FeedbackAnalysisReport {
    const classifications = items.map(classifyFeedbackItem);

    // Tally by section
    const sectionTallies = new Map<string, {
        mentions: number;
        confusion: number;
        bugs: number;
        features: number;
        phrases: string[];
        impactSum: number;
    }>();

    for (const c of classifications) {
        const sec = c.inferredSection ?? 'unknown';
        if (!sectionTallies.has(sec)) {
            sectionTallies.set(sec, { mentions: 0, confusion: 0, bugs: 0, features: 0, phrases: [], impactSum: 0 });
        }
        const t = sectionTallies.get(sec)!;
        t.mentions++;
        t.impactSum += c.impactScore;
        if (c.sentiment === 'confusion') t.confusion++;
        if (c.sentiment === 'bug_report') t.bugs++;
        if (c.sentiment === 'feature_request') t.features++;
        t.phrases.push(...c.keyPhrases);
    }

    // Add any known sections with zero mentions
    for (const sec of knownDocSections) {
        if (!sectionTallies.has(sec.toLowerCase())) {
            sectionTallies.set(sec.toLowerCase(), { mentions: 0, confusion: 0, bugs: 0, features: 0, phrases: [], impactSum: 0 });
        }
    }

    // Build gap list
    const gaps: DocSectionGap[] = [];
    for (const [section, t] of sectionTallies) {
        const priority = Math.min(100, Math.round(
            (t.confusion * 15) + (t.bugs * 20) + (t.features * 5) + (t.impactSum * 2),
        ));
        const topPhrases = [...new Set(t.phrases)].slice(0, 5);
        const partial: Omit<DocSectionGap, 'recommendation'> = {
            section,
            mentionCount: t.mentions,
            confusionCount: t.confusion,
            bugCount: t.bugs,
            featureRequestCount: t.features,
            priority,
            topPhrases,
        };
        gaps.push({ ...partial, recommendation: recommend(partial) });
    }

    gaps.sort((a, b) => b.priority - a.priority);

    // Sentiment breakdown
    const sentimentBreakdown: Record<FeedbackSentiment, number> = {
        confusion: 0, bug_report: 0, feature_request: 0, positive: 0, neutral: 0,
    };
    for (const c of classifications) sentimentBreakdown[c.sentiment]++;

    const report = buildFeedbackReport(items.length, sentimentBreakdown, gaps, classifications);

    return {
        totalItems: items.length,
        sentimentBreakdown,
        topGaps: gaps.slice(0, 10),
        allClassifications: classifications,
        markdownReport: report,
    };
}

function buildFeedbackReport(
    total: number,
    sentiment: Record<FeedbackSentiment, number>,
    gaps: DocSectionGap[],
    classifications: FeedbackClassification[],
): string {
    const now = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    lines.push('# Documentation Feedback Analysis Report');
    lines.push(`\n_Generated: ${now} — ${total} feedback items analysed_\n`);

    // Sentiment summary
    lines.push('## Sentiment Breakdown\n');
    lines.push('| Sentiment | Count | % |');
    lines.push('|-----------|-------|---|');
    for (const [s, count] of Object.entries(sentiment)) {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        lines.push(`| ${s.replace('_', ' ')} | ${count} | ${pct}% |`);
    }
    lines.push('');

    // Top gaps
    const topGaps = gaps.filter((g) => g.priority > 0).slice(0, 10);
    if (topGaps.length > 0) {
        lines.push('## Top Documentation Gaps (Prioritised)\n');
        lines.push('| Priority | Section | Mentions | Confusion | Bugs | Features | Recommendation |');
        lines.push('|----------|---------|----------|-----------|------|----------|----------------|');
        for (const g of topGaps) {
            lines.push(`| ${g.priority} | ${g.section} | ${g.mentionCount} | ${g.confusionCount} | ${g.bugCount} | ${g.featureRequestCount} | \`${g.recommendation}\` |`);
        }
        lines.push('');

        lines.push('## Recommended Actions\n');
        for (const g of topGaps.slice(0, 5)) {
            lines.push(`### ${g.section} (Priority: ${g.priority})\n`);
            lines.push(`**Action:** ${actionDescription(g.recommendation)}\n`);
            if (g.topPhrases.length > 0) {
                lines.push(`**Most common phrases:** ${g.topPhrases.map((p) => `"${p}"`).join(', ')}\n`);
            }
        }
    }

    // High-impact individual items
    const highImpact = classifications.filter((c) => c.impactScore >= 7).slice(0, 5);
    if (highImpact.length > 0) {
        lines.push('## High-Impact Individual Items\n');
        highImpact.forEach((c) => {
            lines.push(`- **Item ${c.itemId}** (impact: ${c.impactScore}/10, section: ${c.inferredSection ?? 'unknown'}): ${c.keyPhrases.join(', ')}`);
        });
        lines.push('');
    }

    return lines.join('\n');
}

function actionDescription(rec: string): string {
    const map: Record<string, string> = {
        rewrite: 'Rewrite this section for clarity — users are consistently confused.',
        expand: 'Expand this section — users want more depth or breadth.',
        add_examples: 'Add concrete code examples and real-world use cases.',
        add_troubleshooting: 'Add a troubleshooting subsection with common errors and fixes.',
        create_new: 'Create new documentation for this topic — currently undocumented.',
        investigate: 'Review raw feedback to determine the appropriate action.',
    };
    return map[rec] ?? rec;
}
