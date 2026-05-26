/**
 * Email Automation Builder
 *
 * Builds lead nurture email sequences for HubSpot / Mailchimp.
 * Produces structured sequences with subjects, body drafts, send delays,
 * and trigger conditions. Uses LLM for body copy when callerFn is available.
 */

export type ProseCallerFn = (prompt: string) => Promise<string>;

export type SequenceType =
    | 'welcome'
    | 'lead_nurture'
    | 'trial_onboarding'
    | 're_engagement'
    | 'post_purchase'
    | 'event_followup';

export interface EmailSequenceSpec {
    sequenceType: SequenceType;
    product: string;
    audience: string;
    goal: string;
    fromName?: string;
    brand?: string;
    numEmails?: number;
    keyBenefit?: string;
    cta?: string;
}

export interface EmailStep {
    stepNumber: number;
    delayDays: number;
    triggerCondition: string;
    subject: string;
    preheader: string;
    bodyOutline: string;
    cta: string;
    goal: string;
}

export interface EmailSequence {
    sequenceType: SequenceType;
    product: string;
    audience: string;
    numEmails: number;
    estimatedDurationDays: number;
    steps: EmailStep[];
    platformConfig: {
        hubspot: { workflowType: string; enrollmentTrigger: string };
        mailchimp: { automationType: string; trigger: string };
    };
    summary: string;
}

// ---------------------------------------------------------------------------
// Sequence blueprints (delay + subject + outline templates)
// ---------------------------------------------------------------------------

interface SequenceBlueprint {
    delayDays: number;
    subjectTemplate: string;
    preheaderTemplate: string;
    outlineTemplate: string;
    ctaTemplate: string;
    triggerCondition: string;
    stepGoal: string;
}

