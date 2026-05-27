/**
 * Onboarding Handoff
 *
 * Post-offer-acceptance recruiter actions:
 *   - Day-1 readiness checklist (system access, equipment, accounts)
 *   - New hire announcement draft (company-wide or team-only)
 *   - Buddy / onboarding sponsor assignment briefing
 *   - Pre-start welcome email sequence (acceptance → start date)
 *   - Onboarding portal / HRIS task list (what recruiter must complete)
 *   - Handoff brief for hiring manager and HR/People Ops
 *
 * Pure logic — no external API calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Department =
    | 'engineering' | 'product' | 'design' | 'data'
    | 'sales' | 'marketing' | 'customer_success' | 'support'
    | 'finance' | 'legal' | 'hr_people' | 'operations'
    | 'healthcare_clinical' | 'research' | 'supply_chain'
    | 'facilities' | 'executive' | 'other';

export interface NewHireInput {
    candidateName: string;
    candidateEmail: string;
    jobTitle: string;
    department: Department;
    hiringManagerName: string;
    hiringManagerEmail: string;
    startDate: string;               // ISO date
    workArrangement: 'remote' | 'hybrid' | 'onsite';
    officeLocation?: string;
    employmentType: 'full_time' | 'part_time' | 'contract' | 'temp';
    seniorityLevel: 'entry' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead' | 'manager' | 'director' | 'vp' | 'c_suite';
    companyName: string;
    recruiterName: string;
    recruiterEmail: string;
    hrOpsName?: string;
    hrOpsEmail?: string;
    buddyName?: string;              // Assigned onboarding buddy
    buddyTitle?: string;
    probationPeriodWeeks?: number;   // Default 12 (90 days)
    requiresSecurityClearance?: boolean;
    requiresLicenseVerification?: boolean; // For clinical, legal, finance
    requiresBackgroundCheckCompletion?: boolean;
    laptopShipmentAddress?: string;
    specialEquipmentNeeded?: string;
    teamSlackChannel?: string;
    onboardingPortalUrl?: string;
    hrisUrl?: string;
    itTicketSystemUrl?: string;
    /** ISO country code / plain country name — drives right-to-work form references in email templates.
     *  Supported values: 'us' | 'uk' | 'gb' | 'au' | 'ca' | 'de' | 'fr' | 'nl' | 'sg' | 'in' | 'ae'
     *  Defaults to 'us' when omitted. */
    countryOfHire?: string;
}

export interface ChecklistItem {
    id: string;
    owner: 'recruiter' | 'hr_ops' | 'it' | 'hiring_manager' | 'new_hire' | 'payroll' | 'facilities';
    dueRelativeToStart: string;      // e.g. '-14d', '-7d', '-3d', '0d', '+3d'
    task: string;
    details?: string;
    critical: boolean;               // If missed, blocks Day 1
    dependsOn?: string;              // id of a prerequisite task
}

export interface OnboardingChecklist {
    newHire: Pick<NewHireInput, 'candidateName' | 'jobTitle' | 'startDate'>;
    items: ChecklistItem[];
    criticalPathSummary: string;
    ownerBreakdown: Record<string, number>;
}

export interface WelcomeEmailSequence {
    emails: Array<{
        sendDate: string;            // Relative label: 'day_of_acceptance', '-14d', '-7d', '-1d', '+1d'
        subject: string;
        body: string;
        from: 'recruiter' | 'hiring_manager' | 'ceo' | 'hr_ops';
        note: string;
    }>;
}

export interface AnnouncementDraft {
    audienceScope: 'company_wide' | 'department_only' | 'team_only';
    channel: 'email' | 'slack' | 'intranet';
    subject: string;
    body: string;
    note: string;
}

export interface BuddyBriefing {
    buddyName: string;
    newHireName: string;
    jobTitle: string;
    startDate: string;
    briefingBody: string;
    checklistForBuddy: string[];
}

export interface HiringManagerHandoffBrief {
    hiringManagerName: string;
    newHireName: string;
    jobTitle: string;
    startDate: string;
    briefBody: string;
    day1Agenda: string;
    firstWeekGoals: string[];
    probationMilestones: string[];
}

export interface OnboardingHandoffPackage {
    checklist: OnboardingChecklist;
    welcomeSequence: WelcomeEmailSequence;
    companyAnnouncement: AnnouncementDraft;
    teamAnnouncement: AnnouncementDraft;
    buddyBriefing?: BuddyBriefing;
    hiringManagerBrief: HiringManagerHandoffBrief;
    recruiterHandoffNote: string;
}

