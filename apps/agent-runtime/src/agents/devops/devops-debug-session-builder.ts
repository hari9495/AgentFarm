// ============================================================================
// DEVOPS DEBUG SESSION BUILDER
//
// Accepts an array of DebugCommand objects, resolves each to CLI argv, and
// supports sequential execution via runCommand.  Used by the
// workspace_devops_debug_session action.
//
// Key design points:
//   • Commands may be specified as raw argv, a shell string, a kubectl-exec
//     shorthand, or a docker-exec shorthand.
//   • The executor in the action handler calls resolveCommandArgv() to turn a
//     DebugCommand into a string[] before passing it to runCommand.
//   • stdout is capped at 4 000 chars per command; stderr at 1 000.
//   • Optional abort_on_failure stops the session on the first non-zero exit.
//   • Optional LLM synthesis via buildDebugSessionAnalysisPrompt.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single command to run inside a debug session. */
export interface DebugCommand {
    /** Stable identifier used to reference this step in reports. */
    id?:    string;
    /** Human-friendly label shown in the report. */
    label?: string;

    // ── Command specification — exactly one should be set ──────────────────

    /** Pre-split argument vector, e.g. ["kubectl","get","pods","-n","default"]. */
    argv?: string[];

    /**
     * Raw shell command string split naively on whitespace.
     * Use `argv` when arguments contain spaces.
     */
    shell?: string;

    /** kubectl-exec shorthand. */
    kubectl_exec?: {
        pod:        string;
        namespace?: string;
        container?: string;
        /** The command to run inside the container, e.g. ["sh","-c","df -h"]. */
        command:    string[];
    };

    /** docker-exec shorthand. */
    docker_exec?: {
        container: string;
        command:   string[];
    };

    /** Maximum time in milliseconds to wait for this command. */
    timeout_ms?: number;

    /**
     * When true the executor passes the previous command's stdout as an
     * environment variable PREV_OUTPUT.  Not used by the builder — purely
     * informational for the action-handler logic.
     */
    capture_previous?: boolean;
}

/** Result of executing a single DebugCommand. */
export interface DebugCommandResult {
    id?:        string;
    label?:     string;
    argv:       string[];
    exitCode:   number;
    stdout:     string;
    stderr:     string;
    durationMs: number;
    ok:         boolean;
    /** True when stdout was cut at the 4 000-char limit. */
    truncated:  boolean;
}

/** Aggregated result of an entire debug session. */
export interface DebugSessionResult {
    totalCommands: number;
    executed:      number;
    succeeded:     number;
    failed:        number;
    /** ID of the first step that triggered an abort-on-failure halt. */
    abortedAt?:    string;
    results:       DebugCommandResult[];
    /** Optional LLM-generated root-cause analysis. */
    summary?:      string;
}

// ---------------------------------------------------------------------------
// Command resolution
// ---------------------------------------------------------------------------

/**
 * Converts a DebugCommand into a flat CLI argument vector.
 * Returns an empty array if no command specification is found.
 */
export function resolveCommandArgv(cmd: DebugCommand): string[] {
    if (cmd.argv && cmd.argv.length > 0) {
        return cmd.argv;
    }

    if (cmd.kubectl_exec) {
        const ke   = cmd.kubectl_exec;
        const args = ['kubectl', 'exec'];
        if (ke.namespace) { args.push('-n', ke.namespace); }
        args.push(ke.pod);
        if (ke.container) { args.push('-c', ke.container); }
        args.push('--', ...ke.command);
        return args;
    }

    if (cmd.docker_exec) {
        const de = cmd.docker_exec;
        return ['docker', 'exec', de.container, ...de.command];
    }

    if (cmd.shell) {
        // Naive whitespace split — callers should prefer `argv` for arguments
        // that contain spaces.
        return cmd.shell.trim().split(/\s+/).filter(Boolean);
    }

    return [];
}

/**
 * Parses a raw JSON/plain-text commands definition into a DebugCommand[].
 * Accepts:
 *   • A JSON array of DebugCommand objects.
 *   • A newline-separated list of shell strings (each line becomes a command
 *     with `shell` set).
 */
export function parseCommandsInput(raw: unknown): DebugCommand[] {
    if (Array.isArray(raw)) {
        return raw.filter((x) => x && typeof x === 'object') as DebugCommand[];
    }
    if (typeof raw === 'string') {
        // Try JSON first.
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter((x) => x && typeof x === 'object') as DebugCommand[];
            }
        } catch {
            // Fall through to line-by-line parsing.
        }
        return raw
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((shell, i) => ({ id: `cmd_${i + 1}`, label: shell.slice(0, 60), shell }));
    }
    return [];
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

