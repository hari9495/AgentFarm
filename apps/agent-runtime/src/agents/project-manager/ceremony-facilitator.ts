/**
 * Ceremony Facilitator
 *
 * Pure functions for generating structured agendas and facilitation guides
 * for all Scrum ceremonies and PM meetings.
 *
 * Ceremonies covered:
 *   - Daily Standup (15 min)
 *   - Sprint Planning (2–4 hrs)
 *   - Sprint Review / Demo (1–2 hrs)
 *   - Sprint Retrospective (1–1.5 hrs)
 *   - Backlog Refinement / Grooming (1–2 hrs)
 *   - Project Kickoff (1–2 hrs)
 *   - Steering Committee / Status Meeting (30–60 min)
 *
 * No I/O — all data passed in; output is a plain object.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CeremonyType =
    | 'standup'
    | 'sprint_planning'
    | 'sprint_review'
    | 'retrospective'
    | 'backlog_refinement'
    | 'kickoff'
    | 'steering_committee';

export interface CeremonyInput {
    type: CeremonyType;
    sprintName?: string;
    sprintGoal?: string;
    teamName?: string;
    facilitatorName?: string;
    /** ISO-8601 datetime */
    scheduledAt?: string;
    durationMinutes?: number;
    /** Any relevant context (velocity, risks, open blockers, etc.) */
    context?: string;
    /** Specific topics or agenda items the requester wants included. */
    additionalTopics?: string[];
}

export interface AgendaItem {
    order: number;
    title: string;
    durationMinutes: number;
    description: string;
    facilitatorNotes: string;
    timeboxed: boolean;
}

export interface CeremonyAgenda {
    ceremonyType: CeremonyType;
    title: string;
    totalDurationMinutes: number;
    sprintName?: string;
    sprintGoal?: string;
    openingStatement: string;
    agenda: AgendaItem[];
    closingStatement: string;
    facilitationTips: string[];
    markdown: string;
}

// ---------------------------------------------------------------------------
// Per-ceremony builders
// ---------------------------------------------------------------------------

function buildStandupAgenda(input: CeremonyInput): Omit<CeremonyAgenda, 'markdown'> {
    const team = input.teamName ?? 'the team';
    const sprint = input.sprintName ? ` (${input.sprintName})` : '';
    const duration = input.durationMinutes ?? 15;
    const perPersonMinutes = Math.max(2, Math.floor(duration / 5));

    const agenda: AgendaItem[] = [
        {
            order: 1,
            title: 'Align on Sprint Goal',
            durationMinutes: 1,
            description: 'Briefly recap the sprint goal to focus the team.',
            facilitatorNotes: `Remind ${team} of the sprint goal${sprint}. Ask: "Are we still on track to meet it?"`,
            timeboxed: true,
        },
        {
            order: 2,
            title: 'Team Updates',
            durationMinutes: perPersonMinutes * 5,
            description: 'Each team member answers: What did I do yesterday? What will I do today? Any blockers?',
            facilitatorNotes: `Keep each person to ${perPersonMinutes} min. Park detailed discussions in the "parking lot" — follow up after standup. Listen for blocker signals.`,
            timeboxed: true,
        },
        {
            order: 3,
            title: 'Blocker Review',
            durationMinutes: 3,
            description: 'Assign owners to any blockers raised. Confirm who is responsible for resolving each.',
            facilitatorNotes: 'Do not attempt to resolve blockers during standup. Just capture and assign. If more than 2 blockers exist, schedule a dedicated blocker session.',
            timeboxed: true,
        },
        {
            order: 4,
            title: 'Wrap Up',
            durationMinutes: 1,
            description: 'Confirm any follow-up meetings or actions. Close the standup.',
            facilitatorNotes: 'End on time — a late standup trains the team to disengage.',
            timeboxed: true,
        },
    ];

    return {
        ceremonyType: 'standup',
        title: `Daily Standup${sprint}`,
        totalDurationMinutes: duration,
        sprintName: input.sprintName,
        sprintGoal: input.sprintGoal,
        openingStatement: `Good morning ${team}! Let's run the standup${sprint}. Everyone gets ${perPersonMinutes} minutes. Please be concise — we can follow up on detail after.`,
        agenda,
        closingStatement: 'Thanks everyone. Any follow-ups are captured. See you tomorrow — same time, same place.',
        facilitationTips: [
            'Standup is for the team, not the Scrum Master. Redirect status reports directed to you back to the team.',
            'If someone is consistently late, address it privately — do not call them out in the standup.',
            'If the standup runs over 15 min more than 3× in a row, something is wrong with the format.',
            'Consider rotating facilitator to build team self-organisation.',
        ],
    };
}