// ---------------------------------------------------------------------------
// Country-aware right-to-work form references
// ---------------------------------------------------------------------------

interface RtwLabels {
    /** e.g. "I-9 Section 1" | "Right to Work check" */
    section1Label: string;
    /** e.g. "I-9 Section 2 (complete on Day 1)" | "Right to Work document verification (Day 1)" */
    section2Label: string;
    /** Instruction for the new hire: what to bring / complete on Day 1 */
    dayOneNote: string;
    /** HR task label used in the checklist */
    hrChecklistLabel: string;
    /** Pre-start paperwork note for the HR email */
    preStartFormNote: string;
}

function getRtwLabels(country?: string): RtwLabels {
    const c = (country ?? 'us').toLowerCase().replace(/[-_ ]/g, '');

    if (c === 'uk' || c === 'gb') {
        return {
            section1Label: 'Right to Work self-declaration (online or paper)',
            section2Label: 'Right to Work document check on Day 1 (share code, passport, or biometric card)',
            dayOneNote: 'Please bring original Right to Work documents (passport, biometric residence permit, or share code confirmation email)',
            hrChecklistLabel: 'Conduct Right to Work check (UK: online share-code check or original document inspection) — must be completed on or before Day 1',
            preStartFormNote: 'UK Right to Work: you will be asked to present original documents or provide a share code on your first day — no form to complete in advance',
        };
    }
    if (c === 'au' || c === 'australia') {
        return {
            section1Label: 'VEVO right-to-work check consent',
            section2Label: 'VEVO verification on Day 1 (passport or ImmiCard)',
            dayOneNote: 'Please bring your passport or ImmiCard for VEVO right-to-work verification on Day 1',
            hrChecklistLabel: 'Complete VEVO right-to-work check on or before Day 1 (Australian law requires verification before work commences)',
            preStartFormNote: 'Australia Right to Work: bring your passport or ImmiCard on Day 1 for VEVO verification',
        };
    }
    if (c === 'ca' || c === 'canada') {
        return {
            section1Label: 'Work authorisation confirmation',
            section2Label: 'Work permit / SIN documentation check on Day 1',
            dayOneNote: 'Please bring your Social Insurance Number (SIN) card and any applicable work permit documentation',
            hrChecklistLabel: 'Verify work authorisation (Canadian citizen / PR card / open work permit / employer-specific work permit) on or before Day 1',
            preStartFormNote: 'Canada Work Authorisation: bring your SIN card and work permit (if applicable) on Day 1',
        };
    }
    if (['de', 'germany', 'fr', 'france', 'nl', 'netherlands', 'es', 'spain', 'it', 'italy', 'se', 'sweden', 'pl', 'poland', 'ie', 'ireland'].includes(c)) {
        const countryName = c === 'de' || c === 'germany' ? 'Germany' :
            c === 'fr' || c === 'france' ? 'France' :
            c === 'nl' || c === 'netherlands' ? 'the Netherlands' :
            c === 'es' || c === 'spain' ? 'Spain' :
            c === 'it' || c === 'italy' ? 'Italy' :
            c === 'se' || c === 'sweden' ? 'Sweden' :
            c === 'pl' || c === 'poland' ? 'Poland' : 'the EU';
        return {
            section1Label: 'Work authorisation self-declaration',
            section2Label: `Right to work document verification on Day 1 (passport / EU ID card / residence permit for ${countryName})`,
            dayOneNote: `Please bring your passport or national ID card and any relevant residence/work permit for right-to-work verification`,
            hrChecklistLabel: `Verify EU right-to-work documents (passport / national ID card / residence permit) before or on Day 1`,
            preStartFormNote: `EU Right to Work: bring your passport or national ID card on Day 1 for verification`,
        };
    }
    if (c === 'sg' || c === 'singapore') {
        return {
            section1Label: 'MOM work pass / employment pass consent',
            section2Label: 'Employment Pass / S-Pass / Work Permit check on Day 1',
            dayOneNote: 'Please bring your Employment Pass, S-Pass, or Work Permit card and your passport',
            hrChecklistLabel: 'Verify MOM-issued work pass (EP / S-Pass / Work Permit) — check validity and conditions on or before Day 1',
            preStartFormNote: 'Singapore Right to Work: bring your Employment Pass / S-Pass / Work Permit on Day 1',
        };
    }
    if (c === 'ae' || c === 'uae') {
        return {
            section1Label: 'UAE work permit / residency visa consent',
            section2Label: 'Work permit and Emirates ID check on Day 1',
            dayOneNote: 'Please bring your valid Emirates ID, work permit, and residency visa for verification',
            hrChecklistLabel: 'Verify UAE work permit and residency visa validity before or on Day 1 — ensure MOHRE registration is in place',
            preStartFormNote: 'UAE Right to Work: bring your Emirates ID and work permit on Day 1',
        };
    }
    if (c === 'in' || c === 'india') {
        return {
            section1Label: 'Work eligibility declaration (Indian nationals do not need a work permit to work in India)',
            section2Label: 'Identity and address proof verification on Day 1 (Aadhaar / PAN / passport)',
            dayOneNote: 'Please bring government-issued ID (Aadhaar card, PAN card, or passport) and address proof for background verification',
            hrChecklistLabel: 'Complete identity and address verification (Aadhaar / PAN / passport) on Day 1 per company BGV policy',
            preStartFormNote: 'India Background Verification: bring Aadhaar card, PAN card, and address proof on Day 1',
        };
    }

    // Default: US
    return {
        section1Label: 'I-9 Section 1 (Employment Eligibility Verification — candidate completes before or on Day 1)',
        section2Label: 'I-9 Section 2 (employer completes on Day 1 with original ID documents)',
        dayOneNote: 'Please bring a valid government-issued photo ID for I-9 Section 2 verification on Day 1 (passport, or driver\'s licence + Social Security card)',
        hrChecklistLabel: 'Confirm I-9 / right-to-work verification complete (US: employer must complete Section 2 within 3 business days of start)',
        preStartFormNote: 'I-9 Section 1 (Employment Eligibility Verification) — you will complete Section 2 on your first day',
    };
}