/**
 * Builds a prompt for the LLM to analyse the debug session outputs and
 * identify root cause / next steps.
 */
export function buildDebugSessionAnalysisPrompt(
    results:  DebugCommandResult[],
    context?: string,
): string {
    const lines: string[] = [];
    lines.push('# Debug Session Analysis Request');
    if (context) {
        lines.push('');
        lines.push(`**Incident context:** ${context}`);
    }
    lines.push('');
    lines.push('## Command Results');

    for (let i = 0; i < results.length; i++) {
        const r     = results[i];
        const label = r.label ?? r.id ?? `Command ${i + 1}`;
        lines.push('');
        lines.push(`### ${label}`);
        lines.push(`- **argv:** \`${r.argv.join(' ').slice(0, 200)}\``);
        lines.push(`- **Exit Code:** ${r.exitCode} | **Duration:** ${r.durationMs} ms | **Status:** ${r.ok ? 'OK' : 'FAILED'}`);
        if (r.stdout) {
            lines.push('- **Stdout:**');
            lines.push('```');
            lines.push(r.stdout.slice(0, 2000) + (r.truncated ? '\n... [truncated]' : ''));
            lines.push('```');
        }
        if (r.stderr) {
            lines.push('- **Stderr:**');
            lines.push('```');
            lines.push(r.stderr.slice(0, 1000));
            lines.push('```');
        }
    }

    lines.push('');
    lines.push('## Your Task');
    lines.push('Analyse the above debug outputs and provide:');
    lines.push('1. **Root cause** — one or two sentences.');
    lines.push('2. **Next steps** — bullet list of actionable items.');
    lines.push('3. **Confidence** — high / medium / low.');
    lines.push('');
    lines.push('Format:');
    lines.push('Root cause: <text>');
    lines.push('Next steps:');
    lines.push('- <step 1>');
    lines.push('- <step 2>');
    lines.push('Confidence: <high|medium|low>');

    return lines.join('\n');
}

export interface DebugSessionAnalysis {
    rootCause:  string;
    nextSteps:  string[];
    confidence: 'high' | 'medium' | 'low';
}

/** Parses the LLM response from buildDebugSessionAnalysisPrompt. */
export function parseDebugSessionAnalysis(raw: string): DebugSessionAnalysis {
    const rootCauseMatch = raw.match(/root\s*cause[:\s]+([^\n]+)/i);
    const rootCause      = rootCauseMatch?.[1]?.trim() ?? raw.slice(0, 200).trim();

    const nextStepsMatch = raw.match(/next\s*steps?[:\s]+([\s\S]+?)(?:\nconfidence|$)/i);
    const nextSteps: string[] = nextStepsMatch
        ? nextStepsMatch[1]
              .split('\n')
              .map((l) => l.replace(/^[-•*\d.]+\s*/, '').trim())
              .filter(Boolean)
        : [];

    const confMatch = raw.match(/confidence[:\s]+(high|medium|low)/i);
    const confidence = (confMatch?.[1]?.toLowerCase() ?? 'medium') as DebugSessionAnalysis['confidence'];

    return { rootCause, nextSteps, confidence };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Formats a DebugSessionResult into a human-readable markdown string. */
export function formatDebugSessionReport(session: DebugSessionResult): string {
    const lines: string[] = [];
    lines.push('# Debug Session Report');
    lines.push('');
    lines.push(
        `| Total | Executed | Succeeded | Failed |`,
    );
    lines.push(`|-------|----------|-----------|--------|`);
    lines.push(
        `| ${session.totalCommands} | ${session.executed} | ${session.succeeded} | ${session.failed} |`,
    );

    if (session.abortedAt) {
        lines.push('');
        lines.push(`> ⚠ Session aborted at step **${session.abortedAt}** (abort_on_failure=true)`);
    }

    if (session.summary) {
        lines.push('');
        lines.push('## LLM Analysis');
        lines.push(session.summary);
    }

    lines.push('');
    lines.push('## Step Results');
    for (const r of session.results) {
        const label = r.label ?? r.id ?? r.argv.join(' ').slice(0, 60);
        const icon  = r.ok ? '✓' : '✗';
        lines.push(`\n${icon} **${label}** (exit=${r.exitCode}, ${r.durationMs}ms)`);
        if (!r.ok && r.stderr) {
            lines.push(`   ↳ \`${r.stderr.slice(0, 300)}\``);
        }
    }

    return lines.join('\n');
}
