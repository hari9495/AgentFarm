// ============================================================================
// TESTER EXPLORATION ENGINE
// Sprint 19 — Exploratory Testing with Heuristic Judgment
//
// Covers the "intuition gap" by encoding established QA heuristics:
//   - SFDPOT (Structure, Function, Data, Platform, Operations, Time)
//   - CRUD surface coverage
//   - Boundary-value and error-path probing
//   - Visual anomaly detection via LLM screenshot analysis
//
// buildExplorationCharter    → derives a time-boxed session charter from a ticket
// pickNextHeuristicAction    → SFDPOT-guided next action selector
// buildAnomalyDetectionPrompt→ LLM prompt to identify visual bugs in a screenshot
// buildExplorationSessionLog → summarise a completed session for episodic memory
// ============================================================================

import type { TaskEnvelope, ProcessedTaskResult } from '../../execution-engine.js';

// ---------------------------------------------------------------------------
// SFDPOT heuristic categories
// ---------------------------------------------------------------------------

export type SfdpotDimension = 'structure' | 'function' | 'data' | 'platform' | 'operations' | 'time';

const SFDPOT_ACTIONS: Record<SfdpotDimension, string[]> = {
    structure: [
        'Verify every nav link resolves without 404',
        'Check all form fields render with correct input types',
        'Validate page hierarchy: breadcrumbs, headings, landmarks',
        'Confirm responsive layout at 375px, 768px, 1280px, 1920px',
        'Check focus order is logical (Tab traversal)',
    ],
    function: [
        'Submit each form with valid data — assert success state',
        'Submit each form with missing required fields — assert inline errors',
        'Test every CTA button triggers expected outcome',
        'Verify search returns relevant results and handles empty query',
        'Confirm pagination / infinite scroll loads more items',
    ],
    data: [
        'Enter max-length input (boundary value) in every text field',
        'Enter 0 and negative numbers in numeric fields',
        'Paste special characters and SQL-like strings',
        'Upload oversized file where file input exists',
        'Check empty-state UI when list has no records',
    ],
    platform: [
        'Test on Chrome, Firefox, and Edge',
        'Verify on iOS Safari (mobile viewport emulation)',
        'Check with keyboard-only navigation (no mouse)',
        'Test with screen reader role announcements (axe scan)',
        'Verify colours pass WCAG AA contrast ratio',
    ],
    operations: [
        'Slow network throttle (Slow 3G) — check loading states',
        'Disable JavaScript — assert graceful degradation',
        'Interrupt a multi-step form mid-way — verify no data loss',
        'Trigger concurrent requests (double-click submit) — assert no duplicate actions',
        'Session timeout — assert redirect to login without data loss',
    ],
    time: [
        'Set system clock to year-end boundary (Dec 31) and verify date pickers',
        'Check "expires in X days" countdown accuracy',
        'Verify timestamps display in the correct timezone',
        'Test with DST-transition datetime values',
    ],
};

// ---------------------------------------------------------------------------
// Session state types
// ---------------------------------------------------------------------------

export type ExplorationAction = {
    dimension: SfdpotDimension;
    description: string;
    status: 'pending' | 'passed' | 'failed' | 'skipped';
    note?: string;
};

export type ExplorationCharter = {
    sessionId: string;
    area: string;           // e.g. "checkout flow", "user profile page"
    mission: string;        // one-sentence goal
    timeboxMinutes: number;
    dimensions: SfdpotDimension[];
    actions: ExplorationAction[];
    startedAt: string;
    acceptanceCriteria?: string;  // injected from payload when available
};

// ---------------------------------------------------------------------------
// buildExplorationCharter
// ---------------------------------------------------------------------------

export function buildExplorationCharter(task: TaskEnvelope): ExplorationCharter {
    const payload = task.payload ?? {};
    const area = String(
        payload['area'] ?? payload['component'] ?? payload['target'] ?? payload['title'] ?? 'application',
    ).slice(0, 120);
    const timeboxMinutes = typeof payload['timebox_minutes'] === 'number'
        ? Math.max(15, Math.min(120, payload['timebox_minutes']))
        : 45;

    // Acceptance criteria injected from a Jira story, PRD, or manual input
    const acceptanceCriteria = (
        typeof payload['acceptance_criteria'] === 'string' ? payload['acceptance_criteria'] :
            typeof payload['story_description'] === 'string' ? payload['story_description'] :
                typeof payload['jira_story'] === 'string' ? payload['jira_story'] :
                    ''
    ).trim().slice(0, 500);

    const mission = acceptanceCriteria
        ? `Explore the ${area} using SFDPOT heuristics and validate: ${acceptanceCriteria.slice(0, 200)} (timebox: ${timeboxMinutes} min)`
        : `Explore the ${area} using SFDPOT heuristics and surface defects within ${timeboxMinutes} min`;

    // Choose dimensions: if payload specifies them use those, else default set
    const requestedDimensions = Array.isArray(payload['dimensions'])
        ? (payload['dimensions'] as string[]).filter((d) => d in SFDPOT_ACTIONS) as SfdpotDimension[]
        : (['structure', 'function', 'data', 'platform'] as SfdpotDimension[]);

    const actions: ExplorationAction[] = requestedDimensions.flatMap((dim) =>
        SFDPOT_ACTIONS[dim].map((desc) => ({
            dimension: dim,
            description: desc,
            status: 'pending' as const,
        })),
    );

    return {
        sessionId: `explore-${Date.now()}`,
        area,
        mission,
        timeboxMinutes,
        dimensions: requestedDimensions,
        actions,
        startedAt: new Date().toISOString(),
        ...(acceptanceCriteria ? { acceptanceCriteria } : {}),
    };
}