function buildSprintPlanningAgenda(input: CeremonyInput): Omit<CeremonyAgenda, 'markdown'> {
    const team = input.teamName ?? 'the team';
    const sprint = input.sprintName ? ` — ${input.sprintName}` : '';
    const duration = input.durationMinutes ?? 120;

    const agenda: AgendaItem[] = [
        {
            order: 1,
            title: 'Sprint Goal Definition',
            durationMinutes: Math.round(duration * 0.1),
            description: 'Product Owner presents the sprint goal and desired outcomes.',
            facilitatorNotes: 'Ensure the sprint goal is outcome-focused, not just a list of features. Push back if it\'s a feature dump.',
            timeboxed: true,
        },
        {
            order: 2,
            title: 'Backlog Review & Clarification',
            durationMinutes: Math.round(duration * 0.25),
            description: 'Walk through the top-priority backlog items. Team asks clarifying questions.',
            facilitatorNotes: 'Ensure each story has acceptance criteria before estimating. Flag any ungroomed items immediately.',
            timeboxed: true,
        },
        {
            order: 3,
            title: 'Capacity Planning',
            durationMinutes: Math.round(duration * 0.1),
            description: 'Review team availability (leave, meetings, on-call). Agree on planned capacity.',
            facilitatorNotes: 'Use historical velocity as the baseline. Apply capacity buffer for overhead (aim for 75–80% of raw capacity).',
            timeboxed: false,
        },
        {
            order: 4,
            title: 'Story Estimation',
            durationMinutes: Math.round(duration * 0.25),
            description: 'Team estimates unpointed stories using planning poker or T-shirt sizing.',
            facilitatorNotes: 'Facilitate, don\'t dominate. Let the team arrive at consensus. If two rounds don\'t converge, use the average and move on.',
            timeboxed: true,
        },
        {
            order: 5,
            title: 'Sprint Commitment',
            durationMinutes: Math.round(duration * 0.2),
            description: 'Team selects stories from the prioritised backlog until capacity is met.',
            facilitatorNotes: 'Protect the team from over-committing. It\'s better to under-commit and deliver than over-commit and slip.',
            timeboxed: false,
        },
        {
            order: 6,
            title: 'Task Breakdown',
            durationMinutes: Math.round(duration * 0.1),
            description: 'For each committed story, team identifies the tasks required to complete it.',
            facilitatorNotes: 'Tasks should be 4–8 hours of work. Ensure dependencies between tasks are captured.',
            timeboxed: false,
        },
    ];

    return {
        ceremonyType: 'sprint_planning',
        title: `Sprint Planning${sprint}`,
        totalDurationMinutes: duration,
        sprintName: input.sprintName,
        sprintGoal: input.sprintGoal,
        openingStatement: `Welcome to sprint planning${sprint}! Today we commit to a sprint goal and select the work ${team} will deliver. Our planning capacity is based on historical velocity. Let's make a realistic, achievable commitment.`,
        agenda,
        closingStatement: 'Sprint plan is confirmed! Sprint goal: "' + (input.sprintGoal ?? '[to be confirmed]') + '". The backlog is updated and tickets are assigned. Good luck this sprint!',
        facilitationTips: [
            'The sprint goal is the "why" — stories are the "what". Always start with the goal.',
            'Don\'t allow ungroomed stories into sprint planning. Reject them and schedule a grooming session.',
            'If planning takes more than 4 hours for a 2-week sprint, the backlog is not ready.',
            'Protect the sprint from scope injection after planning is closed.',
        ],
    };
}

