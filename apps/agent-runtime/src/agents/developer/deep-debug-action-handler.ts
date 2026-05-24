// ============================================================================
// DEEP DEBUG ACTION HANDLER — Gap: Debugging Subtle Bugs
//
// Gives the Developer agent tools that go beyond standard debuggers —
// covering race conditions, memory corruption, and log correlation that
// require specialised sanitizers and runtime analysis.
//
// Actions:
//   workspace_dev_race_detect       — ThreadSanitizer / data-race detection
//   workspace_dev_memory_sanitize   — AddressSanitizer / Valgrind
//   workspace_dev_gdb_session       — GDB/LLDB live session via SSH
//   workspace_dev_log_correlate     — timestamp-correlation across log files
//                                     to surface ordering/locking bugs
//
// Architecture:
//   All I/O via runCommand / executeAction.
//   Pure builders produce CLI invocations; handler runs and analyses them.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeepDebugActionType =
    | 'workspace_dev_race_detect'
    | 'workspace_dev_memory_sanitize'
    | 'workspace_dev_gdb_session'
    | 'workspace_dev_log_correlate';

export const DEEP_DEBUG_ACTION_TYPES = new Set<DeepDebugActionType>([
    'workspace_dev_race_detect',
    'workspace_dev_memory_sanitize',
    'workspace_dev_gdb_session',
    'workspace_dev_log_correlate',
]);

export function isDeepDebugActionType(at: string): at is DeepDebugActionType {
    return DEEP_DEBUG_ACTION_TYPES.has(at as DeepDebugActionType);
}

export type DeepDebugActionResult = {
    ok:           boolean;
    output:       string;
    errorOutput?: string;
    [key: string]: unknown;
};