// ---------------------------------------------------------------------------
// pickNextHeuristicAction
// ---------------------------------------------------------------------------

export function pickNextHeuristicAction(charter: ExplorationCharter): ExplorationAction | null {
    // Priority: failed items first (for retesting), then pending, skipping passed/skipped
    const failed = charter.actions.find((a) => a.status === 'failed');
    if (failed) return failed;
    return charter.actions.find((a) => a.status === 'pending') ?? null;
}

// ---------------------------------------------------------------------------
// buildAnomalyDetectionPrompt
// ---------------------------------------------------------------------------

export function buildAnomalyDetectionPrompt(
    screenshotBase64: string,
    context: {
        url?: string;
        lastAction?: string;
        appArea?: string;
    },
): string {
    const url = context.url ? `Page URL: ${context.url}` : '';
    const action = context.lastAction ? `Last action performed: ${context.lastAction}` : '';
    const area = context.appArea ? `Area under test: ${context.appArea}` : '';

    return [
        'You are a QA engineer performing exploratory testing. Analyse this screenshot carefully.',
        url, action, area,
        '',
        'Identify ANY of the following defects visible in the screenshot:',
        '1. Layout/UI: broken layout, overlapping elements, truncated text, wrong colours, missing icons',
        '2. Functional: error messages, broken links, incorrect data displayed, missing content',
        '3. Accessibility: missing alt text, low contrast, unlabelled form fields',
        '4. UX: confusing UI, missing loading states, no empty-state message when list is empty',
        '5. Data: unexpected values, NaN, undefined, [object Object], or raw HTML shown to users',
        '',
        'Respond in this JSON format:',
        '{',
        '  "anomalies_found": true | false,',
        '  "severity": "critical" | "major" | "minor" | "none",',
        '  "findings": [',
        '    { "type": "layout|functional|accessibility|ux|data", "description": "...", "location": "..." }',
        '  ],',
        '  "suggested_next_action": "..."',
        '}',
        '',
        'If no anomalies are found respond with anomalies_found: false and empty findings array.',
        '',
        `Screenshot (base64): ${screenshotBase64.slice(0, 50)}... [truncated for prompt, full image attached]`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// mapActionToExecutableSteps
// ---------------------------------------------------------------------------
//
// For each SFDPOT heuristic action, returns the workspace_* actions that can
// be dispatched automatically, or an empty steps array with a skip reason for
// actions that require environment setup (multi-browser, clock manipulation, etc.).
//
// Automation levels:
//   navigate_screenshot — navigate to appUrl then capture a screenshot
//   screenshot_only     — capture a screenshot of current state
//   skip                — cannot be automated; needs manual setup

export type ExecutableStep = {
    actionType: string;
    payload: Record<string, unknown>;
};

type ActionAutomation =
    | { mode: 'navigate_screenshot' }
    | { mode: 'screenshot_only' }
    | { mode: 'skip'; reason: string }
    | { mode: 'dispatch'; actionType: string; extraPayload?: Record<string, unknown> };

// Keyed on the exact description strings from SFDPOT_ACTIONS above
const SFDPOT_ACTION_AUTOMATION: Record<string, ActionAutomation> = {
    // structure
    'Verify every nav link resolves without 404': { mode: 'navigate_screenshot' },
    'Check all form fields render with correct input types': { mode: 'screenshot_only' },
    'Validate page hierarchy: breadcrumbs, headings, landmarks': { mode: 'screenshot_only' },
    'Confirm responsive layout at 375px, 768px, 1280px, 1920px': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { viewports: [375, 768, 1280, 1920] } },
    'Check focus order is logical (Tab traversal)': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { keyboard_nav: true } },
    // function
    'Submit each form with valid data — assert success state': { mode: 'navigate_screenshot' },
    'Submit each form with missing required fields — assert inline errors': { mode: 'navigate_screenshot' },
    'Test every CTA button triggers expected outcome': { mode: 'screenshot_only' },
    'Verify search returns relevant results and handles empty query': { mode: 'navigate_screenshot' },
    'Confirm pagination / infinite scroll loads more items': { mode: 'navigate_screenshot' },
    // data
    'Enter max-length input (boundary value) in every text field': { mode: 'screenshot_only' },
    'Enter 0 and negative numbers in numeric fields': { mode: 'screenshot_only' },
    'Paste special characters and SQL-like strings': { mode: 'screenshot_only' },
    'Upload oversized file where file input exists': { mode: 'skip', reason: 'File upload requires specific form selector — use workspace_web_fill' },
    'Check empty-state UI when list has no records': { mode: 'navigate_screenshot' },
    // platform — mostly require environment setup
    'Test on Chrome, Firefox, and Edge': { mode: 'skip', reason: 'Multi-browser testing requires a separate browser environment setup outside this action type' },
    'Verify on iOS Safari (mobile viewport emulation)': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { device: 'iPhone 12' } },
    'Check with keyboard-only navigation (no mouse)': { mode: 'dispatch', actionType: 'workspace_axe_scan', extraPayload: { rules: ['keyboard'], min_impact: 'moderate' } },
    'Test with screen reader role announcements (axe scan)': { mode: 'dispatch', actionType: 'workspace_axe_scan', extraPayload: {} },
    'Verify colours pass WCAG AA contrast ratio': { mode: 'dispatch', actionType: 'workspace_axe_scan', extraPayload: { rules: ['color-contrast'], min_impact: 'moderate' } },
    // operations
    'Slow network throttle (Slow 3G) — check loading states': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { cdp_throttle: 'slow3g' } },
    'Disable JavaScript — assert graceful degradation': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { javascript_disabled: true } },
    'Interrupt a multi-step form mid-way — verify no data loss': { mode: 'navigate_screenshot' },
    'Trigger concurrent requests (double-click submit) — assert no duplicate actions': { mode: 'skip', reason: 'Concurrent requests require simultaneous execution outside this action type' },
    'Session timeout — assert redirect to login without data loss': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { session_expire: true } },
    // time — use Playwright clock.install() / page.clock.setFixedTime() for date mocking
    'Set system clock to year-end boundary (Dec 31) and verify date pickers': { mode: 'skip', reason: 'clock manipulation requires host-level system access; use workspace_playwright_test_run with fake_date payload instead' },
    'Check "expires in X days" countdown accuracy': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { fake_date: '2024-12-29' } },
    'Verify timestamps display in the correct timezone': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { fake_timezone: 'America/New_York' } },
    'Test with DST-transition datetime values': { mode: 'dispatch', actionType: 'workspace_playwright_test_run', extraPayload: { fake_date: '2024-11-03' } },
};