function buildSprintReviewAgenda(input: CeremonyInput): Omit<CeremonyAgenda, 'markdown'> {
    const team = input.teamName ?? 'the team';
    const sprint = input.sprintName ? ` — ${input.sprintName}` : '';
    const duration = input.durationMinutes ?? 60;

    const agenda: AgendaItem[] = [
        {
            order: 1,
            title: 'Opening & Sprint Summary',
            durationMinutes: 5,
            description: 'SM presents sprint summary: goal, committed points, delivered points, and team velocity.',
            facilitatorNotes: 'Be transparent — show exactly what was committed vs delivered. Do not spin incomplete work as complete.',
            timeboxed: true,
        },
        {
            order: 2,
            title: 'Demo: Completed Features',
            durationMinutes: Math.round(duration * 0.5),
            description: 'Team demonstrates each completed user story against its acceptance criteria.',
            facilitatorNotes: 'Each demo should be done by the team member who built it. Live demo is preferred over screenshots. If something is incomplete, do not demo it — flag it.',
            timeboxed: true,
        },
        {
            order: 3,
            title: 'Stakeholder Feedback',
            durationMinutes: Math.round(duration * 0.2),
            description: 'Stakeholders provide feedback on delivered functionality.',
            facilitatorNotes: 'Capture all feedback in writing. New feature requests go to the backlog — do not accept them as sprint scope verbally.',
            timeboxed: true,
        },
        {
            order: 4,
            title: 'Rollover Items',
            durationMinutes: 5,
            description: 'Briefly explain any stories not delivered and their disposition (next sprint / backlog).',
            facilitatorNotes: 'No blame — focus on learnings for estimation improvement.',
            timeboxed: true,
        },
        {
            order: 5,
            title: 'Next Sprint Preview',
            durationMinutes: Math.round(duration * 0.1),
            description: 'PO shares the top priority items for the next sprint.',
            facilitatorNotes: 'This is a preview only — planning happens in sprint planning, not here.',
            timeboxed: true,
        },
    ];

    return {
        ceremonyType: 'sprint_review',
        title: `Sprint Review${sprint}`,
        totalDurationMinutes: duration,
        sprintName: input.sprintName,
        sprintGoal: input.sprintGoal,
        openingStatement: `Welcome to the ${sprint} Sprint Review! ${team} will demo what was delivered this sprint. Stakeholders — your feedback shapes what we build next.`,
        agenda,
        closingStatement: 'Thank you for joining the review! Feedback has been captured and will inform our next sprint. See you at retrospective.',
        facilitationTips: [
            'Do not turn the sprint review into a status meeting. It should be a working demo.',
            'Celebrate what was delivered — even small wins matter for morale.',
            'If stakeholders are disengaged, the demo format needs to change.',
            'Never let stakeholders accept incomplete work just to close a story.',
        ],
    };
}