const SEQUENCE_BLUEPRINTS: Record<SequenceType, SequenceBlueprint[]> = {
    welcome: [
        { delayDays: 0, subjectTemplate: 'Welcome to {product} — here\'s where to start', preheaderTemplate: 'Your account is ready. Let\'s get you set up.', outlineTemplate: 'Thank you for joining {product}. Introduce core value proposition. Link to getting started guide. Set expectations for what\'s coming.', ctaTemplate: 'Get started →', triggerCondition: 'User signs up', stepGoal: 'Activate user immediately after sign-up' },
        { delayDays: 2, subjectTemplate: 'The #1 thing {audience} use {product} for', preheaderTemplate: 'See how others are getting value fast.', outlineTemplate: 'Highlight the primary use case. Share a quick win or template. Include a 2-minute video walkthrough.', ctaTemplate: 'Try it now →', triggerCondition: 'No action in 2 days', stepGoal: 'Drive first key action' },
        { delayDays: 5, subjectTemplate: 'A quick win for you inside {product}', preheaderTemplate: 'Takes less than 5 minutes.', outlineTemplate: 'Spotlight a specific feature relevant to {audience}. Step-by-step micro-tutorial. Social proof (number of customers using this feature).', ctaTemplate: 'Explore {product} →', triggerCondition: 'Has not completed key action', stepGoal: 'Deepen engagement with a specific feature' },
        { delayDays: 10, subjectTemplate: 'How {audience} are saving time with {product}', preheaderTemplate: 'Real results from real customers.', outlineTemplate: 'Customer success story relevant to {audience}. Quantified outcome. Link to full case study. Soft upgrade/conversion prompt if on free plan.', ctaTemplate: 'See customer stories →', triggerCondition: 'Not yet converted to paid', stepGoal: 'Build trust and drive conversion' },
    ],
    lead_nurture: [
        { delayDays: 0, subjectTemplate: 'The problem with {audience}\'s current approach to {goal}', preheaderTemplate: 'Here\'s what we\'ve seen holding teams back.', outlineTemplate: 'Open with the pain point. Establish credibility. Tease the solution without selling. End with a soft question CTA.', ctaTemplate: 'Read the full guide →', triggerCondition: 'Lead downloads gated content or fills form', stepGoal: 'Establish thought leadership and open conversation' },
        { delayDays: 3, subjectTemplate: 'How to {goal} — a framework for {audience}', preheaderTemplate: 'Steal this 3-step approach.', outlineTemplate: 'Educational framework email. 3 actionable steps. Position {product} as the tool that enables each step without being pushy.', ctaTemplate: 'Get the framework →', triggerCondition: 'Day 3 after lead capture', stepGoal: 'Deliver value and deepen engagement' },
        { delayDays: 7, subjectTemplate: '{audience} teams are getting {keyBenefit} with this approach', preheaderTemplate: 'Here\'s the proof.', outlineTemplate: 'Case study email. Named customer or anonymized archetype. Specific metrics. Before/after story. Natural segue to {product} demo.', ctaTemplate: 'See how they did it →', triggerCondition: 'Has opened at least one previous email', stepGoal: 'Social proof to advance toward demo' },
        { delayDays: 12, subjectTemplate: 'Quick question about your {goal} goals', preheaderTemplate: 'I\'d love to understand your situation.', outlineTemplate: 'Short, personal-feeling email from a human sender. Ask one qualifying question. Offer a 15-minute discovery call. No pressure.', ctaTemplate: 'Book a call →', triggerCondition: 'Has not booked a demo', stepGoal: 'Qualify and book discovery call' },
        { delayDays: 18, subjectTemplate: 'One last thing before I stop bothering you 😊', preheaderTemplate: 'This is my last email on this topic.', outlineTemplate: 'Break-up email style. Genuine, low-pressure. Summarize the value {product} offers. Easy unsubscribe or "not right now" option. Keeps lead warm for future cycles.', ctaTemplate: 'Start your free trial →', triggerCondition: 'Has not converted', stepGoal: 'Last-chance conversion or graceful exit' },
    ],
    trial_onboarding: [
        { delayDays: 0, subjectTemplate: 'Your {product} trial starts now — do this first', preheaderTemplate: 'Get to your first result in under 10 minutes.', outlineTemplate: 'Welcome to trial. Single, clear first action. Progress bar showing steps to "aha moment". Link to onboarding checklist.', ctaTemplate: 'Complete setup →', triggerCondition: 'Trial starts', stepGoal: 'Drive setup completion' },
        { delayDays: 1, subjectTemplate: 'Did you try [Feature] yet?', preheaderTemplate: 'It\'s the thing {audience} love most.', outlineTemplate: 'Spotlight the most-loved feature. GIF or screenshot. "Takes 2 minutes" hook. Subtle social proof.', ctaTemplate: 'Try it →', triggerCondition: 'Has not used key feature', stepGoal: 'Feature activation' },
        { delayDays: 4, subjectTemplate: 'You\'re {X}% of the way to your goal', preheaderTemplate: 'Here\'s what\'s left to do.', outlineTemplate: 'Progress-based email. Celebrate what they\'ve done. Surface remaining onboarding steps. Offer live chat or help center link.', ctaTemplate: 'Continue setup →', triggerCondition: 'Partial onboarding completion', stepGoal: 'Complete onboarding' },
        { delayDays: 10, subjectTemplate: '4 days left in your trial', preheaderTemplate: 'Here\'s what you\'ll lose if you don\'t upgrade.', outlineTemplate: 'Trial countdown email. List what\'s included in paid plan. One compelling testimonial. Clear upgrade CTA.', ctaTemplate: 'Upgrade now →', triggerCondition: '4 days before trial ends', stepGoal: 'Trial to paid conversion' },
    ],
    re_engagement: [
        { delayDays: 0, subjectTemplate: 'We miss you — here\'s what\'s new in {product}', preheaderTemplate: 'A lot has changed since you last logged in.', outlineTemplate: 'Re-engagement opener. Highlight 2-3 new features since their last login. "Come see what\'s new" CTA. No guilt — just value.', ctaTemplate: 'See what\'s new →', triggerCondition: 'No login in 30 days', stepGoal: 'Reactivate dormant user' },
        { delayDays: 5, subjectTemplate: 'Is {product} still right for you?', preheaderTemplate: 'Honest question. No pressure.', outlineTemplate: 'Conversational check-in. Ask why they haven\'t been back. Offer an easy "snooze" or "pause" option. Reiterate core value. Segment responders for follow-up.', ctaTemplate: 'Log back in →', triggerCondition: 'No re-engagement after email 1', stepGoal: 'Gather feedback or trigger return' },
        { delayDays: 10, subjectTemplate: 'Last chance — your account will be downgraded', preheaderTemplate: 'We\'d hate to lose your data.', outlineTemplate: 'Account status warning for inactive paid users. Clear deadline. One-click reactivation option. Offer a human to talk to.', ctaTemplate: 'Reactivate account →', triggerCondition: 'Still no engagement', stepGoal: 'Final reactivation attempt' },
    ],
    post_purchase: [
        { delayDays: 0, subjectTemplate: 'Your order is confirmed — what\'s next', preheaderTemplate: 'Here\'s everything you need to get started.', outlineTemplate: 'Order confirmation + welcome. Access instructions. Links to key resources. Set expectations for onboarding.', ctaTemplate: 'Get started →', triggerCondition: 'Purchase confirmed', stepGoal: 'Smooth onboarding' },
        { delayDays: 7, subjectTemplate: 'How\'s {product} working for you so far?', preheaderTemplate: 'We\'d love your feedback.', outlineTemplate: 'Check-in email. Simple 1-question survey or thumbs up/down. Offer to connect with success team if struggling. NPS seed.', ctaTemplate: 'Share feedback →', triggerCondition: '7 days after purchase', stepGoal: 'Gather satisfaction data' },
        { delayDays: 30, subjectTemplate: '30 days in — here\'s how to get even more from {product}', preheaderTemplate: 'Advanced tips for {audience}.', outlineTemplate: 'Power user tips. Feature highlights they may have missed. Link to community or user group. Upsell/cross-sell if applicable.', ctaTemplate: 'Explore advanced features →', triggerCondition: '30 days after purchase', stepGoal: 'Deepen product adoption and reduce churn' },
    ],
    event_followup: [
        { delayDays: 0, subjectTemplate: 'Thanks for joining us — here\'s the recording', preheaderTemplate: 'Plus the resources we mentioned.', outlineTemplate: 'Thank you for attending. Recording link. Key takeaways (3 bullets). Resources/downloads mentioned. Soft next-step CTA.', ctaTemplate: 'Watch recording →', triggerCondition: 'Event ends (attendees)', stepGoal: 'Deliver on promise and extend engagement' },
        { delayDays: 2, subjectTemplate: 'The one thing most {audience} miss after an event like this', preheaderTemplate: 'Here\'s how to apply what you learned.', outlineTemplate: 'Actionable follow-up to the event theme. Practical next steps. Bridge to {product} as the implementation tool.', ctaTemplate: 'See how {product} helps →', triggerCondition: '2 days after event', stepGoal: 'Drive intent from warm attendees' },
        { delayDays: 7, subjectTemplate: 'Ready to put {goal} into practice?', preheaderTemplate: 'Book a 1:1 session with our team.', outlineTemplate: 'Conversion-focused follow-up. Reference event context. Offer a free consultation or demo tied to event topic. Limited-time offer if applicable.', ctaTemplate: 'Book a demo →', triggerCondition: '1 week after event', stepGoal: 'Convert warm leads from event' },
    ],
};

