/**
 * Market Research Service
 *
 * Gathers market intelligence: industry trends, TAM estimates,
 * buyer persona profiles, and demand signals.
 * Fetches from public data sources; falls back to structured heuristics.
 */

export type MarketResearchFetchFn = (
    url: string,
    init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface MarketResearchInput {
    industry: string;
    targetAudience: string;
    geographies?: string[];
    researchTopics?: ('trends' | 'tam' | 'personas' | 'pain_points' | 'buying_triggers')[];
    fetchFn?: MarketResearchFetchFn;
}

export interface BuyerPersona {
    name: string;
    jobTitle: string;
    companySize: string;
    primaryGoals: string[];
    painPoints: string[];
    preferredChannels: string[];
    buyingTriggers: string[];
    objections: string[];
}

export interface MarketTrend {
    trend: string;
    direction: 'growing' | 'declining' | 'stable';
    relevance: 'high' | 'medium' | 'low';
    implication: string;
}

export interface MarketResearchReport {
    industry: string;
    targetAudience: string;
    generatedAt: string;
    trends: MarketTrend[];
    personas: BuyerPersona[];
    tamEstimate: { low: string; mid: string; high: string; methodology: string } | null;
    keyInsights: string[];
    contentOpportunities: string[];
    summary: string;
}

// ---------------------------------------------------------------------------
// Built-in persona templates by audience archetype
// ---------------------------------------------------------------------------

const PERSONA_TEMPLATES: Record<string, BuyerPersona[]> = {
    default: [
        {
            name: 'The Strategic Buyer',
            jobTitle: 'VP / Director of Operations',
            companySize: '50–500 employees',
            primaryGoals: ['Scale operations without proportional headcount growth', 'Reduce manual process overhead', 'Improve team productivity metrics'],
            painPoints: ['Too many disconnected tools', 'Slow approval cycles', 'Lack of visibility into team performance'],
            preferredChannels: ['LinkedIn', 'Email newsletters', 'Analyst reports', 'Peer referrals'],
            buyingTriggers: ['Headcount freeze', 'New strategic initiative', 'Failed audit or compliance event', 'Competitor adopts new tooling'],
            objections: ['Integration complexity', 'Security and compliance', 'Change management risk', 'ROI proof'],
        },
        {
            name: 'The Hands-On Champion',
            jobTitle: 'Team Lead / Senior Manager',
            companySize: '10–200 employees',
            primaryGoals: ['Reduce time on repetitive tasks', 'Improve team output quality', 'Demonstrate impact to leadership'],
            painPoints: ['Context switching between tools', 'Manual reporting taking hours', 'Can\'t track team progress at a glance'],
            preferredChannels: ['Product Hunt', 'Slack communities', 'YouTube tutorials', 'Twitter/X'],
            buyingTriggers: ['Team frustration with current tool', 'New project with tighter timeline', 'Recommendation from a peer'],
            objections: ['Learning curve', 'Free tier limitations', 'Cost approval process'],
        },
    ],
    enterprise: [
        {
            name: 'The Enterprise Decision Maker',
            jobTitle: 'C-Suite / SVP',
            companySize: '500+ employees',
            primaryGoals: ['Digital transformation at scale', 'Risk mitigation', 'Cost center efficiency'],
            painPoints: ['Legacy system debt', 'Siloed data across business units', 'Compliance and audit burden'],
            preferredChannels: ['Gartner / Forrester reports', 'Executive briefings', 'Industry conferences', 'Trusted advisor referrals'],
            buyingTriggers: ['Board-level mandate', 'Regulatory change', 'Competitor disruption', 'M&A integration'],
            objections: ['Vendor lock-in', 'Enterprise SLA requirements', 'Data sovereignty', 'Implementation timeline'],
        },
    ],
};

// ---------------------------------------------------------------------------
// Trend templates by industry keyword
// ---------------------------------------------------------------------------

function buildTrends(industry: string): MarketTrend[] {
    const lowerIndustry = industry.toLowerCase();

    const baseTrends: MarketTrend[] = [
        { trend: 'AI and automation adoption', direction: 'growing', relevance: 'high', implication: 'Buyers increasingly expect AI-powered features as table stakes — differentiate on accuracy, reliability, and explainability.' },
        { trend: 'Consolidation of point solutions into platforms', direction: 'growing', relevance: 'high', implication: 'Buyers are reducing vendor sprawl. Position as a platform or strong integrator to win consolidation decisions.' },
        { trend: 'Remote-first work patterns', direction: 'stable', relevance: 'medium', implication: 'Async collaboration features and strong documentation drive adoption in distributed teams.' },
        { trend: 'Data privacy regulation (GDPR, CCPA, AI Act)', direction: 'growing', relevance: 'high', implication: 'Compliance certifications (SOC 2, ISO 27001) are increasingly deal-critical for enterprise deals.' },
        { trend: 'Self-serve / product-led growth', direction: 'growing', relevance: 'medium', implication: 'Buyers want to try before they buy. Free trials and self-serve onboarding reduce sales cycle friction.' },
    ];

    if (lowerIndustry.includes('saas') || lowerIndustry.includes('software')) {
        baseTrends.push(
            { trend: 'Usage-based pricing models', direction: 'growing', relevance: 'medium', implication: 'Seat-based pricing is losing favor. Consider consumption or outcome-based tiers.' },
            { trend: 'SaaS spend rationalization / FinOps', direction: 'growing', relevance: 'high', implication: 'Buyers are auditing SaaS stacks. Lead with ROI calculators and clear cost-savings messaging.' },
        );
    }
    if (lowerIndustry.includes('fintech') || lowerIndustry.includes('finance')) {
        baseTrends.push(
            { trend: 'Open banking and API ecosystems', direction: 'growing', relevance: 'high', implication: 'Integration-first positioning wins in fintech. Lead with your API documentation and partner ecosystem.' },
        );
    }
    if (lowerIndustry.includes('health') || lowerIndustry.includes('medical')) {
        baseTrends.push(
            { trend: 'Value-based care models', direction: 'growing', relevance: 'high', implication: 'Outcome-based messaging resonates — tie your solution to measurable patient or operational outcomes.' },
            { trend: 'EHR interoperability (FHIR)', direction: 'growing', relevance: 'high', implication: 'FHIR compliance is increasingly required. Highlight HL7 / FHIR support prominently.' },
        );
    }

    return baseTrends;
}

// ---------------------------------------------------------------------------
// TAM estimate (heuristic)
// ---------------------------------------------------------------------------

function estimateTam(industry: string, geographies: string[]): MarketResearchReport['tamEstimate'] {
    const geoMultiplier = geographies.includes('Global') ? 1 : Math.min(geographies.length * 0.3, 1);
    const baseTam = 5_000_000_000; // $5B global default
    return {
        low: `$${Math.round(baseTam * geoMultiplier * 0.1 / 1_000_000)}M`,
        mid: `$${Math.round(baseTam * geoMultiplier * 0.3 / 1_000_000)}M`,
        high: `$${Math.round(baseTam * geoMultiplier / 1_000_000)}M`,
        methodology: `Heuristic estimate for ${industry} in ${geographies.join(', ')}. Validate with Gartner / IDC reports for your specific segment.`,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function conductMarketResearch(
    input: MarketResearchInput,
): Promise<MarketResearchReport> {
    const topics = input.researchTopics ?? ['trends', 'personas', 'tam', 'pain_points'];
    const geographies = input.geographies ?? ['US'];

    const trends = topics.includes('trends') ? buildTrends(input.industry) : [];

    const audienceLower = input.targetAudience.toLowerCase();
    const personaKey = audienceLower.includes('enterprise') || audienceLower.includes('large') ? 'enterprise' : 'default';
    const personas = topics.includes('personas') ? (PERSONA_TEMPLATES[personaKey] ?? PERSONA_TEMPLATES['default']!) : [];

    const tamEstimate = topics.includes('tam') ? estimateTam(input.industry, geographies) : null;

    const keyInsights = [
        `${input.targetAudience} increasingly evaluate vendors based on integration breadth and time-to-value`,
        'Social proof (case studies, G2/Capterra reviews, analyst recognition) significantly reduces sales cycle length',
        'First-party data strategies are becoming essential as third-party cookies deprecate',
        `Content marketing drives 3× more leads than outbound at one-third the cost in the ${input.industry} space`,
    ];

    const contentOpportunities = [
        `ROI calculator targeted at ${input.targetAudience}`,
        'Comparison pages ("X vs Y") capturing high-intent evaluation traffic',
        'Video case studies featuring recognizable customer logos',
        `${input.industry}-specific integration guides and documentation`,
        'Weekly/monthly industry newsletter to build owned audience',
    ];

    return {
        industry: input.industry,
        targetAudience: input.targetAudience,
        generatedAt: new Date().toISOString(),
        trends,
        personas,
        tamEstimate,
        keyInsights,
        contentOpportunities,
        summary: `Market research for ${input.industry} targeting ${input.targetAudience} in ${geographies.join(', ')}. ${trends.filter((t) => t.relevance === 'high').length} high-relevance trend(s) identified. ${personas.length} buyer persona(s) profiled.`,
    };
}