type RunCommandFn = (args: string[], cwd: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
type ExecuteActionFn = (at: string, p: Record<string, unknown>) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;
type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface DeepDebugActionParams {
    actionType:    DeepDebugActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    runCommand?:   RunCommandFn;
    callLlm?:      LlmCallFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v.trim() : fallback; }
function safeJson(obj: Record<string, unknown>): DeepDebugActionResult { return { ok: true, output: JSON.stringify(obj) }; }

async function run(rc: RunCommandFn, args: string[], cwd: string, ms = 300_000) {
    const r = await rc(args, cwd, ms);
    return { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr };
}

async function callLlmSafe(fn: LlmCallFn | undefined, prompt: string, sys?: string): Promise<string> {
    if (!fn) return '';
    try { return await fn(prompt, sys); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Race detection builders
// ---------------------------------------------------------------------------

export type Language = 'go' | 'rust' | 'c' | 'cpp' | 'java' | 'node' | 'unknown';

export function detectLanguage(workspaceDir: string, files: string[]): Language {
    const joined = files.join(' ').toLowerCase() + workspaceDir.toLowerCase();
    if (joined.includes('go.mod') || joined.includes('.go'))          return 'go';
    if (joined.includes('cargo.toml') || joined.includes('.rs'))      return 'rust';
    if (joined.includes('cmakelists') || joined.includes('.cpp'))     return 'cpp';
    if (joined.includes('cmakelists') || joined.includes('.c'))       return 'c';
    if (joined.includes('pom.xml')   || joined.includes('.java'))     return 'java';
    if (joined.includes('package.json'))                               return 'node';
    return 'unknown';
}

export function buildRaceDetectCmd(lang: Language, testCmd: string): string[] | null {
    switch (lang) {
        case 'go':    return ['go', 'test', '-race', '-count=1', '-timeout=120s', './...'];
        case 'rust':  return ['cargo', 'test', '--', '--test-threads=8'];  // ThreadSanitizer via RUSTFLAGS
        case 'c':
        case 'cpp':   return testCmd ? testCmd.split(' ') : null;   // caller should add -fsanitize=thread
        case 'java':  return ['mvn', 'test', '-Djava.security.manager=allow'];
        case 'node':  return ['node', '--expose-gc', '--', ...testCmd.split(' ')];
        default:      return null;
    }
}

export function buildRaceDetectEnv(lang: Language): Record<string, string> {
    switch (lang) {
        case 'rust': return { RUSTFLAGS: '-Z sanitizer=thread', RUST_BACKTRACE: '1' };
        case 'c':
        case 'cpp':  return { CFLAGS: '-fsanitize=thread -g -O1', LDFLAGS: '-fsanitize=thread' };
        case 'go':   return { GORACE: 'halt_on_error=0 history_size=3' };
        default:     return {};
    }
}

export function parseRaceReport(output: string): Array<{
    goroutine?: string; location: string; message: string; severity: 'critical' | 'warning';
}> {
    const findings: Array<{ location: string; message: string; severity: 'critical' | 'warning' }> = [];
    // Go TSan format: "DATA RACE" header lines
    const goRacePattern = /DATA RACE[\s\S]*?(?=DATA RACE|==================|$)/gm;
    for (const match of output.matchAll(goRacePattern)) {
        const block = match[0];
        const loc   = /goroutine \d+.*?(\w+\.go:\d+)/.exec(block)?.[1] ?? 'unknown';
        findings.push({ location: loc, message: block.slice(0, 300).trim(), severity: 'critical' });
    }
    // Generic TSan: "WARNING: ThreadSanitizer"
    const tsanPattern = /WARNING: ThreadSanitizer[^\n]*/g;
    for (const match of output.matchAll(tsanPattern)) {
        findings.push({ location: 'TSan', message: match[0], severity: 'warning' });
    }
    return findings;
}

// ---------------------------------------------------------------------------
// Memory sanitizer builders
// ---------------------------------------------------------------------------

export function buildMemSanitizeCmd(lang: Language, testCmd: string): { cmd: string[]; env: Record<string, string> } {
    switch (lang) {
        case 'go':
            return { cmd: ['go', 'test', '-msan', '-count=1', './...'], env: { CGO_ENABLED: '1' } };
        case 'rust':
            return {
                cmd: ['cargo', 'test'],
                env: { RUSTFLAGS: '-Z sanitizer=address', RUST_BACKTRACE: '1' },
            };
        case 'c':
        case 'cpp': {
            const baseCmd = testCmd ? testCmd.split(' ') : ['./a.out'];
            return {
                cmd: baseCmd,
                env: { ASAN_OPTIONS: 'detect_leaks=1:abort_on_error=0:symbolize=1' },
            };
        }
        default:
            return {
                cmd: ['valgrind', '--leak-check=full', '--error-exitcode=1', ...(testCmd ? testCmd.split(' ') : ['./a.out'])],
                env: {},
            };
    }
}

export function parseMemReport(output: string): Array<{
    type: string; location: string; bytes?: number; message: string;
}> {
    const findings: Array<{ type: string; location: string; bytes?: number; message: string }> = [];
    // AddressSanitizer
    for (const match of output.matchAll(/ERROR: AddressSanitizer: (\S+)[^\n]*/g)) {
        findings.push({ type: match[1]!, location: 'ASan', message: match[0] });
    }
    // Valgrind
    for (const match of output.matchAll(/==\d+== (\d+) bytes in .* blocks are (definitely|indirectly|possibly) lost/g)) {
        findings.push({ type: 'memory_leak', bytes: Number(match[1]), location: 'Valgrind', message: match[0] });
    }
    // Go race
    for (const match of output.matchAll(/unexpected fault address/g)) {
        findings.push({ type: 'nil_dereference', location: 'Go', message: match[0] });
    }
    return findings;
}

// ---------------------------------------------------------------------------
// GDB/LLDB session builders
// ---------------------------------------------------------------------------

export function buildGdbScript(commands: string[]): string {
    return [
        'set pagination off',
        'set print pretty on',
        ...commands,
        'quit',
    ].join('\n');
}

export interface GdbCommand {
    cmd:         string;
    description: string;
}

export function getDefaultGdbCommands(mode: 'backtrace' | 'threads' | 'memory' | 'custom'): GdbCommand[] {
    switch (mode) {
        case 'backtrace':
            return [
                { cmd: 'backtrace full', description: 'Full stack trace' },
                { cmd: 'info locals',    description: 'Local variables' },
                { cmd: 'info args',      description: 'Function arguments' },
            ];
        case 'threads':
            return [
                { cmd: 'info threads',          description: 'All thread states' },
                { cmd: 'thread apply all bt',   description: 'Backtrace all threads' },
                { cmd: 'thread apply all info locals', description: 'Locals across threads' },
            ];
        case 'memory':
            return [
                { cmd: 'info proc mappings', description: 'Memory map' },
                { cmd: 'info proc status',   description: 'Process memory stats' },
            ];
        case 'custom':
        default:
            return [];
    }
}

// ---------------------------------------------------------------------------
// Log correlation builders
// ---------------------------------------------------------------------------

export interface LogEvent {
    timestamp: number;   // Unix ms
    thread?:   string;
    level:     string;
    message:   string;
    file?:     string;
}

const TS_PATTERNS = [
    /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)/,
    /(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/,
    /\[(\d{13,})\]/,    // Unix ms
];

export function parseLogLine(line: string): LogEvent | null {
    let ts = 0;
    for (const p of TS_PATTERNS) {
        const m = p.exec(line);
        if (m) { ts = new Date(m[1]!).getTime() || Number(m[1]); break; }
    }
    if (!ts) return null;

    const threadMatch = /\[(?:Thread|thread|goroutine|tid|TID)[:\s#]*(\w+)\]/.exec(line);
    const levelMatch  = /\b(ERROR|WARN|INFO|DEBUG|FATAL|CRITICAL)\b/i.exec(line);
    return {
        timestamp: ts,
        thread:    threadMatch?.[1],
        level:     levelMatch?.[1]?.toUpperCase() ?? 'INFO',
        message:   line.replace(/^.*?(ERROR|WARN|INFO|DEBUG)[\s:]*/i, '').slice(0, 200),
    };
}

export function correlateLogEvents(events: LogEvent[], windowMs = 50): Array<{
    timeMs:   number;
    cluster:  LogEvent[];
    suspicion: 'race_condition' | 'deadlock' | 'ordering_violation' | 'none';
    reason:   string;
}> {
    if (events.length === 0) return [];
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const clusters: typeof sorted[] = [];
    let current: typeof sorted = [sorted[0]!];

    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]!.timestamp - sorted[i - 1]!.timestamp <= windowMs) {
            current.push(sorted[i]!);
        } else {
            if (current.length > 1) clusters.push(current);
            current = [sorted[i]!];
        }
    }
    if (current.length > 1) clusters.push(current);

    return clusters.map((cluster) => {
        const threads = new Set(cluster.map((e) => e.thread).filter(Boolean));
        const msgs    = cluster.map((e) => e.message.toLowerCase()).join(' ');

        let suspicion: 'race_condition' | 'deadlock' | 'ordering_violation' | 'none' = 'none';
        let reason = '';

        if (threads.size > 1 && (msgs.includes('lock') || msgs.includes('mutex') || msgs.includes('write') || msgs.includes('read'))) {
            suspicion = 'race_condition';
            reason    = `${threads.size} threads accessing shared resource within ${windowMs}ms`;
        } else if (msgs.includes('deadlock') || msgs.includes('waiting') || msgs.includes('timeout')) {
            suspicion = 'deadlock';
            reason    = 'Waiting/deadlock pattern detected';
        } else if (threads.size > 1) {
            suspicion = 'ordering_violation';
            reason    = `${threads.size} threads within ${windowMs}ms — possible ordering issue`;
        }

        return { timeMs: cluster[0]!.timestamp, cluster, suspicion, reason };
    });
}

export function buildLogCorrelatePrompt(correlations: ReturnType<typeof correlateLogEvents>, logSample: string): string {
    const suspicious = correlations.filter((c) => c.suspicion !== 'none');
    return [
        `You are a senior backend engineer debugging concurrency issues.`,
        ``,
        `Log sample (first 2000 chars):`,
        logSample.slice(0, 2000),
        ``,
        `Suspicious concurrent events found: ${suspicious.length}`,
        ...suspicious.slice(0, 5).map((c, i) =>
            `  ${i + 1}. [${c.suspicion}] at t=${c.timeMs} — ${c.reason}\n` +
            `     Events: ${c.cluster.map((e) => e.message).slice(0, 3).join(' | ')}`
        ),
        ``,
        `Identify the most likely root cause and suggest a concrete fix.`,
        `Return JSON: { "root_cause": string, "fix": string, "affected_threads": string[], "confidence": "high"|"medium"|"low" }`,
        `Valid JSON only.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleDeepDebugAction(
    params: DeepDebugActionParams,
): Promise<DeepDebugActionResult> {
    const { actionType, payload, workspaceDir, executeAction, runCommand, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_dev_race_detect
        // Runs a race-condition detector appropriate for the project language.
        //
        // payload:
        //   language?   — go | rust | c | cpp | java | node (auto-detect if omitted)
        //   test_cmd?   — custom test invocation (C/C++ only)
        //   timeout_ms? — test timeout (default: 180000)
        // ====================================================================
        case 'workspace_dev_race_detect': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'workspace_dev_race_detect: runCommand not available' };

            const langRaw  = str(payload['language']);
            const testCmd  = str(payload['test_cmd']);
            const timeout  = typeof payload['timeout_ms'] === 'number' ? payload['timeout_ms'] : 180_000;

            // Auto-detect language from workspace
            const listRes  = await executeAction('workspace_list_files', { path: workspaceDir, pattern: '*.{mod,toml,json,xml}' });
            const files    = listRes.ok ? listRes.output.split('\n') : [];
            const lang     = (langRaw as Language) || detectLanguage(workspaceDir, files);

            const cmd = buildRaceDetectCmd(lang, testCmd);
            if (!cmd) {
                return { ok: false, output: '', errorOutput: `workspace_dev_race_detect: unsupported language "${lang}"` };
            }

            const env = buildRaceDetectEnv(lang);
            // Inject env into command prefix where needed (GORACE etc.)
            const envPrefix = Object.entries(env).map(([k, v]) => `${k}="${v}"`).join(' ');
            const fullCmd   = envPrefix ? ['sh', '-c', `${envPrefix} ${cmd.join(' ')}`] : cmd;

            const r       = await run(runCommand, fullCmd, workspaceDir, timeout);
            const combined = r.stdout + '\n' + r.stderr;
            const races   = parseRaceReport(combined);

            // LLM analysis of race findings
            let analysis = '';
            if (callLlm && races.length > 0) {
                const prompt = [
                    `You are debugging race conditions. ${races.length} data race(s) detected.`,
                    `Language: ${lang}`,
                    ``,
                    ...races.slice(0, 3).map((race, i) => `Race ${i + 1}: ${race.message.slice(0, 400)}`),
                    ``,
                    `For each race: identify the shared variable, explain why the access is unsafe, and provide a concrete fix (mutex, channel, atomic, etc.).`,
                    `Return JSON: { "races": [{ "description": string, "shared_variable": string, "fix": string }], "summary": string }`,
                ].join('\n');
                analysis = await callLlmSafe(callLlm, prompt, 'You are a concurrency expert. Be specific and code-accurate.');
            }

            return safeJson({
                language:     lang,
                race_count:   races.length,
                races:        races.slice(0, 10),
                analysis,
                exit_code:    r.ok ? 0 : 1,
                clean:        races.length === 0 && r.ok,
                summary: races.length === 0
                    ? `Race detector: no data races found (${lang})`
                    : `Race detector: ${races.length} data race(s) found in ${lang} — LLM analysis included`,
            });
        }

        // ====================================================================
        // workspace_dev_memory_sanitize
        // Runs AddressSanitizer or Valgrind to detect memory corruption,
        // use-after-free, and leaks.
        //
        // payload:
        //   language?   — go | rust | c | cpp | java (auto-detect)
        //   test_cmd?   — custom test invocation
        //   tool?       — asan | valgrind (default: asan)
        //   timeout_ms? — default 300000
        // ====================================================================
        case 'workspace_dev_memory_sanitize': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'workspace_dev_memory_sanitize: runCommand not available' };

            const langRaw  = str(payload['language']);
            const testCmd  = str(payload['test_cmd']);
            const timeout  = typeof payload['timeout_ms'] === 'number' ? payload['timeout_ms'] : 300_000;

            const listRes  = await executeAction('workspace_list_files', { path: workspaceDir, pattern: '*.{mod,toml,json,xml}' });
            const files    = listRes.ok ? listRes.output.split('\n') : [];
            const lang     = (langRaw as Language) || detectLanguage(workspaceDir, files);

            const { cmd, env } = buildMemSanitizeCmd(lang, testCmd);
            const envPrefix    = Object.entries(env).map(([k, v]) => `${k}="${v}"`).join(' ');
            const fullCmd      = envPrefix ? ['sh', '-c', `${envPrefix} ${cmd.join(' ')}`] : cmd;

            const r       = await run(runCommand, fullCmd, workspaceDir, timeout);
            const combined = r.stdout + '\n' + r.stderr;
            const findings = parseMemReport(combined);

            let analysis = '';
            if (callLlm && (findings.length > 0 || !r.ok)) {
                const prompt = [
                    `You are debugging memory issues. Language: ${lang}`,
                    findings.length > 0
                        ? `Findings:\n${findings.slice(0, 5).map((f) => `  [${f.type}] ${f.message}`).join('\n')}`
                        : `Output suggests an issue:\n${combined.slice(0, 1000)}`,
                    ``,
                    `Identify the root cause and provide a concrete fix.`,
                    `Return JSON: { "issues": [{ "type": string, "location": string, "fix": string }], "summary": string }`,
                ].join('\n');
                analysis = await callLlmSafe(callLlm, prompt, 'You are a memory safety expert. Be specific.');
            }

            return safeJson({
                language:      lang,
                finding_count: findings.length,
                findings:      findings.slice(0, 10),
                analysis,
                clean:         findings.length === 0 && r.ok,
                summary: findings.length === 0 && r.ok
                    ? `Memory sanitizer: no issues found (${lang})`
                    : `Memory sanitizer: ${findings.length} issue(s) in ${lang}`,
            });
        }

        // ====================================================================
        // workspace_dev_gdb_session
        // Runs GDB or LLDB against a process (local binary or remote via SSH)
        // and returns structured output from the debug session.
        //
        // payload:
        //   binary?      — path to binary or "remote" for SSH
        //   host?        — remote host for SSH (required if binary=remote)
        //   user?        — SSH user
        //   pid?         — PID to attach to
        //   core_file?   — core dump file path
        //   mode?        — backtrace | threads | memory | custom (default: threads)
        //   commands?    — string[] of GDB commands (mode=custom)
        //   debugger?    — gdb | lldb (default: gdb)
        // ====================================================================
        case 'workspace_dev_gdb_session': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'workspace_dev_gdb_session: runCommand not available' };

            const binary    = str(payload['binary']);
            const host      = str(payload['host']);
            const user      = str(payload['user']);
            const pid       = typeof payload['pid'] === 'number' ? payload['pid'] : null;
            const coreFile  = str(payload['core_file']);
            const mode      = str(payload['mode'], 'threads') as 'backtrace' | 'threads' | 'memory' | 'custom';
            const customCmds = Array.isArray(payload['commands']) ? (payload['commands'] as string[]) : [];
            const debugger_ = str(payload['debugger'], 'gdb');

            const gdbCmds = mode === 'custom'
                ? customCmds.map((c) => ({ cmd: c, description: c }))
                : getDefaultGdbCommands(mode);

            const scriptContent = buildGdbScript(gdbCmds.map((c) => c.cmd));
            const scriptFile    = '.agentfarm/gdb-session.gdb';
            await executeAction('workspace_write_file', { file_path: scriptFile, content: scriptContent });

            let gdbArgs: string[];
            if (host && user) {
                // Remote via SSH
                const remoteGdbCmd = pid
                    ? `${debugger_} -batch -x ${scriptFile} -p ${pid}`
                    : `${debugger_} -batch -x ${scriptFile} ${binary || ''}`;
                gdbArgs = ['ssh', '-o', 'StrictHostKeyChecking=no', `${user}@${host}`, remoteGdbCmd];
            } else if (pid) {
                gdbArgs = [debugger_, '-batch', '-x', scriptFile, '-p', String(pid)];
            } else if (coreFile) {
                gdbArgs = [debugger_, '-batch', '-x', scriptFile, binary || '', coreFile];
            } else {
                gdbArgs = [debugger_, '-batch', '-x', scriptFile, binary || ''];
            }

            const r = await run(runCommand, gdbArgs, workspaceDir, 120_000);
            const combined = r.stdout + r.stderr;

            let analysis = '';
            if (callLlm && combined.length > 50) {
                const prompt = [
                    `You are a senior debugger analysing GDB/LLDB output.`,
                    `Mode: ${mode}`,
                    ``,
                    combined.slice(0, 3000),
                    ``,
                    `Identify the most important finding and suggest what to investigate next.`,
                    `Return JSON: { "finding": string, "next_steps": string[], "severity": "critical"|"high"|"medium" }`,
                ].join('\n');
                analysis = await callLlmSafe(callLlm, prompt, 'You are a debugging expert. Be specific and actionable.');
            }

            return safeJson({
                debugger: debugger_,
                mode,
                remote:   !!(host && user),
                raw_output: combined.slice(0, 4000),
                analysis,
                summary: `GDB session (${mode}): ${combined.split('\n').length} lines of output`,
            });
        }

        // ====================================================================
        // workspace_dev_log_correlate
        // Reads one or more log files and correlates events within a time
        // window to surface race conditions, deadlocks, and ordering bugs.
        //
        // payload:
        //   log_files     — string[] of log file paths (required)
        //   window_ms?    — correlation window in ms (default: 50)
        //   context?      — what bug is being investigated
        // ====================================================================
        case 'workspace_dev_log_correlate': {
            const logFiles = Array.isArray(payload['log_files']) ? (payload['log_files'] as string[]) : [];
            const windowMs = typeof payload['window_ms'] === 'number' ? payload['window_ms'] : 50;
            const context  = str(payload['context']);

            if (logFiles.length === 0) {
                return { ok: false, output: '', errorOutput: 'workspace_dev_log_correlate: log_files array required' };
            }

            // Read and parse all log files
            const allEvents: LogEvent[] = [];
            let logSample = '';
            for (const filePath of logFiles.slice(0, 5)) {
                const readRes = await executeAction('workspace_read_file', { file_path: filePath });
                if (!readRes.ok) continue;
                const content = readRes.output;
                if (!logSample) logSample = content.slice(0, 2000);
                for (const line of content.split('\n')) {
                    const event = parseLogLine(line);
                    if (event) allEvents.push(event);
                }
            }

            const correlations = correlateLogEvents(allEvents, windowMs);
            const suspicious   = correlations.filter((c) => c.suspicion !== 'none');

            let analysis = '';
            if (callLlm) {
                const prompt = buildLogCorrelatePrompt(correlations, logSample);
                analysis     = await callLlmSafe(callLlm, prompt, 'You are a concurrency debugging expert. Be specific and actionable.');
            }

            // Save correlation report
            const report = {
                files:          logFiles,
                total_events:   allEvents.length,
                window_ms:      windowMs,
                clusters:       correlations.length,
                suspicious:     suspicious.length,
                top_suspicious: suspicious.slice(0, 10),
                analysis,
            };
            await executeAction('workspace_write_file', {
                file_path: '.agentfarm/log-correlation-report.json',
                content:   JSON.stringify(report, null, 2),
            });

            return safeJson({
                files_read:        logFiles.length,
                events_parsed:     allEvents.length,
                suspicious_count:  suspicious.length,
                top_suspicious:    suspicious.slice(0, 5),
                analysis,
                summary: suspicious.length === 0
                    ? `Log correlation: no suspicious concurrent events in ${windowMs}ms window`
                    : `Log correlation: ${suspicious.length} suspicious cluster(s) — ${suspicious.filter((c) => c.suspicion === 'race_condition').length} race(s), ${suspicious.filter((c) => c.suspicion === 'deadlock').length} deadlock(s)`,
            });
        }
    }
}