const PLATFORM_CONFIG: Record<SequenceType, EmailSequence['platformConfig']> = {
    welcome: { hubspot: { workflowType: 'contact-based', enrollmentTrigger: 'Contact is created' }, mailchimp: { automationType: 'Welcome', trigger: 'Subscriber joins audience' } },
    lead_nurture: { hubspot: { workflowType: 'contact-based', enrollmentTrigger: 'Contact fills lead form' }, mailchimp: { automationType: 'Education series', trigger: 'Subscriber joins lead segment' } },
    trial_onboarding: { hubspot: { workflowType: 'contact-based', enrollmentTrigger: 'Trial started property = true' }, mailchimp: { automationType: 'Onboarding', trigger: 'Subscriber joins trial segment' } },
    re_engagement: { hubspot: { workflowType: 'contact-based', enrollmentTrigger: 'Last login date > 30 days ago' }, mailchimp: { automationType: 'Win-back', trigger: 'Subscriber inactive for 30 days' } },
    post_purchase: { hubspot: { workflowType: 'contact-based', enrollmentTrigger: 'Deal stage = Closed Won' }, mailchimp: { automationType: 'Post-purchase', trigger: 'Subscriber makes purchase' } },
    event_followup: { hubspot: { workflowType: 'contact-based', enrollmentTrigger: 'Event attended = true' }, mailchimp: { automationType: 'Event follow-up', trigger: 'Subscriber joins post-event segment' } },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

export async function buildEmailSequence(
    spec: EmailSequenceSpec,
    callerFn?: ProseCallerFn,
): Promise<EmailSequence> {
    const blueprints = SEQUENCE_BLUEPRINTS[spec.sequenceType] ?? SEQUENCE_BLUEPRINTS.lead_nurture;
    const numEmails = Math.min(spec.numEmails ?? blueprints.length, blueprints.length);
    const selected = blueprints.slice(0, numEmails);

    const vars: Record<string, string> = {
        product: spec.product,
        audience: spec.audience,
        goal: spec.goal,
        brand: spec.brand ?? spec.product,
        keyBenefit: spec.keyBenefit ?? 'faster results',
        cta: spec.cta ?? 'Get started',
    };

    const steps: EmailStep[] = await Promise.all(
        selected.map(async (blueprint, i) => {
            const subject = fillTemplate(blueprint.subjectTemplate, vars);
            const preheader = fillTemplate(blueprint.preheaderTemplate, vars);
            const outlineRaw = fillTemplate(blueprint.outlineTemplate, vars);
            const cta = fillTemplate(blueprint.ctaTemplate, vars);

            let bodyOutline = outlineRaw;
            if (callerFn) {
                try {
                    bodyOutline = await callerFn(
                        `Write a concise marketing email body (150-200 words) for this outline:\n\n${outlineRaw}\n\nProduct: ${spec.product}\nAudience: ${spec.audience}\nGoal: ${blueprint.stepGoal}\n\nWrite in a professional, engaging tone. No subject line needed.`,
                    );
                } catch {
                    bodyOutline = outlineRaw;
                }
            }

            return {
                stepNumber: i + 1,
                delayDays: blueprint.delayDays,
                triggerCondition: blueprint.triggerCondition,
                subject,
                preheader,
                bodyOutline,
                cta,
                goal: blueprint.stepGoal,
            };
        }),
    );

    const lastStep = steps[steps.length - 1];
    const estimatedDurationDays = lastStep?.delayDays ?? 0;

    return {
        sequenceType: spec.sequenceType,
        product: spec.product,
        audience: spec.audience,
        numEmails,
        estimatedDurationDays,
        steps,
        platformConfig: PLATFORM_CONFIG[spec.sequenceType],
        summary: `${spec.sequenceType.replace(/_/g, ' ')} sequence for "${spec.product}" targeting ${spec.audience}. ${numEmails} emails over ${estimatedDurationDays} days.`,
    };
}
