/**
 * JD Bias Scanner & DEI Analytics
 *
 * Scans job description text for:
 *   - Gender-coded language (masculine/feminine)
 *   - Exclusionary requirements (degree inflation, age proxies)
 *   - Accessibility barriers (physical requirements stated unnecessarily)
 *   - DEI funnel analytics (diversity conversion rates per pipeline stage)
 *   - Inclusion score with rewrite suggestions
 *
 * Based on research by Gaucher et al. (2011), Textio research, and EEOC guidelines.
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JdBiasScanInput {
    jobDescriptionText: string;
    jobTitle?: string;
    targetInclusionScore?: number;   // 0–100; default 80
}

export interface BiasFlag {
    type: 'masculine_coded' | 'feminine_coded' | 'age_proxy' | 'degree_inflation' |
          'physical_requirement' | 'cultural_exclusion' | 'exclusionary_language' | 'legal_risk';
    severity: 'low' | 'medium' | 'high';
    phrase: string;
    context?: string;
    suggestion: string;
    rationale: string;
}

export interface JdBiasScanResult {
    inclusionScore: number;         // 0–100
    overallRating: 'inclusive' | 'moderate_concerns' | 'significant_concerns' | 'needs_rewrite';
    biasFlags: BiasFlag[];
    masculineWordCount: number;
    feminineWordCount: number;
    genderBalance: 'masculine' | 'feminine' | 'balanced';
    positiveElements: string[];
    rewriteSuggestions: string[];
    readabilityNotes: string[];
    summary: string;
}

export interface DeiFunnelInput {
    jobTitle: string;
    stages: Array<{
        stageName: string;
        totalCandidates: number;
        diversityCandidates: number;     // Self-reported or inferred
        diversityCategory?: string;       // e.g. 'women', 'URM', 'veterans'
    }>;
    industryBenchmark?: Record<string, number>;  // stage → benchmark diversity %
}

export interface DeiFunnelReport {
    jobTitle: string;
    overallDiversityRate: number;
    stageFunnel: Array<{
        stageName: string;
        total: number;
        diverse: number;
        diversityPct: number;
        dropOffVsPrevious?: number;
        benchmarkDelta?: number;
        alert?: string;
    }>;
    findings: string[];
    recommendations: string[];
    complianceNotes: string[];
    fullReport: string;
}

// ---------------------------------------------------------------------------
// Word lists (research-validated)
// ---------------------------------------------------------------------------

const MASCULINE_CODED: string[] = [
    'aggressive', 'ambitious', 'analytical', 'assertive', 'autonomous', 'battle', 'boast',
    'challenge', 'champion', 'challenging', 'competitive', 'confident', 'courageous',
    'decisive', 'decision-maker', 'dominate', 'driven', 'enforcement', 'enterprise',
    'fearless', 'fighter', 'force', 'forceful', 'go-getter', 'head-on', 'high-achiever',
    'hustle', 'impactful', 'independent', 'individually', 'leader', 'leadership',
    'logic', 'logical', 'market', 'master', 'ninja', 'objective', 'outperform',
    'outspoken', 'persistence', 'principled', 'proactive', 'rock star', 'self-confident',
    'self-reliant', 'self-sufficient', 'strong', 'superior', 'tackle', 'unicorn',
    'warrior', 'win', 'winner',
];

const FEMININE_CODED: string[] = [
    'collaborate', 'collaborative', 'commit', 'communal', 'compassionate', 'connect',
    'cooperative', 'dependable', 'empathy', 'enthusiastic', 'flexible', 'gentle',
    'honest', 'inclusive', 'interpersonal', 'kind', 'loyal', 'modest', 'nurtur',
    'patient', 'pleasant', 'polite', 'responsible', 'sensitive', 'share', 'sociable',
    'supportive', 'sympathetic', 'team', 'teamwork', 'together', 'trust', 'understand',
    'warm', 'welcoming', 'yield',
];

const AGE_PROXIES: Array<{ phrase: string; suggestion: string }> = [
    { phrase: 'digital native', suggestion: 'proficient with digital tools and platforms' },
    { phrase: 'recent graduate', suggestion: '0–2 years of experience in [field]' },
    { phrase: 'young professional', suggestion: 'early-career professional' },
    { phrase: '10+ years', suggestion: 'extensive experience in [field] (consider if this is truly necessary)' },
    { phrase: 'native english speaker', suggestion: 'fluent English communication skills' },
    { phrase: 'must be flexible', suggestion: 'ability to accommodate occasional schedule variation with advance notice' },
];

const DEGREE_INFLATION: Array<{ phrase: string; suggestion: string }> = [
    { phrase: "bachelor's degree required", suggestion: "Bachelor's degree or equivalent practical experience" },
    { phrase: "master's degree required", suggestion: "Master's degree or equivalent professional experience; we will consider candidates with substantial relevant experience" },
    { phrase: 'phd required', suggestion: 'PhD or equivalent research/industry experience' },
    { phrase: 'degree required', suggestion: 'Degree or equivalent practical experience (we evaluate skills, not just credentials)' },
    { phrase: 'college degree', suggestion: 'Relevant education or experience in [field]' },
];

const EXCLUSIONARY_PHRASES: Array<{ phrase: string; severity: BiasFlag['severity']; suggestion: string; rationale: string }> = [
    { phrase: 'culture fit', severity: 'high', suggestion: 'alignment with our values of [list specific values]', rationale: '"Culture fit" is subjective and can mask affinity bias; replace with specific, observable values or behaviours' },
    { phrase: 'must be available nights and weekends', severity: 'medium', suggestion: 'occasional evening or weekend availability may be required with advance notice', rationale: 'Blanket availability requirements disproportionately impact caregivers' },
    { phrase: 'ability to lift', severity: 'low', suggestion: 'retain if genuinely required for the role; otherwise remove', rationale: 'Physical requirements must be bona fide occupational qualifications (BFOQ); including them when not required may deter disabled candidates' },
    { phrase: 'must be a self-starter', severity: 'low', suggestion: 'works independently and takes initiative', rationale: 'Cliché that can signal poor onboarding/management rather than a clear expectation' },
    { phrase: 'fast-paced environment', severity: 'low', suggestion: 'dynamic environment with shifting priorities', rationale: '"Fast-paced" can be a deterrent for candidates with disabilities or neurodivergent candidates; be specific about what it means' },
    { phrase: 'work hard, play hard', severity: 'high', suggestion: 'remove entirely', rationale: 'Signals a drinking culture and creates age/family-status concerns' },
    { phrase: 'young, dynamic team', severity: 'high', suggestion: 'collaborative, high-energy team', rationale: '"Young" as a team descriptor may constitute age discrimination under ADEA' },
    { phrase: 'only us citizens', severity: 'high', suggestion: 'must have authorisation to work in the US (or: visa sponsorship is not available for this role)', rationale: 'Citizenship-only requirements must be justified by law or national security; "must be authorised to work" is correct standard language' },
    { phrase: 'must be a team player', severity: 'low', suggestion: 'collaborates effectively with cross-functional partners', rationale: 'Overused and vague; replace with specific collaboration behaviour' },
];

const POSITIVE_ELEMENTS: string[] = [
    'We are an equal opportunity employer',
    'We welcome applications from all backgrounds',
    'We are committed to diversity, equity, and inclusion',
    'Reasonable accommodations',
    'disability',
    'We encourage you to apply even if',
    'No degree required',
    'equivalent experience',
    'flexible work',
    'remote-friendly',
    'parental leave',
    'unlimited PTO',
    'mental health',
    'neurodiversity',
];

// ---------------------------------------------------------------------------
// Scanner logic
// ---------------------------------------------------------------------------

function countCodedWords(text: string, wordList: string[]): { count: number; found: string[] } {
    const lower = text.toLowerCase();
    const found = wordList.filter(w => lower.includes(w.toLowerCase()));
    return { count: found.length, found };
}

function checkAgePhrases(text: string): BiasFlag[] {
    const lower = text.toLowerCase();
    return AGE_PROXIES
        .filter(ap => lower.includes(ap.phrase.toLowerCase()))
        .map(ap => ({
            type: 'age_proxy' as const,
            severity: 'medium' as const,
            phrase: ap.phrase,
            suggestion: ap.suggestion,
            rationale: 'May be interpreted as a proxy for age, potentially violating ADEA',
        }));
}

function checkDegreeInflation(text: string): BiasFlag[] {
    const lower = text.toLowerCase();
    return DEGREE_INFLATION
        .filter(d => lower.includes(d.phrase.toLowerCase()))
        .map(d => ({
            type: 'degree_inflation' as const,
            severity: 'medium' as const,
            phrase: d.phrase,
            suggestion: d.suggestion,
            rationale: 'Degree requirements that exceed job necessity reduce your applicant pool by ~30% and disproportionately impact underrepresented groups',
        }));
}

function checkExclusionaryPhrases(text: string): BiasFlag[] {
    const lower = text.toLowerCase();
    return EXCLUSIONARY_PHRASES
        .filter(ep => lower.includes(ep.phrase.toLowerCase()))
        .map(ep => ({
            type: 'exclusionary_language' as const,
            severity: ep.severity,
            phrase: ep.phrase,
            suggestion: ep.suggestion,
            rationale: ep.rationale,
        }));
}

function computeInclusionScore(flags: BiasFlag[], masc: number, fem: number, totalWords: number): number {
    let score = 100;
    // Deduct for bias flags
    flags.forEach(f => {
        score -= f.severity === 'high' ? 12 : f.severity === 'medium' ? 7 : 3;
    });
    // Deduct for masculine word density
    const mascDensity = masc / Math.max(totalWords, 1) * 100;
    if (mascDensity > 5) score -= 10;
    else if (mascDensity > 3) score -= 5;
    // Small bonus for balanced gender coding
    const femDensity = fem / Math.max(totalWords, 1) * 100;
    if (mascDensity < 3 && femDensity < 3) score += 5;
    return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Public API — JD Scanner
// ---------------------------------------------------------------------------

export function scanJobDescriptionForBias(input: JdBiasScanInput): JdBiasScanResult {
    const text = input.jobDescriptionText;
    const wordCount = text.split(/\s+/).length;

    const { count: mascCount, found: mascFound } = countCodedWords(text, MASCULINE_CODED);
    const { count: femCount } = countCodedWords(text, FEMININE_CODED);

    const ageFlagsList = checkAgePhrases(text);
    const degreeFlagsList = checkDegreeInflation(text);
    const exclusionFlagsList = checkExclusionaryPhrases(text);

    // Masculine-coded flags
    const mascFlags: BiasFlag[] = mascFound.slice(0, 8).map(phrase => ({
        type: 'masculine_coded' as const,
        severity: 'low' as const,
        phrase,
        suggestion: `Consider replacing "${phrase}" with a more neutral term (e.g., "${phrase === 'aggressive' ? 'proactive' : phrase === 'ninja' ? 'expert' : phrase === 'rock star' ? 'high-performing' : 'results-oriented'}")`,
        rationale: 'Masculine-coded words deter women applicants at a statistically significant rate (Gaucher et al., 2011)',
    }));

    const allFlags: BiasFlag[] = [
        ...mascFlags,
        ...ageFlagsList,
        ...degreeFlagsList,
        ...exclusionFlagsList,
    ];

    const positiveElements = POSITIVE_ELEMENTS.filter(pe =>
        text.toLowerCase().includes(pe.toLowerCase()),
    );

    const inclusionScore = computeInclusionScore(allFlags, mascCount, femCount, wordCount);
    const overallRating: JdBiasScanResult['overallRating'] =
        inclusionScore >= 85 ? 'inclusive' :
        inclusionScore >= 65 ? 'moderate_concerns' :
        inclusionScore >= 45 ? 'significant_concerns' : 'needs_rewrite';

    const genderBalance: JdBiasScanResult['genderBalance'] =
        mascCount > femCount * 2 ? 'masculine' :
        femCount > mascCount * 2 ? 'feminine' : 'balanced';

    const rewriteSuggestions: string[] = [
        ...allFlags.filter(f => f.severity === 'high').map(f => `Replace "${f.phrase}" → ${f.suggestion}`),
        mascCount > 5 ? `Reduce masculine-coded words (found: ${mascFound.slice(0, 5).join(', ')})` : '',
        !positiveElements.length ? 'Add an explicit EEO statement and disability accommodation note' : '',
        degreeFlagsList.length > 0 ? 'Consider adding "or equivalent practical experience" to all degree requirements' : '',
    ].filter(Boolean);

    const readabilityNotes: string[] = [
        wordCount > 800 ? `JD is ${wordCount} words — aim for 300–600 words; longer JDs reduce application rates` : '',
        text.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('•')).length < 3
            ? 'Add bullet points to responsibilities and requirements for better readability'
            : '',
        !text.toLowerCase().includes('salary') && !text.toLowerCase().includes('compensation')
            ? 'Consider adding a salary range — increases application volume by 30% and signals transparency'
            : '',
    ].filter(Boolean);

    const summary = [
        `**Inclusion Score: ${inclusionScore}/100** (${overallRating.replace(/_/g, ' ')})`,
        `Bias flags: ${allFlags.length} (${allFlags.filter(f => f.severity === 'high').length} high, ${allFlags.filter(f => f.severity === 'medium').length} medium, ${allFlags.filter(f => f.severity === 'low').length} low)`,
        `Gender coding: ${genderBalance} (masculine: ${mascCount}, feminine: ${femCount})`,
        positiveElements.length > 0 ? `✓ Positive inclusion signals found: ${positiveElements.slice(0, 3).join(', ')}` : '⚠ No explicit inclusion language detected',
    ].join('\n');

    return {
        inclusionScore,
        overallRating,
        biasFlags: allFlags,
        masculineWordCount: mascCount,
        feminineWordCount: femCount,
        genderBalance,
        positiveElements,
        rewriteSuggestions,
        readabilityNotes,
        summary,
    };
}

// ---------------------------------------------------------------------------
// Public API — DEI Funnel Analytics
// ---------------------------------------------------------------------------

export function buildDeiFunnelReport(input: DeiFunnelInput): DeiFunnelReport {
    const { stages } = input;
    if (stages.length === 0) {
        return {
            jobTitle: input.jobTitle,
            overallDiversityRate: 0,
            stageFunnel: [],
            findings: ['No stage data provided'],
            recommendations: ['Collect demographic data at each pipeline stage (with candidate consent and EEOC compliance)'],
            complianceNotes: [],
            fullReport: 'No data.',
        };
    }

    const funnel = stages.map((s, i) => {
        const diversityPct = s.totalCandidates > 0
            ? Math.round((s.diversityCandidates / s.totalCandidates) * 100)
            : 0;
        const prevStage = i > 0 ? stages[i - 1] : null;
        const prevPct = prevStage && prevStage.totalCandidates > 0
            ? (prevStage.diversityCandidates / prevStage.totalCandidates) * 100
            : null;
        const dropOff = prevPct !== null ? Math.round(diversityPct - prevPct) : undefined;
        const benchmarkDelta = input.industryBenchmark?.[s.stageName] !== undefined
            ? Math.round(diversityPct - (input.industryBenchmark[s.stageName] ?? 0))
            : undefined;
        const alert = dropOff !== undefined && dropOff < -10
            ? `⚠️ Significant diversity drop-off at ${s.stageName} (${dropOff}pp)`
            : benchmarkDelta !== undefined && benchmarkDelta < -15
            ? `⚠️ Below industry benchmark at ${s.stageName} by ${Math.abs(benchmarkDelta)}pp`
            : undefined;
        return { stageName: s.stageName, total: s.totalCandidates, diverse: s.diversityCandidates, diversityPct, dropOffVsPrevious: dropOff, benchmarkDelta, alert };
    });

    const topStage = funnel[0];
    const overallDiversityRate = topStage ? topStage.diversityPct : 0;

    const findings: string[] = [];
    funnel.forEach(s => {
        if (s.alert) findings.push(s.alert);
    });
    if (findings.length === 0) findings.push('No significant diversity drop-offs detected across the pipeline');

    const recommendations: string[] = [
        funnel.some(s => (s.dropOffVsPrevious ?? 0) < -10)
            ? 'Investigate bias in the stage(s) with significant diversity drop-off — consider structured interview training'
            : '',
        overallDiversityRate < 30
            ? 'Top-of-funnel diversity is low — expand sourcing channels (HBCUs, Lesbians Who Tech, Out in Tech, etc.)'
            : '',
        'Use structured interview scorecards to reduce evaluator bias',
        'Ensure JD language is inclusive — run workspace_rec_scan_jd_bias before posting',
        'Conduct diverse slate analysis before finalising shortlist',
        'Obtain DEI data from candidates voluntarily and per EEOC voluntary self-identification guidelines',
    ].filter(Boolean);

    const complianceNotes = [
        'Demographic data must be collected voluntarily and separately from selection decisions (EEOC Section 709)',
        'Do not use demographic data as a factor in any individual hiring decision',
        'Aggregate diversity data is used for analysis only — not to advantage/disadvantage individual candidates',
        'Store demographic data separately from hiring records with restricted access',
    ];

    const fullReport = [
        `# DEI Funnel Report — ${input.jobTitle}`,
        `**Overall diversity rate (top of funnel):** ${overallDiversityRate}%`,
        ``,
        `## Stage Funnel`,
        `| Stage | Total | Diverse | % | vs. Prev | vs. Benchmark |`,
        `|-------|-------|---------|---|----------|---------------|`,
        ...funnel.map(s => `| ${s.stageName} | ${s.total} | ${s.diverse} | ${s.diversityPct}% | ${s.dropOffVsPrevious !== undefined ? `${s.dropOffVsPrevious > 0 ? '+' : ''}${s.dropOffVsPrevious}pp` : 'N/A'} | ${s.benchmarkDelta !== undefined ? `${s.benchmarkDelta > 0 ? '+' : ''}${s.benchmarkDelta}pp` : 'N/A'} |`),
        ``,
        findings.length > 0 ? `## Findings\n${findings.map(f => `- ${f}`).join('\n')}` : '',
        ``,
        `## Recommendations`,
        ...recommendations.filter(Boolean).map(r => `- ${r}`),
    ].filter(Boolean).join('\n');

    return {
        jobTitle: input.jobTitle,
        overallDiversityRate,
        stageFunnel: funnel,
        findings,
        recommendations,
        complianceNotes,
        fullReport,
    };
}