function buildRetrospectiveAgenda(input: CeremonyInput): Omit<CeremonyAgenda, 'markdown'> {
    const team = input.teamName ?? 'the team';
    const sprint = input.sprintName ? ` — ${input.sprintName}` : '';
    const duration = input.durationMinutes ?? 75;

    const agenda: AgendaItem[] = [
        {
            order: 1,
            title: 'Set the Stage (Safety Check)',
            durationMinutes: 5,
            description: 'Establish psychological safety. Anonymous safety vote if needed.',
            facilitatorNotes: 'Run a 1–5 safety vote if the team is new or trust is low. Only run the full retro if safety is ≥ 3.',
            timeboxed: true,
        },
        {
            order: 2,
            title: 'What Went Well (Keep)',
            durationMinutes: Math.round(duration * 0.2),
            description: 'Team identifies practices and outcomes to reinforce.',
            facilitatorNotes: 'Use sticky notes or a digital board. Cluster similar items. Dot-vote to surface the top 3.',
            timeboxed: true,
        },
        {
            order: 3,
            title: 'What Did Not Go Well (Drop / Improve)',
            durationMinutes: Math.round(duration * 0.25),
            description: 'Team identifies friction, process failures, and repeated problems.',
            facilitatorNotes: 'Focus on process, not people. Use "we" language. If the same issue appears for 3+ sprints, it\'s systemic — escalate.',
            timeboxed: true,
        },
        {
            order: 4,
            title: 'Experiments (Try)',
            durationMinutes: Math.round(duration * 0.2),
            description: 'Team proposes concrete improvements to try next sprint.',
            facilitatorNotes: 'Limit to 2–3 experiments. More than that and nothing gets done. Each experiment needs an owner and a success metric.',
            timeboxed: true,
        },
        {
            order: 5,
            title: 'Action Item Assignment',
            durationMinutes: Math.round(duration * 0.2),
            description: 'Assign owners and deadlines to agreed action items.',
            facilitatorNotes: 'No action item without an owner and a due date. Review last sprint\'s action items first — are they done?',
            timeboxed: false,
        },
        {
            order: 6,
            title: 'Close & Appreciation',
            durationMinutes: 5,
            description: 'Close the retro with team appreciation. Confirm action items are logged.',
            facilitatorNotes: 'End with something positive. Even difficult retros should end with acknowledgement of the team\'s effort.',
            timeboxed: true,
        },
    ];

    return {
        ceremonyType: 'retrospective',
        title: `Sprint Retrospective${sprint}`,
        totalDurationMinutes: duration,
        sprintName: input.sprintName,
        sprintGoal: input.sprintGoal,
        openingStatement: `Welcome to our retrospective${sprint}! This is our team's dedicated time to improve our process. Everything said here stays here. We focus on the process, not the people.`,
        agenda,
        closingStatement: 'Excellent work this sprint and in this retro! Action items are captured and assigned. Let\'s make next sprint even better.',
        facilitationTips: [
            'Review last sprint\'s retro actions FIRST — did we follow through? If not, why not?',
            'Rotate the format (Start/Stop/Continue, 4Ls, Sailboat) to keep engagement high.',
            'If the same problem is raised every sprint, there\'s a structural issue — escalate to leadership.',
            'Psychological safety is the foundation. Without it, the retro is just theatre.',
        ],
    };
}

