/**
 * Asset Coordinator
 *
 * Produces structured creative briefs for design and video teams.
 * Defines asset specs, brand guidelines, timeline, and review process.
 * Pure logic — no external API calls.
 */

export type AssetType =
    | 'hero_banner'
    | 'social_image'
    | 'video_ad'
    | 'email_header'
    | 'infographic'
    | 'landing_page_design'
    | 'ebook_cover'
    | 'presentation_deck'
    | 'logo_lockup'
    | 'animated_gif';

export interface AssetSpec {
    assetType: AssetType;
    dimensions?: string;
    format?: string;
    platform?: string;
    quantity?: number;
    notes?: string;
}

export interface CreativeBriefInput {
    campaignName: string;
    brand: string;
    goal: string;
    targetAudience: string;
    keyMessage: string;
    cta: string;
    assets: AssetSpec[];
    deadline: string;
    brandGuidelines?: {
        primaryColor?: string;
        secondaryColor?: string;
        fontFamily?: string;
        doNotUse?: string[];
    };
    referenceExamples?: string[];
    reviewerNames?: string[];
}

export interface AssetDeliverable {
    assetType: AssetType;
    dimensions: string;
    format: string;
    platform: string;
    quantity: number;
    notes: string;
    reviewDeadline: string;
    finalDeadline: string;
}

export interface CreativeBrief {
    campaignName: string;
    brand: string;
    briefedAt: string;
    deadline: string;
    goal: string;
    targetAudience: string;
    keyMessage: string;
    cta: string;
    toneAndStyle: string;
    brandGuidelines: string;
    doNots: string[];
    deliverables: AssetDeliverable[];
    reviewProcess: string[];
    referenceExamples: string[];
    summary: string;
}

// ---------------------------------------------------------------------------
// Asset default specs
// ---------------------------------------------------------------------------

const ASSET_DEFAULTS: Record<AssetType, { dimensions: string; format: string; platform: string }> = {
    hero_banner: { dimensions: '1920×1080px', format: 'PNG/JPG', platform: 'Website / Landing Page' },
    social_image: { dimensions: '1200×628px (LinkedIn/Facebook), 1080×1080px (Instagram)', format: 'PNG/JPG', platform: 'Social Media' },
    video_ad: { dimensions: '1920×1080px (16:9), 1080×1080px (1:1)', format: 'MP4 (H.264)', platform: 'LinkedIn, Meta, YouTube' },
    email_header: { dimensions: '600×200px', format: 'PNG/JPG', platform: 'Email' },
    infographic: { dimensions: '800×2000px (vertical)', format: 'PNG/PDF', platform: 'Blog / Social' },
    landing_page_design: { dimensions: 'Figma frame (1440px desktop, 375px mobile)', format: 'Figma + exported assets', platform: 'Website' },
    ebook_cover: { dimensions: '800×1035px (letter ratio)', format: 'PDF/PNG', platform: 'Gated content / Email' },
    presentation_deck: { dimensions: '1920×1080px (16:9 slides)', format: 'PowerPoint/Keynote/PDF', platform: 'Sales / Events' },
    logo_lockup: { dimensions: 'SVG (scalable), PNG at 1000×500px', format: 'SVG + PNG', platform: 'All channels' },
    animated_gif: { dimensions: '600×400px', format: 'GIF (< 1MB)', platform: 'Email / Social' },
};

function computeReviewDeadline(finalDeadline: string): string {
    const d = new Date(finalDeadline);
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0]!;
}

function computeFirstDraftDeadline(finalDeadline: string): string {
    const d = new Date(finalDeadline);
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0]!;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildCreativeBrief(input: CreativeBriefInput): CreativeBrief {
    const deliverables: AssetDeliverable[] = input.assets.map((asset) => {
        const defaults = ASSET_DEFAULTS[asset.assetType];
        return {
            assetType: asset.assetType,
            dimensions: asset.dimensions ?? defaults.dimensions,
            format: asset.format ?? defaults.format,
            platform: asset.platform ?? defaults.platform,
            quantity: asset.quantity ?? 1,
            notes: asset.notes ?? '',
            reviewDeadline: computeReviewDeadline(input.deadline),
            finalDeadline: input.deadline,
        };
    });

    const toneAndStyle = `Professional and ${input.goal.includes('awareness') ? 'aspirational' : 'conversion-focused'}. Appeal to ${input.targetAudience}. Messaging should be clear, benefit-led, and free of jargon.`;

    const brandGuidelines = [
        input.brandGuidelines?.primaryColor ? `Primary color: ${input.brandGuidelines.primaryColor}` : 'Use brand color palette (see brand guide)',
        input.brandGuidelines?.secondaryColor ? `Secondary color: ${input.brandGuidelines.secondaryColor}` : '',
        input.brandGuidelines?.fontFamily ? `Typography: ${input.brandGuidelines.fontFamily}` : 'Use approved brand fonts only',
        `Logo usage: Minimum clear space = height of the "O" in the logotype. Never stretch, rotate, or recolor the logo.`,
    ].filter(Boolean).join('\n');

    const doNots = [
        'Do not use competitor logos or branding',
        'Do not use stock photos with identifiable faces without a signed model release',
        'Do not use clipart or low-resolution images',
        ...(input.brandGuidelines?.doNotUse ?? []),
    ];

    const reviewProcess = [
        `1. First draft due: ${computeFirstDraftDeadline(input.deadline)}`,
        `2. Reviewer(s) provide feedback by: ${computeReviewDeadline(input.deadline)} (reviewers: ${(input.reviewerNames ?? ['Marketing Lead']).join(', ')})`,
        `3. Revisions applied and final assets delivered by: ${input.deadline}`,
        '4. All files delivered in appropriate formats with source files (Figma, AI, PSD) included',
        '5. File naming convention: [Brand]_[AssetType]_[Platform]_[Date]_v[VersionNumber]',
    ];

    return {
        campaignName: input.campaignName,
        brand: input.brand,
        briefedAt: new Date().toISOString(),
        deadline: input.deadline,
        goal: input.goal,
        targetAudience: input.targetAudience,
        keyMessage: input.keyMessage,
        cta: input.cta,
        toneAndStyle,
        brandGuidelines,
        doNots,
        deliverables,
        reviewProcess,
        referenceExamples: input.referenceExamples ?? [],
        summary: `Creative brief for "${input.campaignName}" — ${deliverables.length} deliverable(s) requested. Deadline: ${input.deadline}. First draft expected by ${computeFirstDraftDeadline(input.deadline)}.`,
    };
}