export function mapActionToExecutableSteps(
    action: ExplorationAction,
    appUrl: string,
): { steps: ExecutableStep[]; skipReason?: string } {
    const meta = SFDPOT_ACTION_AUTOMATION[action.description]
        ?? { mode: 'skip' as const, reason: `No automation mapping for: "${action.description}"` };

    if (meta.mode === 'skip') {
        return { steps: [], skipReason: meta.reason };
    }

    if (meta.mode === 'dispatch') {
        const dispatchPayload: Record<string, unknown> = { ...(meta.extraPayload ?? {}) };
        if (appUrl) dispatchPayload['url'] = appUrl;
        return { steps: [{ actionType: meta.actionType, payload: dispatchPayload }] };
    }

    const snapshotName = `explore-${action.dimension}-${Date.now()}`;
    const steps: ExecutableStep[] = [];

    if (meta.mode === 'navigate_screenshot' && appUrl) {
        steps.push({ actionType: 'workspace_web_navigate', payload: { url: appUrl } });
    }
    steps.push({ actionType: 'workspace_screenshot', payload: { name: snapshotName } });

    return { steps };
}

// ---------------------------------------------------------------------------
// buildExplorationSessionLog — for episodic memory write
// ---------------------------------------------------------------------------

export function buildExplorationSessionLog(
    charter: ExplorationCharter,
    findings: Array<{ type: string; description: string; severity: string }>,
): { pattern: string; summary: string } {
    const passed = charter.actions.filter((a) => a.status === 'passed').length;
    const failed = charter.actions.filter((a) => a.status === 'failed').length;
    const total = charter.actions.length;
    const critical = findings.filter((f) => f.severity === 'critical').length;
    const major = findings.filter((f) => f.severity === 'major').length;

    const pattern = critical > 0
        ? `tester:exploratory:critical_findings`
        : major > 0
            ? `tester:exploratory:major_findings`
            : failed === 0
                ? `tester:exploratory:clean`
                : `tester:exploratory:minor_findings`;

    const summary = [
        `Exploratory session on "${charter.area}" (SFDPOT: ${charter.dimensions.join(', ')}).`,
        `Checked ${total} heuristic actions — ${passed} passed, ${failed} failed.`,
        findings.length > 0
            ? `${findings.length} anomaly(ies) found: ${critical} critical, ${major} major. ` +
            `Top finding: ${findings[0]?.description ?? 'n/a'}.`
            : 'No anomalies found.',
    ].join(' ');

    return { pattern, summary };
}