// ---------------------------------------------------------------------------
// Day-1 readiness checklist
// ---------------------------------------------------------------------------

function buildChecklist(input: NewHireInput): OnboardingChecklist {
    const rtw = getRtwLabels(input.countryOfHire);
    const items: ChecklistItem[] = [

        // --- Recruiter tasks ---
        { id: 'rec_1', owner: 'recruiter', dueRelativeToStart: '-14d', task: 'Send offer letter / contract via e-sign and confirm receipt', critical: true },
        { id: 'rec_2', owner: 'recruiter', dueRelativeToStart: '-14d', task: 'Initiate background check (if not completed pre-offer)', critical: input.requiresBackgroundCheckCompletion ?? false, details: 'Ensure FCRA Disclosure & Authorization is signed' },
        { id: 'rec_3', owner: 'recruiter', dueRelativeToStart: '-14d', task: 'Verify professional licenses / credentials', critical: input.requiresLicenseVerification ?? false, details: 'Clinical, legal, and finance roles: confirm licence is current and in good standing' },
        { id: 'rec_4', owner: 'recruiter', dueRelativeToStart: '-7d', task: 'Confirm start logistics with new hire (time, location/link, first-day contact)', critical: true },
        { id: 'rec_5', owner: 'recruiter', dueRelativeToStart: '-7d', task: 'Submit new hire data to HRIS / People Ops (personal details, start date, comp, job code)', critical: true },
        { id: 'rec_6', owner: 'recruiter', dueRelativeToStart: '-3d', task: 'Send pre-start welcome email with Day 1 agenda and parking/badge instructions', critical: false },
        { id: 'rec_7', owner: 'recruiter', dueRelativeToStart: '0d', task: 'Check in with hiring manager to confirm Day 1 is on track', critical: false },
        { id: 'rec_8', owner: 'recruiter', dueRelativeToStart: '+5d', task: 'First-week pulse check — call or email new hire to see how onboarding is going', critical: false },
        { id: 'rec_9', owner: 'recruiter', dueRelativeToStart: '+30d', task: '30-day check-in — confirm new hire is settling in; surface any concerns early', critical: false },

        // --- HR Ops / Payroll tasks ---
        { id: 'hr_1', owner: 'hr_ops', dueRelativeToStart: '-10d', task: 'Create employee record in HRIS', critical: true, dependsOn: 'rec_5' },
        { id: 'hr_2', owner: 'payroll', dueRelativeToStart: '-7d', task: 'Add to payroll system — confirm bank details, tax forms, and payroll start date', critical: true, dependsOn: 'hr_1' },
        { id: 'hr_3', owner: 'hr_ops', dueRelativeToStart: '-7d', task: 'Enroll in benefits (health, dental, 401k) — send enrollment instructions with deadlines', critical: false },
        { id: 'hr_4', owner: 'hr_ops', dueRelativeToStart: '0d', task: 'Issue employee ID / badge', critical: input.workArrangement !== 'remote' },
        { id: 'hr_5', owner: 'hr_ops', dueRelativeToStart: '+3d', task: rtw.hrChecklistLabel, critical: true },
        { id: 'hr_6', owner: 'hr_ops', dueRelativeToStart: '+7d', task: 'Confirm new hire has completed mandatory compliance training (harassment, data privacy, safety)', critical: false },

        // --- IT tasks ---
        { id: 'it_1', owner: 'it', dueRelativeToStart: '-10d', task: 'Create email account and set up SSO credentials', critical: true, dependsOn: 'hr_1' },
        { id: 'it_2', owner: 'it', dueRelativeToStart: '-10d', task: 'Provision role-appropriate software licences (Slack, Jira, GitHub, CRM, EHR, etc.)', critical: true },
        ...(input.workArrangement !== 'onsite' ? [{
            id: 'it_3', owner: 'it' as const, dueRelativeToStart: '-7d',
            task: `Ship laptop/equipment to ${input.laptopShipmentAddress ?? 'home address on file'}`,
            critical: true, details: input.specialEquipmentNeeded ? `Special equipment needed: ${input.specialEquipmentNeeded}` : undefined,
        }] : [{
            id: 'it_3', owner: 'it' as const, dueRelativeToStart: '-3d',
            task: 'Prepare workstation / desk setup at office location',
            critical: true,
        }]),
        { id: 'it_4', owner: 'it', dueRelativeToStart: '-3d', task: 'Add to relevant distribution lists, Slack channels, and security groups', critical: false, details: input.teamSlackChannel ? `Team channel: ${input.teamSlackChannel}` : undefined },
        { id: 'it_5', owner: 'it', dueRelativeToStart: '0d', task: 'Confirm new hire can log in and all systems are accessible on Day 1', critical: true },
        ...(input.requiresSecurityClearance ? [{
            id: 'it_6', owner: 'it' as const, dueRelativeToStart: '-14d',
            task: 'Initiate security clearance investigation process',
            critical: true, details: 'Notify new hire of investigation timeline and required documentation',
        }] : []),

        // --- Hiring Manager tasks ---
        { id: 'hm_1', owner: 'hiring_manager', dueRelativeToStart: '-7d', task: 'Send personal welcome email to new hire (before Day 1)', critical: false },
        { id: 'hm_2', owner: 'hiring_manager', dueRelativeToStart: '-3d', task: 'Confirm Day 1 agenda: first meeting, team intro, 1:1 scheduled', critical: true },
        { id: 'hm_3', owner: 'hiring_manager', dueRelativeToStart: '0d', task: 'Greet new hire on Day 1 (in person or virtual) and kick off onboarding plan', critical: true },
        { id: 'hm_4', owner: 'hiring_manager', dueRelativeToStart: '+7d', task: 'Schedule recurring 1:1 and set 30/60/90-day goals', critical: true },
        { id: 'hm_5', owner: 'hiring_manager', dueRelativeToStart: '+30d', task: '30-day check-in: review goals, address concerns, confirm probation tracking', critical: false },
        { id: 'hm_6', owner: 'hiring_manager', dueRelativeToStart: '+90d', task: `Complete formal ${input.probationPeriodWeeks ?? 12}-week probation review`, critical: false },

        // --- New hire tasks ---
        { id: 'nh_1', owner: 'new_hire', dueRelativeToStart: '-14d', task: 'Return signed offer letter / employment contract', critical: true },
        { id: 'nh_2', owner: 'new_hire', dueRelativeToStart: '-7d', task: `Complete pre-hire paperwork (tax forms, bank details, emergency contact, ${rtw.section1Label})`, critical: true },
        { id: 'nh_3', owner: 'new_hire', dueRelativeToStart: '-7d', task: 'Complete background check consent / provide references (if not already done)', critical: input.requiresBackgroundCheckCompletion ?? false },
        { id: 'nh_4', owner: 'new_hire', dueRelativeToStart: '0d', task: rtw.dayOneNote, critical: true },
        { id: 'nh_5', owner: 'new_hire', dueRelativeToStart: '+7d', task: 'Complete mandatory compliance training by end of Week 1', critical: false },
        { id: 'nh_6', owner: 'new_hire', dueRelativeToStart: '+14d', task: 'Complete benefits enrollment (deadline: typically 30 days from start)', critical: false },

        // --- Facilities (onsite/hybrid only) ---
        ...(input.workArrangement !== 'remote' ? [{
            id: 'fac_1', owner: 'facilities' as const, dueRelativeToStart: '-3d',
            task: `Prepare desk/office at ${input.officeLocation ?? 'main office'}`,
            critical: false,
        }] : []),
    ];

    const ownerBreakdown = items.reduce((acc, item) => {
        acc[item.owner] = (acc[item.owner] ?? 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const criticalItems = items.filter(i => i.critical);
    const criticalPathSummary = `${criticalItems.length} critical tasks across ${Object.keys(ownerBreakdown).length} owners. ` +
        `Key milestones: contract signed (T-14d), HRIS + IT provisioned (T-10d), equipment shipped (T-7d), I-9 completed (T+3d), 30-day check-in (T+30d).`;

    return {
        newHire: { candidateName: input.candidateName, jobTitle: input.jobTitle, startDate: input.startDate },
        items,
        criticalPathSummary,
        ownerBreakdown,
    };
}

// ---------------------------------------------------------------------------
// Pre-start welcome email sequence
// ---------------------------------------------------------------------------

function buildWelcomeSequence(input: NewHireInput): WelcomeEmailSequence {
    const rtw = getRtwLabels(input.countryOfHire);
    return {
        emails: [
            {
                sendDate: 'day_of_acceptance',
                from: 'recruiter',
                subject: `Welcome to ${input.companyName}, ${input.candidateName.split(' ')[0]}! 🎉`,
                body: [
                    `Hi ${input.candidateName},`,
                    ``,
                    `On behalf of the entire ${input.companyName} team — welcome aboard! We are absolutely thrilled that you've accepted and we can't wait for you to join us.`,
                    ``,
                    `Your official start date is **${input.startDate}**. Over the coming days and weeks, you'll receive a series of emails with everything you need to hit the ground running.`,
                    ``,
                    `In the meantime, here's what to expect:`,
                    `- 📋 **Pre-hire paperwork** will arrive by email within 1–2 business days — please complete it as soon as possible`,
                    `- 💻 **Equipment and access details** will be confirmed closer to your start date`,
                    `- 👋 **Your hiring manager, ${input.hiringManagerName},** will be in touch soon to say hello and share your Day 1 agenda`,
                    ``,
                    `If you have any questions at all before you start, please don't hesitate to reach out — I'm here to make this transition as smooth as possible.`,
                    ``,
                    `Congratulations again — this is just the beginning!`,
                    ``,
                    `${input.recruiterName}`,
                    `${input.recruiterEmail}`,
                    `${input.companyName}`,
                ].join('\n'),
                note: 'Send within 2 hours of verbal / written acceptance — first impression matters',
            },
            {
                sendDate: '-14d',
                from: 'hr_ops',
                subject: `Pre-start paperwork — please complete before ${input.startDate}`,
                body: [
                    `Hi ${input.candidateName},`,
                    ``,
                    `We're getting everything ready for your arrival on **${input.startDate}** and we need a few things from you to make sure Day 1 goes smoothly.`,
                    ``,
                    `**Please complete the following in the next 5 business days:**`,
                    `1. Tax withholding forms (W-4 / local equivalent)`,
                    `2. Direct deposit / bank details for payroll`,
                    `3. Emergency contact information`,
                    `4. ${rtw.preStartFormNote}`,
                    input.requiresBackgroundCheckCompletion ? `5. Background check consent form (link sent separately by ${input.recruiterName})` : '',
                    ``,
                    input.hrisUrl ? `You can complete these tasks in our HR portal here: **${input.hrisUrl}**` : `Please reply to this email for instructions on submitting these documents securely.`,
                    ``,
                    `If you have questions about any of these forms, just reply and we'll help you through it.`,
                    ``,
                    `Looking forward to having you with us!`,
                    ``,
                    `${input.hrOpsName ?? 'The People Operations Team'}`,
                    `${input.companyName}`,
                ].filter(l => l !== '').join('\n'),
                note: 'Send 14 days before start — enough time to complete without feeling rushed',
            },
            {
                sendDate: '-7d',
                from: 'hiring_manager',
                subject: `Looking forward to Monday — ${input.hiringManagerName} from ${input.companyName}`,
                body: [
                    `Hi ${input.candidateName},`,
                    ``,
                    `I wanted to send a personal note to say how excited I am that you're joining the team next week!`,
                    ``,
                    `Here's a quick preview of your first day:`,
                    `- **${input.startDate}** — ${input.workArrangement === 'remote' ? `You'll log in at [START_TIME] via [MEETING_LINK]` : `Please arrive at ${input.officeLocation ?? 'the office'} by [START_TIME] — reception will direct you to our floor`}`,
                    `- You'll meet the team, set up your accounts, and we'll have a 1:1 to discuss your first 30 days`,
                    `- No need to prepare anything — just come ready to meet some great people`,
                    ``,
                    `I'll be your first point of contact on Day 1. ${input.buddyName ? `I've also paired you with **${input.buddyName}** as your onboarding buddy — they'll be a great resource as you get settled in.` : ''}`,
                    ``,
                    `If you have any questions before then, please feel free to email me at ${input.hiringManagerEmail}.`,
                    ``,
                    `See you soon!`,
                    ``,
                    `${input.hiringManagerName}`,
                    `${input.companyName}`,
                ].join('\n'),
                note: 'Hiring manager sends personally — this has dramatically higher open and engagement rates than HR emails',
            },
            {
                sendDate: '-1d',
                from: 'recruiter',
                subject: `See you tomorrow! Quick reminder for Day 1`,
                body: [
                    `Hi ${input.candidateName},`,
                    ``,
                    `Just a quick note to say we're all looking forward to seeing you tomorrow!`,
                    ``,
                    `**Day 1 reminder:**`,
                    ...(input.workArrangement !== 'remote' ? [
                        `📍 Location: ${input.officeLocation ?? '[office address]'}`,
                        `🕘 Arrival time: [START_TIME]`,
                        `🚗 Parking: [PARKING_DETAILS]`,
                        `🪪 ${rtw.dayOneNote}`,
                    ] : [
                        `💻 Log in at [START_TIME] using the credentials IT sent you`,
                        `📞 Your first call: [MEETING_LINK]`,
                        `🪪 ${rtw.dayOneNote}`,
                    ]),
                    ``,
                    `Your first point of contact is **${input.hiringManagerName}** (${input.hiringManagerEmail}).`,
                    ``,
                    `If anything comes up tonight or tomorrow morning, you can reach me at ${input.recruiterEmail}.`,
                    ``,
                    `See you tomorrow!`,
                    ``,
                    `${input.recruiterName}`,
                ].join('\n'),
                note: 'Send the afternoon before start — reduces Day 1 anxiety and reduces no-shows',
            },
            {
                sendDate: '+5d',
                from: 'recruiter',
                subject: `First week check-in — how's it going?`,
                body: [
                    `Hi ${input.candidateName},`,
                    ``,
                    `Hard to believe your first week is already almost done! I wanted to check in and see how everything is going.`,
                    ``,
                    `- Is there anything you need that you haven't been able to get set up yet?`,
                    `- Is there anything I can help clarify or follow up on?`,
                    `- Any feedback on the onboarding experience so far?`,
                    ``,
                    `Please don't hesitate to reach out — even small things are worth flagging early so we can resolve them quickly.`,
                    ``,
                    `So glad you're here. Hope Week 1 has been a great start!`,
                    ``,
                    `${input.recruiterName}`,
                ].join('\n'),
                note: 'Critical for early-tenure retention — most new-hire regret surfaces in Week 1–2',
            },
        ].filter(e => e.body.trim() !== '') as WelcomeEmailSequence['emails'],
    };
}

// ---------------------------------------------------------------------------
// New hire announcements
// ---------------------------------------------------------------------------

function buildAnnouncements(input: NewHireInput): { company: AnnouncementDraft; team: AnnouncementDraft } {
    const levelLabel = ['director', 'vp', 'c_suite'].includes(input.seniorityLevel)
        ? 'leadership announcement'
        : 'new team member announcement';

    const company: AnnouncementDraft = {
        audienceScope: ['director', 'vp', 'c_suite'].includes(input.seniorityLevel)
            ? 'company_wide'
            : 'department_only',
        channel: 'email',
        subject: `Welcoming ${input.candidateName} to ${input.companyName} — ${input.jobTitle}`,
        body: [
            `Team,`,
            ``,
            `I'm thrilled to announce that **${input.candidateName}** is joining ${input.companyName} as our new **${input.jobTitle}** in the ${input.department.replace(/_/g, ' ')} team, starting **${input.startDate}**.`,
            ``,
            `${input.candidateName} brings [BACKGROUND_SUMMARY — personalise before sending: 2 sentences about their background and what excites us about their experience].`,
            ``,
            input.workArrangement === 'remote'
                ? `${input.candidateName.split(' ')[0]} will be working remotely and will be available on Slack${input.teamSlackChannel ? ` in ${input.teamSlackChannel}` : ''}.`
                : `${input.candidateName.split(' ')[0]} will be based at our ${input.officeLocation ?? 'office'}.`,
            ``,
            `Please join me in giving ${input.candidateName.split(' ')[0]} a warm welcome — reach out to say hello!`,
            ``,
            `[SENDER NAME]`,
        ].join('\n'),
        note: `Send on or just before start date. ${levelLabel.includes('leadership') ? 'For VP/Director: send from CHRO or CEO.' : 'For individual contributors: send from hiring manager or department head.'} Personalise the [BACKGROUND_SUMMARY] placeholder before sending.`,
    };

    const team: AnnouncementDraft = {
        audienceScope: 'team_only',
        channel: 'slack',
        subject: '',
        body: [
            `👋 Hey team — exciting news! **${input.candidateName}** is joining us as **${input.jobTitle}** starting **${input.startDate}**!`,
            ``,
            `[PERSONAL_NOTE — 1-2 sentences about what you're excited about]`,
            ``,
            `${input.candidateName.split(' ')[0]}, welcome to the team! 🎉`,
        ].join('\n'),
        note: `Post in the team Slack channel${input.teamSlackChannel ? ` (${input.teamSlackChannel})` : ''} on Day 1 morning. Keep it brief and warm — team channel messages should feel human, not HR-formatted.`,
    };

    return { company, team };
}

// ---------------------------------------------------------------------------
// Buddy briefing
// ---------------------------------------------------------------------------

function buildBuddyBriefing(input: NewHireInput): BuddyBriefing | undefined {
    if (!input.buddyName) return undefined;

    return {
        buddyName: input.buddyName,
        newHireName: input.candidateName,
        jobTitle: input.jobTitle,
        startDate: input.startDate,
        briefingBody: [
            `Hi ${input.buddyName},`,
            ``,
            `Thank you for agreeing to be the onboarding buddy for **${input.candidateName}**, who joins us as **${input.jobTitle}** on **${input.startDate}**. Your role is one of the most impactful parts of their onboarding experience!`,
            ``,
            `**Your role as onboarding buddy:**`,
            `- Be a friendly, approachable first point of contact for informal questions`,
            `- Help ${input.candidateName.split(' ')[0]} navigate the unwritten rules — where to get lunch, how meetings really work, who to ask about X`,
            `- Check in proactively in Week 1 and Week 2 — don't wait for them to come to you`,
            `- You are NOT responsible for their formal performance or training — just culture and connection`,
            ``,
            `**Suggested check-in cadence:**`,
            `- Day 1: Quick introduction and offer to grab coffee/virtual coffee this week`,
            `- Week 1: Check-in message or short call — "How's it going? Anything confusing yet?"`,
            `- Week 2: Another check-in — "What's been the biggest surprise so far?"`,
            `- Month 1: One more touch — "Settling in? Is there anything I can help with?"`,
            ``,
            `Please let ${input.recruiterName} know if you have any questions or if anything comes up. And thank you — this matters more than you know.`,
        ].join('\n'),
        checklistForBuddy: [
            `Day 1: Reach out to ${input.candidateName.split(' ')[0]} via Slack / email to introduce yourself`,
            `Day 1–3: Offer to have a short virtual or in-person coffee`,
            `Week 1 end: Check in — "How's your first week going?"`,
            `Week 2: Another informal touchpoint`,
            `Month 1: Final buddy check-in and confirm they're fully settled`,
            `Optional: Invite them to relevant informal team events (virtual or IRL)`,
        ],
    };
}

// ---------------------------------------------------------------------------
// Hiring manager handoff brief
// ---------------------------------------------------------------------------

function buildHiringManagerBrief(input: NewHireInput): HiringManagerHandoffBrief {
    const rtw = getRtwLabels(input.countryOfHire);
    const seniorityIsLead = ['manager', 'director', 'vp', 'c_suite', 'lead', 'staff', 'principal'].includes(input.seniorityLevel);

    const firstWeekGoals = [
        'Complete all administrative setup (accounts, badges, payroll, I-9)',
        'Meet all direct teammates and key cross-functional stakeholders',
        `Complete mandatory compliance training (harassment prevention, data privacy${input.department === 'healthcare_clinical' ? ', HIPAA' : ''})`,
        'Review team charter, current OKRs, and active projects',
        seniorityIsLead ? 'Understand team structure, current priorities, and any in-flight decisions' : 'Shadow at least one core workflow end-to-end',
        'Schedule recurring 1:1 with hiring manager',
    ];

    const probationWeeks = input.probationPeriodWeeks ?? 12;
    const probationMilestones = [
        `30 days: Role clarity confirmed; first deliverable or contribution made; relationships established with immediate team`,
        `60 days: Operating independently on day-to-day tasks; initial feedback loop established with manager`,
        `${probationWeeks} weeks (formal review): ${seniorityIsLead ? 'Demonstrating leadership impact, building credibility with stakeholders, early wins visible' : 'Fully onboarded, meeting role expectations, contributing to team goals'}`,
    ];

    return {
        hiringManagerName: input.hiringManagerName,
        newHireName: input.candidateName,
        jobTitle: input.jobTitle,
        startDate: input.startDate,
        day1Agenda: [
            `**${input.candidateName}'s Day 1 Agenda — ${input.startDate}**`,
            ``,
            `| Time | Activity |`,
            `|---|---|`,
            `| [START_TIME] | Welcome & introductions — hiring manager greet |`,
            `| [+30 min] | IT setup: login, Slack, email, all accounts |`,
            `| [+1h] | Office / virtual tour + meet the team |`,
            `| [+1.5h] | 1:1 with hiring manager: role expectations + 30-day plan |`,
            `| Lunch | Team lunch / virtual social (if arranged) |`,
            `| Afternoon | Async review: company handbook, team wiki, active projects |`,
            `| End of day | ${rtw.section2Label}, benefits enrollment instructions |`,
        ].join('\n'),
        firstWeekGoals,
        probationMilestones,
        briefBody: [
            `Hi ${input.hiringManagerName},`,
            ``,
            `Great news — **${input.candidateName}** has accepted the ${input.jobTitle} offer and starts on **${input.startDate}**. Here's your handoff brief.`,
            ``,
            `**Your actions before Day 1:**`,
            `- [ ] Send a personal welcome email to ${input.candidateName} this week (template available from ${input.recruiterName})`,
            `- [ ] Confirm Day 1 agenda and logistics by ${new Date(new Date(input.startDate).getTime() - 3 * 86400000).toISOString().split('T')[0]}`,
            input.buddyName ? `- [ ] Brief ${input.buddyName} on their buddy role (${input.recruiterName} has sent a separate briefing)` : '- [ ] Assign an onboarding buddy if not already done',
            `- [ ] Ensure the team is briefed and ready to welcome ${input.candidateName.split(' ')[0]} warmly on Day 1`,
            ``,
            `**Probation Period:** ${input.probationPeriodWeeks ?? 12} weeks`,
            `- Please track against the milestones below and document feedback in HRIS`,
            `- If concerns arise before the formal review date, contact HR immediately — early intervention is key`,
            ``,
            `**Recruiter handover:** After Day 1, ${input.recruiterName} transitions responsibility to you and HR Ops. The recruiter will conduct 5-day and 30-day pulse checks with the new hire.`,
            ``,
            `Any questions, reach out: ${input.recruiterEmail}`,
        ].join('\n'),
    };
}

// ---------------------------------------------------------------------------
// Full onboarding handoff package
// ---------------------------------------------------------------------------

export function buildOnboardingHandoff(input: NewHireInput): OnboardingHandoffPackage {
    const checklist = buildChecklist(input);
    const welcomeSequence = buildWelcomeSequence(input);
    const { company: companyAnnouncement, team: teamAnnouncement } = buildAnnouncements(input);
    const buddyBriefing = buildBuddyBriefing(input);
    const hiringManagerBrief = buildHiringManagerBrief(input);

    const recruiterHandoffNote = [
        `# Recruiter Handoff Note`,
        `**New Hire:** ${input.candidateName} → ${input.jobTitle} | Start: ${input.startDate}`,
        `**Hiring Manager:** ${input.hiringManagerName} | **HR Ops:** ${input.hrOpsName ?? 'TBD'}`,
        ``,
        `## Recruiter Checklist (abbreviated)`,
        `- [ ] Offer letter e-signed`,
        `- [ ] HRIS data submitted`,
        `- [ ] Background check ${input.requiresBackgroundCheckCompletion ? 'initiated / pending' : 'N/A or complete'}`,
        `- [ ] Pre-start welcome email sent`,
        `- [ ] Day-1 logistics confirmed with new hire`,
        `- [ ] Hiring manager briefed`,
        input.buddyName ? `- [ ] Buddy (${input.buddyName}) briefed` : `- [ ] Buddy not assigned`,
        ``,
        `## Handoff Status`,
        `After Day 1, formal recruiter responsibility transfers to Hiring Manager + HR Ops.`,
        `Recruiter retains relationship responsibility for pulse checks at Day 5 and Day 30.`,
        ``,
        `**Total checklist items:** ${checklist.items.length} | **Critical:** ${checklist.items.filter(i => i.critical).length}`,
        `**Critical path:** ${checklist.criticalPathSummary}`,
    ].join('\n');

    return {
        checklist,
        welcomeSequence,
        companyAnnouncement,
        teamAnnouncement,
        buddyBriefing,
        hiringManagerBrief,
        recruiterHandoffNote,
    };
}