function buildBacklogRefinementAgenda(input: CeremonyInput): Omit<CeremonyAgenda, 'markdown'> {
    const team = input.teamName ?? 'the team';
    const duration = input.durationMinutes ?? 90;

    const agenda: AgendaItem[] = [
        {
            order: 1,
            title: 'Backlog Health Check',
            durationMinutes: 5,
            description: 'PO presents the current state of the backlog: ready items, ungroomed items, upcoming priorities.',
            facilitatorNotes: 'Aim for at least 2 sprints of groomed, ready stories in the backlog at all times.',
            timeboxed: true,
        },
        {
            order: 2,
            title: 'Story Clarification',
            durationMinutes: Math.round(duration * 0.35),
            description: 'Walk through ungroomed stories. Team asks clarifying questions; PO answers.',
            facilitatorNotes: 'If a story can\'t be clarified in 10 minutes, flag it as a spike and move on.',
            timeboxed: true,
        },
        {
            order: 3,
            title: 'Story Estimation',
            durationMinutes: Math.round(duration * 0.35),
            description: 'Estimate stories using the team\'s agreed pointing scale (Fibonacci, T-shirt, etc.).',
            facilitatorNotes: 'Cap estimation at 2 rounds per story. If consensus can\'t be reached, take the average and move on.',
            timeboxed: true,
        },
        {
            order: 4,
            title: 'Acceptance Criteria Review',
            durationMinutes: Math.round(duration * 0.15),
            description: 'Review and finalise acceptance criteria for stories that will enter the next sprint.',
            facilitatorNotes: 'Each story needs at least one Given/When/Then. Dev and QA should both confirm AC is testable.',
            timeboxed: false,
        },
        {
            order: 5,
            title: 'Backlog Prioritisation Sanity Check',
            durationMinutes: Math.round(duration * 0.1),
            description: 'Confirm the top 10 items are still correctly prioritised relative to each other.',
            facilitatorNotes: 'Business value, risk, and dependencies should all factor into priority. Push back if recency bias is driving priority.',
            timeboxed: true,
        },
    ];

    return {
        ceremonyType: 'backlog_refinement',
        title: 'Backlog Refinement Session',
        totalDurationMinutes: duration,
        sprintName: input.sprintName,
        sprintGoal: input.sprintGoal,
        openingStatement: `Welcome to backlog refinement! Today we ensure the backlog is healthy, estimated, and ready for sprint planning. ${team} — your input on complexity and dependencies is critical.`,
        agenda,
        closingStatement: 'Refinement complete! We now have a well-groomed backlog ready for sprint planning. Thanks everyone.',
        facilitationTips: [
            'Refinement is ongoing — ideally 2–3 sessions between sprint plannings.',
            'Never bring an ungroomed story into sprint planning. Groom first, plan second.',
            'If PO can\'t answer team questions during refinement, the story isn\'t ready.',
            'Track DoR compliance — stories meeting DoR criteria plan faster.',
        ],
    };
}

function buildKickoffAgenda(input: CeremonyInput): Omit<CeremonyAgenda, 'markdown'> {
    const duration = input.durationMinutes ?? 90;

    const agenda: AgendaItem[] = [
        {
            order: 1,
            title: 'Welcome & Introductions',
            durationMinutes: 10,
            description: 'Introduce all project stakeholders, sponsors, and delivery team members.',
            facilitatorNotes: 'Use a simple round-table: name, role, and one thing you\'re looking forward to on this project.',
            timeboxed: true,
        },
        {
            order: 2,
            title: 'Project Charter & Objectives',
            durationMinutes: Math.round(duration * 0.2),
            description: 'PM presents the project charter: vision, objectives, success criteria, and constraints.',
            facilitatorNotes: 'Make the "why" crystal clear before covering "what". Stakeholders must understand the business case.',
            timeboxed: true,
        },
        {
            order: 3,
            title: 'Scope Boundaries (In / Out)',
            durationMinutes: Math.round(duration * 0.15),
            description: 'Explicitly state what is in scope and, critically, what is out of scope.',
            facilitatorNotes: 'Undocumented out-of-scope is future scope creep. Be explicit and get verbal confirmation from the sponsor.',
            timeboxed: true,
        },
        {
            order: 4,
            title: 'Milestones & Timeline',
            durationMinutes: Math.round(duration * 0.15),
            description: 'Review the high-level milestone plan. Flag critical path dependencies.',
            facilitatorNotes: 'Milestones should have clear acceptance criteria — not just dates.',
            timeboxed: true,
        },
        {
            order: 5,
            title: 'Roles & Responsibilities (RACI)',
            durationMinutes: Math.round(duration * 0.1),
            description: 'Confirm who is Responsible, Accountable, Consulted, and Informed for each workstream.',
            facilitatorNotes: 'Ambiguous accountability is the #1 cause of project delays. Agree the RACI now.',
            timeboxed: false,
        },
        {
            order: 6,
            title: 'Communication Plan & Cadence',
            durationMinutes: Math.round(duration * 0.1),
            description: 'Agree on status report frequency, escalation paths, and decision-making authority.',
            facilitatorNotes: 'Confirm who gets weekly status reports and who escalation goes to when blocked.',
            timeboxed: false,
        },
        {
            order: 7,
            title: 'Risks & Initial Risk Register',
            durationMinutes: Math.round(duration * 0.1),
            description: 'Identify top 5 project risks and confirm initial mitigation strategies.',
            facilitatorNotes: 'Don\'t try to solve risks now — just capture them. Assign owners and review dates.',
            timeboxed: true,
        },
        {
            order: 8,
            title: 'Q&A & Next Steps',
            durationMinutes: 10,
            description: 'Open Q&A. Confirm next steps and immediate action items.',
            facilitatorNotes: 'End with clear actions: who does what by when. Send a follow-up email within 24 hours.',
            timeboxed: true,
        },
    ];

    return {
        ceremonyType: 'kickoff',
        title: 'Project Kickoff Meeting',
        totalDurationMinutes: duration,
        sprintName: input.sprintName,
        sprintGoal: input.sprintGoal,
        openingStatement: 'Welcome to the project kickoff! Today we align on the project vision, scope, timeline, and responsibilities. By the end of this session, everyone should know the "why", "what", and "how" of this project.',
        agenda,
        closingStatement: 'Thank you all for joining! We leave today aligned on scope, milestones, and ownership. The formal project charter will be circulated within 48 hours. Let\'s build something great.',
        facilitationTips: [
            'Invite only those who need to be there. Large kickoffs lose engagement quickly.',
            'Send the charter and agenda 48 hours in advance so attendees come prepared.',
            'Document every decision made in the kickoff — they become the project baseline.',
            'Follow up within 24 hours with meeting notes and confirmed action items.',
        ],
    };
}

