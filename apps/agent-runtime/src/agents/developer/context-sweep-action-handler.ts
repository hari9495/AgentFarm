// ============================================================================
// CONTEXT SWEEP ACTION HANDLER — Gap: Team / Political Context
//
// Closes the passive-context gap by giving agents the ability to actively
// sweep team communication channels and synthesise what's happening.
//
// Actions:
//   workspace_dev_context_sweep  — reads recent Slack threads, PR comments,
//     git commits, and email summaries; synthesises "what's going on right now"
//     into the agent's memory for use in future decisions
//
//   workspace_dev_meeting_digest — processes a meeting transcript (text or
//     connector-fetched) into decisions, action items, concerns, and
//     political signals; stores them as episodic memory
//
// Architecture:
//   Pure builder helpers for prompt construction and output parsing.
//   I/O via executeAction (connectors, git, memory write) and callLlm.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextSweepActionType =
    | 'workspace_dev_context_sweep'
    | 'workspace_dev_meeting_digest';

export const CONTEXT_SWEEP_ACTION_TYPES = new Set<ContextSweepActionType>([
    'workspace_dev_context_sweep',
    'workspace_dev_meeting_digest',
]);

export function isContextSweepActionType(at: string): at is ContextSweepActionType {
    return CONTEXT_SWEEP_ACTION_TYPES.has(at as ContextSweepActionType);
}

export type ContextSweepActionResult = {
    ok:           boolean;
    output:       string;
    errorOutput?: string;
    [key: string]: unknown;
};

type ExecuteActionFn = (at: string, p: Record<string, unknown>) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;
type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface ContextSweepActionParams {
    actionType:    ContextSweepActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    callLlm?:      LlmCallFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v.trim() : fallback; }
function safeJson(obj: Record<string, unknown>): ContextSweepActionResult { return { ok: true, output: JSON.stringify(obj) }; }