function buildSteeringCommitteeAgenda(input: CeremonyInput): Omit<CeremonyAgenda, 'markdown'> {
    const duration = input.durationMinutes ?? 45;

    const agenda: AgendaItem[] = [
        {
            order: 1,
            title: 'Action Item Review',
            durationMinutes: 5,
            description: 'Review actions from the previous meeting. Confirm status.',
            facilitatorNotes: 'Start here — it creates accountability. Mark done/in progress/overdue.',
            timeboxed: true,
        },
        {
            order: 2,
            title: 'Project Status (RAG)',
            durationMinutes: Math.round(duration * 0.2),
            description: 'PM presents overall health using RED/AMBER/GREEN status for scope, schedule, budget, and quality.',
            facilitatorNotes: 'No spin — report honestly. Steering committees exist to solve problems, not to be told everything is fine.',
            timeboxed: true,
        },
        {
            order: 3,
            title: 'Milestone Progress',
            durationMinutes: Math.round(duration * 0.15),
            description: 'Review progress against key milestones. Highlight upcoming critical dates.',
            facilitatorNotes: 'Quantify: % complete, planned vs actual, and projected completion date.',
            timeboxed: true,
        },
        {
            order: 4,
            title: 'Risks & Issues for Escalation',
            durationMinutes: Math.round(duration * 0.25),
            description: 'PM escalates issues that require steering committee authority or decision.',
            facilitatorNotes: 'Don\'t bring everything — only bring what needs committee-level input. Pre-frame the decision required.',
            timeboxed: true,
        },
        {
            order: 5,
            title: 'Decisions Required',
            durationMinutes: Math.round(duration * 0.2),
            description: 'Vote on change requests, budget reforecasts, or scope adjustments.',
            facilitatorNotes: 'Document every decision. Verbal decisions without minutes become disputed decisions.',
            timeboxed: false,
        },
        {
            order: 6,
            title: 'Next Meeting Preview & Close',
            durationMinutes: 5,
            description: 'Confirm next meeting date and key agenda items to watch.',
            facilitatorNotes: 'Close on time. Executives who have their time respected are more likely to engage actively.',
            timeboxed: true,
        },
    ];

    return {
        ceremonyType: 'steering_committee',
        title: 'Steering Committee / Status Meeting',
        totalDurationMinutes: duration,
        sprintName: input.sprintName,
        sprintGoal: input.sprintGoal,
        openingStatement: 'Welcome to the steering committee. This session focuses on project health, escalations that require your authority, and decisions needed to keep delivery on track.',
        agenda,
        closingStatement: 'Thank you. All decisions and actions have been captured and will be distributed within 24 hours. Next meeting is confirmed.',
        facilitationTips: [
            'Send status pack 48 hours before the meeting — executives need preparation time.',
            'No surprises at the steering committee. If you\'re raising a red status, the sponsor already knows.',
            'Focus on decisions, not presentations. Use pre-reads to transfer information.',
            'End with a crisp summary: what was decided, what\'s pending, what\'s the next milestone.',
        ],
    };
}