async function callLlmSafe(fn: LlmCallFn | undefined, prompt: string, sys?: string): Promise<string> {
    if (!fn) return '';
    try { return await fn(prompt, sys); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Context sweep builders
// ---------------------------------------------------------------------------

export interface TeamSignal {
    source:   'slack' | 'pr' | 'commit' | 'email' | 'issue';
    content:  string;
    author?:  string;
    urgency:  'critical' | 'high' | 'medium' | 'low';
    ts?:      string;
}

export function buildContextSweepPrompt(signals: TeamSignal[], projectName: string): string {
    const bySource: Record<string, TeamSignal[]> = {};
    for (const s of signals) {
        (bySource[s.source] ??= []).push(s);
    }

    const lines = [
        `You are a principal engineer synthesising recent team communications.`,
        `Project: ${projectName}`,
        ``,
        `Recent signals:`,
    ];

    for (const [source, sigs] of Object.entries(bySource)) {
        lines.push(`\n### ${source.toUpperCase()} (${sigs.length}):`);
        for (const sig of sigs.slice(0, 5)) {
            lines.push(`  [${sig.urgency}] ${sig.author ? sig.author + ': ' : ''}${sig.content.slice(0, 300)}`);
        }
    }

    lines.push(
        ``,
        `Extract:`,
        `1. What is the team most stressed about right now?`,
        `2. Any unblocked or newly blocked work?`,
        `3. Political dynamics (disagreements, prioritisation tensions, ownership disputes)?`,
        `4. Decisions made since the last sweep`,
        `5. What should the agent prioritise next to be most useful?`,
        ``,
        `Return JSON:`,
        `{`,
        `  "stress_points": string[],`,
        `  "blockers": [{ "what": string, "who_is_blocked": string, "how_to_help": string }],`,
        `  "political_signals": [{ "signal": string, "parties": string[], "implication": string }],`,
        `  "decisions": [{ "decision": string, "made_by": string, "impact": string }],`,
        `  "agent_next_action": string,`,
        `  "urgency": "critical"|"high"|"medium"|"low"`,
        `}`,
        `Valid JSON only.`,
    );

    return lines.join('\n');
}

export interface ContextSweepResult {
    stressPoints:    string[];
    blockers:        Array<{ what: string; whoIsBlocked: string; howToHelp: string }>;
    politicalSignals: Array<{ signal: string; parties: string[]; implication: string }>;
    decisions:       Array<{ decision: string; madeBy: string; impact: string }>;
    agentNextAction: string;
    urgency:         'critical' | 'high' | 'medium' | 'low';
}

export function parseContextSweep(raw: string): ContextSweepResult {
    const fallback: ContextSweepResult = {
        stressPoints: [], blockers: [], politicalSignals: [],
        decisions: [], agentNextAction: '', urgency: 'low',
    };
    try {
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s === -1 || e === -1) return fallback;
        const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
        return {
            stressPoints:    Array.isArray(p['stress_points'])     ? p['stress_points']     as string[] : [],
            blockers:        Array.isArray(p['blockers'])           ? p['blockers']           as ContextSweepResult['blockers'] : [],
            politicalSignals: Array.isArray(p['political_signals']) ? p['political_signals'] as ContextSweepResult['politicalSignals'] : [],
            decisions:       Array.isArray(p['decisions'])          ? p['decisions']          as ContextSweepResult['decisions'] : [],
            agentNextAction: typeof p['agent_next_action'] === 'string' ? p['agent_next_action'] : '',
            urgency:         (['critical','high','medium','low'].includes(String(p['urgency']))) ? p['urgency'] as ContextSweepResult['urgency'] : 'low',
        };
    } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Meeting digest builders
// ---------------------------------------------------------------------------

export function buildMeetingDigestPrompt(transcript: string, meetingType: string, attendees: string[]): string {
    return [
        `You are a senior engineering leader extracting structured intelligence from a meeting transcript.`,
        `Meeting type: ${meetingType}`,
        attendees.length > 0 ? `Attendees: ${attendees.join(', ')}` : '',
        ``,
        `Transcript:`,
        transcript.slice(0, 4000),
        ``,
        `Extract:`,
        ``,
        `Return JSON:`,
        `{`,
        `  "decisions": [{ "decision": string, "owner": string, "deadline": string|null }],`,
        `  "action_items": [{ "task": string, "assignee": string, "due": string|null }],`,
        `  "concerns": [{ "concern": string, "raised_by": string, "severity": "critical"|"high"|"medium" }],`,
        `  "political_signals": [{ "signal": string, "implication": string }],`,
        `  "blockers_raised": string[],`,
        `  "mood": "positive"|"neutral"|"tense"|"critical",`,
        `  "summary": string`,
        `}`,
        `Valid JSON only.`,
    ].filter(Boolean).join('\n');
}

export interface MeetingDigestResult {
    decisions:       Array<{ decision: string; owner: string; deadline: string | null }>;
    actionItems:     Array<{ task: string; assignee: string; due: string | null }>;
    concerns:        Array<{ concern: string; raisedBy: string; severity: string }>;
    politicalSignals: Array<{ signal: string; implication: string }>;
    blockersRaised:  string[];
    mood:            string;
    summary:         string;
}

export function parseMeetingDigest(raw: string): MeetingDigestResult {
    const fallback: MeetingDigestResult = {
        decisions: [], actionItems: [], concerns: [],
        politicalSignals: [], blockersRaised: [], mood: 'neutral', summary: '',
    };
    try {
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s === -1 || e === -1) return fallback;
        const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
        return {
            decisions:        Array.isArray(p['decisions'])        ? p['decisions']        as MeetingDigestResult['decisions']       : [],
            actionItems:      Array.isArray(p['action_items'])     ? p['action_items']     as MeetingDigestResult['actionItems']     : [],
            concerns:         Array.isArray(p['concerns'])         ? p['concerns']         as MeetingDigestResult['concerns']        : [],
            politicalSignals: Array.isArray(p['political_signals']) ? p['political_signals'] as MeetingDigestResult['politicalSignals'] : [],
            blockersRaised:   Array.isArray(p['blockers_raised'])  ? p['blockers_raised']  as string[]                               : [],
            mood:             typeof p['mood']    === 'string' ? p['mood']    : 'neutral',
            summary:          typeof p['summary'] === 'string' ? p['summary'] : '',
        };
    } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleContextSweepAction(
    params: ContextSweepActionParams,
): Promise<ContextSweepActionResult> {
    const { actionType, payload, workspaceDir, executeAction, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_dev_context_sweep
        // Reads recent Slack messages, PR comments, git log, and email;
        // synthesises "what's going on in the team" into memory.
        //
        // payload:
        //   slack_channels?   — string[] of Slack channel names
        //   lookback_hours?   — how far back to sweep (default: 24)
        //   project_name?     — for context
        //   include_prs?      — include recent PR comment sweep (default: true)
        //   include_commits?  — include recent git log (default: true)
        //   store_in_memory?  — write result to episodic memory (default: true)
        // ====================================================================
        case 'workspace_dev_context_sweep': {
            const channels     = Array.isArray(payload['slack_channels']) ? (payload['slack_channels'] as string[]) : [];
            const lookbackHrs  = typeof payload['lookback_hours'] === 'number' ? payload['lookback_hours'] : 24;
            const projectName  = str(payload['project_name'], 'Project');
            const includePrs   = payload['include_prs']     !== false;
            const includeCmts  = payload['include_commits'] !== false;
            const storeMemory  = payload['store_in_memory'] !== false;

            const signals: TeamSignal[] = [];

            // ── Slack sweep ──────────────────────────────────────────────────
            for (const channel of channels.slice(0, 5)) {
                const slackRes = await executeAction('workspace_slack_notify', {
                    action:  'read_channel',
                    channel,
                    limit:   20,
                    lookback_hours: lookbackHrs,
                });
                if (slackRes.ok && slackRes.output) {
                    // Parse message list (connector returns JSON array or text)
                    let msgs: string[] = [];
                    try {
                        const parsed = JSON.parse(slackRes.output);
                        msgs = Array.isArray(parsed) ? parsed.map((m: unknown) => String(m)) : [slackRes.output];
                    } catch {
                        msgs = slackRes.output.split('\n').filter(Boolean);
                    }
                    for (const msg of msgs.slice(0, 10)) {
                        const isUrgent = /urgent|blocker|blocked|broken|down|incident|critical/i.test(msg);
                        signals.push({
                            source:  'slack',
                            content: msg.slice(0, 300),
                            urgency: isUrgent ? 'high' : 'low',
                        });
                    }
                }
            }

            // ── PR comment sweep ─────────────────────────────────────────────
            if (includePrs) {
                const prRes = await executeAction('workspace_github_pr_status', {
                    workspace_dir: workspaceDir,
                    state: 'open',
                });
                if (prRes.ok && prRes.output) {
                    signals.push({
                        source:  'pr',
                        content: prRes.output.slice(0, 800),
                        urgency: /review requested|changes requested|blocked/i.test(prRes.output) ? 'high' : 'medium',
                    });
                }
            }

            // ── Git log sweep ─────────────────────────────────────────────────
            if (includeCmts) {
                const gitRes = await executeAction('git_log', {
                    workspace_dir: workspaceDir,
                    max_count:     20,
                    since:         `${lookbackHrs} hours ago`,
                });
                if (gitRes.ok && gitRes.output) {
                    signals.push({
                        source:  'commit',
                        content: gitRes.output.slice(0, 1000),
                        urgency: /hotfix|fix:|revert|breaking/i.test(gitRes.output) ? 'high' : 'low',
                    });
                }
            }

            // ── Issue feed ────────────────────────────────────────────────────
            const issueRes = await executeAction('workspace_github_issue_triage', {
                workspace_dir: workspaceDir,
                state:         'open',
                label:         'priority',
                limit:         10,
            });
            if (issueRes.ok && issueRes.output) {
                signals.push({
                    source:  'issue',
                    content: issueRes.output.slice(0, 600),
                    urgency: /critical|p0|p1|blocker/i.test(issueRes.output) ? 'critical' : 'medium',
                });
            }

            // ── LLM synthesis ─────────────────────────────────────────────────
            let sweepResult: ContextSweepResult = {
                stressPoints: [], blockers: [], politicalSignals: [],
                decisions: [], agentNextAction: '', urgency: 'low',
            };

            if (callLlm && signals.length > 0) {
                const prompt = buildContextSweepPrompt(signals, projectName);
                const llmRaw = await callLlmSafe(
                    callLlm, prompt,
                    'You are a principal engineer who understands team dynamics. Be honest about political signals.',
                );
                sweepResult = parseContextSweep(llmRaw);
            }

            // ── Store in episodic memory ──────────────────────────────────────
            if (storeMemory && callLlm) {
                const memContent = [
                    `Context sweep (${new Date().toISOString().slice(0, 10)}):`,
                    `Urgency: ${sweepResult.urgency}`,
                    sweepResult.stressPoints.length > 0  ? `Stress: ${sweepResult.stressPoints.slice(0, 2).join(' | ')}` : '',
                    sweepResult.blockers.length > 0       ? `Blockers: ${sweepResult.blockers.map((b) => b.what).slice(0, 2).join(' | ')}` : '',
                    sweepResult.decisions.length > 0      ? `Decisions: ${sweepResult.decisions.map((d) => d.decision).slice(0, 2).join(' | ')}` : '',
                    sweepResult.agentNextAction           ? `Next: ${sweepResult.agentNextAction}` : '',
                ].filter(Boolean).join('\n');

                await executeAction('workspace_memory_write', {
                    content:  memContent,
                    tags:     ['context_sweep', 'team_dynamics', projectName.toLowerCase()],
                });
            }

            return safeJson({
                project_name:      projectName,
                signals_gathered:  signals.length,
                slack_channels:    channels.length,
                urgency:           sweepResult.urgency,
                stress_points:     sweepResult.stressPoints,
                blockers:          sweepResult.blockers,
                political_signals: sweepResult.politicalSignals,
                decisions:         sweepResult.decisions,
                agent_next_action: sweepResult.agentNextAction,
                stored_in_memory:  storeMemory,
                summary: `Context sweep: ${signals.length} signal(s), urgency=${sweepResult.urgency}, ${sweepResult.blockers.length} blocker(s), ${sweepResult.decisions.length} decision(s)`,
            });
        }

        // ====================================================================
        // workspace_dev_meeting_digest
        // Processes a meeting transcript into structured intelligence.
        //
        // payload:
        //   transcript?       — raw transcript text
        //   connector?        — teams | zoom | google_meet (fetch if no transcript)
        //   meeting_id?       — meeting ID for connector fetch
        //   meeting_type?     — standup | planning | design | incident | all-hands
        //   attendees?        — string[] of attendees
        //   store_in_memory?  — default: true
        // ====================================================================
        case 'workspace_dev_meeting_digest': {
            const meetingType  = str(payload['meeting_type'], 'standup');
            const attendees    = Array.isArray(payload['attendees']) ? (payload['attendees'] as string[]) : [];
            const storeMemory  = payload['store_in_memory'] !== false;
            const connector    = str(payload['connector']);
            const meetingId    = str(payload['meeting_id']);

            let transcript = str(payload['transcript']);

            // Fetch transcript from connector if not provided
            if (!transcript && connector && meetingId) {
                const fetchRes = await executeAction('workspace_connector_test', {
                    connector_type: connector,
                    action:         'get_transcript',
                    meeting_id:     meetingId,
                });
                if (fetchRes.ok && fetchRes.output) transcript = fetchRes.output;
            }

            if (!transcript) {
                return { ok: false, output: '', errorOutput: 'workspace_dev_meeting_digest: transcript or (connector + meeting_id) required' };
            }

            let digest: MeetingDigestResult = {
                decisions: [], actionItems: [], concerns: [],
                politicalSignals: [], blockersRaised: [], mood: 'neutral', summary: '',
            };

            if (callLlm) {
                const prompt = buildMeetingDigestPrompt(transcript, meetingType, attendees);
                const llmRaw = await callLlmSafe(
                    callLlm, prompt,
                    'You are a senior engineering leader. Extract facts; flag political signals carefully.',
                );
                digest = parseMeetingDigest(llmRaw);
            } else {
                // Best-effort without LLM: extract action items by pattern
                const actionPattern = /(?:action|todo|will|please)\s*:?\s*([^.\n]+)/gi;
                for (const match of transcript.matchAll(actionPattern)) {
                    digest.actionItems.push({ task: match[1]!.trim(), assignee: 'unknown', due: null });
                }
            }

            // Store in memory
            if (storeMemory) {
                const memParts = [
                    `Meeting digest [${meetingType}] ${new Date().toISOString().slice(0, 10)}:`,
                    digest.summary,
                    digest.decisions.length > 0  ? `Decisions: ${digest.decisions.map((d) => d.decision).join(' | ')}` : '',
                    digest.actionItems.length > 0 ? `Actions: ${digest.actionItems.map((a) => `${a.task} → ${a.assignee}`).join(' | ')}` : '',
                    digest.blockersRaised.length > 0 ? `Blockers: ${digest.blockersRaised.join(' | ')}` : '',
                    digest.mood !== 'neutral'    ? `Mood: ${digest.mood}` : '',
                ].filter(Boolean).join('\n');

                await executeAction('workspace_memory_write', {
                    content: memParts,
                    tags:    ['meeting', meetingType, 'team_context'],
                });
            }

            // Save full digest to workspace
            await executeAction('workspace_write_file', {
                file_path: `.agentfarm/meeting-digest-${Date.now()}.json`,
                content:   JSON.stringify({ meetingType, attendees, digest, digestedAt: new Date().toISOString() }, null, 2),
            });

            return safeJson({
                meeting_type:      meetingType,
                decisions:         digest.decisions,
                action_items:      digest.actionItems,
                concerns:          digest.concerns,
                political_signals: digest.politicalSignals,
                blockers_raised:   digest.blockersRaised,
                mood:              digest.mood,
                stored_in_memory:  storeMemory,
                summary: digest.summary || `Meeting digest: ${digest.decisions.length} decision(s), ${digest.actionItems.length} action(s), mood: ${digest.mood}`,
            });
        }
    }
}