// ---------------------------------------------------------------------------
// Markdown formatter
// ---------------------------------------------------------------------------

function formatCeremonyMarkdown(agenda: Omit<CeremonyAgenda, 'markdown'>): string {
    const lines: string[] = [];

    lines.push(`# 📅 ${agenda.title}`);
    lines.push('');

    if (agenda.sprintGoal) {
        lines.push(`**Sprint Goal:** ${agenda.sprintGoal}`);
    }
    lines.push(`**Duration:** ${agenda.totalDurationMinutes} minutes`);
    lines.push('');

    lines.push('## Opening');
    lines.push(`> ${agenda.openingStatement}`);
    lines.push('');

    lines.push('## Agenda');
    lines.push('');
    lines.push('| # | Item | Duration | Timeboxed |');
    lines.push('|---|---|---|---|');
    for (const item of agenda.agenda) {
        lines.push(`| ${item.order} | ${item.title} | ${item.durationMinutes} min | ${item.timeboxed ? '⏱️ Yes' : 'No'} |`);
    }
    lines.push('');

    lines.push('## Facilitation Guide');
    for (const item of agenda.agenda) {
        lines.push(`### ${item.order}. ${item.title} (${item.durationMinutes} min)`);
        lines.push(item.description);
        lines.push('');
        lines.push(`**Facilitator note:** ${item.facilitatorNotes}`);
        lines.push('');
    }

    lines.push('## Closing');
    lines.push(`> ${agenda.closingStatement}`);
    lines.push('');

    lines.push('## Facilitation Tips');
    for (const tip of agenda.facilitationTips) {
        lines.push(`- 💡 ${tip}`);
    }
    lines.push('');

    lines.push('---');
    lines.push(`_Generated by AgentFarm Scrum Master Agent — ${new Date().toISOString().split('T')[0]}_`);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a full ceremony agenda with facilitation guide for the requested ceremony type.
 */
export function buildCeremonyAgenda(input: CeremonyInput): CeremonyAgenda {
    let base: Omit<CeremonyAgenda, 'markdown'>;

    switch (input.type) {
        case 'standup':
            base = buildStandupAgenda(input);
            break;
        case 'sprint_planning':
            base = buildSprintPlanningAgenda(input);
            break;
        case 'sprint_review':
            base = buildSprintReviewAgenda(input);
            break;
        case 'retrospective':
            base = buildRetrospectiveAgenda(input);
            break;
        case 'backlog_refinement':
            base = buildBacklogRefinementAgenda(input);
            break;
        case 'kickoff':
            base = buildKickoffAgenda(input);
            break;
        case 'steering_committee':
            base = buildSteeringCommitteeAgenda(input);
            break;
    }

    // Append any additional topics requested by the caller
    if (input.additionalTopics && input.additionalTopics.length > 0) {
        const lastOrder = base.agenda.length + 1;
        base.agenda.push({
            order: lastOrder,
            title: 'Additional Topics',
            durationMinutes: input.additionalTopics.length * 5,
            description: input.additionalTopics.join('; '),
            facilitatorNotes: 'Timebox each additional topic to 5 minutes. Park extended discussions for follow-up.',
            timeboxed: true,
        });
    }

    const markdown = formatCeremonyMarkdown(base);
    return { ...base, markdown };
}
