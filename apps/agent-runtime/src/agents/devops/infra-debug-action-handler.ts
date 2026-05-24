// ============================================================================
// INFRA DEBUG ACTION HANDLER — Gap 6: Hardware / Network Physical Debugging
//
// Gives the DevOps agent the ability to interrogate bare-metal servers and
// network equipment — things no cloud console can reach.
//
// Actions:
//   workspace_infra_ipmi_console   — IPMI/iDRAC power + console access
//   workspace_infra_netconf_query  — NETCONF/YANG queries to routers/switches
//   workspace_infra_remote_diag    — SSH diagnostic commands on remote servers
//
// Architecture:
//   All I/O via runCommand callback.
//   Pure builder helpers produce CLI invocations; handler executes them.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InfraDebugActionType =
    | 'workspace_infra_ipmi_console'
    | 'workspace_infra_netconf_query'
    | 'workspace_infra_remote_diag';

export const INFRA_DEBUG_ACTION_TYPES = new Set<InfraDebugActionType>([
    'workspace_infra_ipmi_console',
    'workspace_infra_netconf_query',
    'workspace_infra_remote_diag',
]);

export function isInfraDebugActionType(at: string): at is InfraDebugActionType {
    return INFRA_DEBUG_ACTION_TYPES.has(at as InfraDebugActionType);
}

export type InfraDebugActionResult = {
    ok:           boolean;
    output:       string;
    errorOutput?: string;
    [key: string]: unknown;
};

type RunCommandFn = (
    args:      string[],
    cwd:       string,
    timeoutMs?: number,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

type ExecuteActionFn = (
    actionType: string,
    payload:    Record<string, unknown>,
) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;

export interface InfraDebugActionParams {
    actionType:    InfraDebugActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    runCommand?:   RunCommandFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function safeJson(obj: Record<string, unknown>): InfraDebugActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}

async function run(
    runCommand: RunCommandFn,
    args:       string[],
    cwd:        string,
    timeoutMs = 60_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    const r = await runCommand(args, cwd, timeoutMs);
    return { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr };
}

// ---------------------------------------------------------------------------
// IPMI helpers (ipmitool CLI)
// ---------------------------------------------------------------------------

type IpmiPowerAction = 'status' | 'on' | 'off' | 'reset' | 'cycle' | 'soft';

/**
 * Builds the ipmitool command for power management.
 * Pure function.
 */
export function buildIpmiPowerCmd(params: {
    host:     string;
    user:     string;
    password: string;
    action:   IpmiPowerAction;
    interface?: string;
}): string[] {
    return [
        'ipmitool',
        '-I', params.interface ?? 'lanplus',
        '-H', params.host,
        '-U', params.user,
        '-P', params.password,
        'power', params.action,
    ];
}

/**
 * Builds the ipmitool sensor dump command.
 * Pure function.
 */
export function buildIpmiSensorCmd(params: {
    host:     string;
    user:     string;
    password: string;
    filter?:  string;   // e.g. 'Temp' to filter only temperature sensors
}): string[] {
    const cmd = [
        'ipmitool',
        '-I', 'lanplus',
        '-H', params.host,
        '-U', params.user,
        '-P', params.password,
        'sensor', 'list',
    ];
    return cmd;   // caller applies grep filter on stdout if params.filter provided
}

/**
 * Parses ipmitool sensor output into structured rows.
 * Pure function.
 */
export function parseIpmiSensorOutput(raw: string, filter?: string): Array<{
    name:   string;
    value:  string;
    unit:   string;
    status: string;
}> {
    return raw
        .split('\n')
        .filter((line) => line.trim().length > 0 && (!filter || line.toLowerCase().includes(filter.toLowerCase())))
        .map((line) => {
            const parts = line.split('|').map((p) => p.trim());
            return {
                name:   parts[0] ?? '',
                value:  parts[1] ?? '',
                unit:   parts[2] ?? '',
                status: parts[3] ?? '',
            };
        })
        .filter((r) => r.name.length > 0);
}

// ---------------------------------------------------------------------------
// NETCONF helpers (ncclient / netconf-console CLI)
// ---------------------------------------------------------------------------

/**
 * Builds a NETCONF <get> RPC XML payload for a given YANG module path.
 * Pure function.
 */
export function buildNetconfGetXml(filterXpath: string): string {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rpc xmlns="urn:ietf:params:xml:ns:netconf:base:1.0" message-id="1">',
        '  <get>',
        '    <filter type="xpath">',
        `      <select>${filterXpath}</select>`,
        '    </filter>',
        '  </get>',
        '</rpc>',
        ']]>]]>',
    ].join('\n');
}

/**
 * Builds the netconf-console command for a query.
 * Pure function.
 */
export function buildNetconfConsoleCmd(params: {
    host:      string;
    port:      number;
    user:      string;
    password:  string;
    rpcFile:   string;
}): string[] {
    return [
        'netconf-console',
        '--host', params.host,
        '--port', String(params.port),
        '--user', params.user,
        '--password', params.password,
        '--rpc', params.rpcFile,
    ];
}

// ---------------------------------------------------------------------------
// SSH diagnostic helpers
// ---------------------------------------------------------------------------

/**
 * Pre-defined diagnostic command sets per OS/device type.
 * Pure function.
 */
export function getRemoteDiagCommands(target: 'linux' | 'windows' | 'network_os' | 'custom', customCmds?: string[]): string[][] {
    switch (target) {
        case 'linux':
            return [
                ['uptime'],
                ['free', '-h'],
                ['df', '-h'],
                ['top', '-bn1'],
                ['ss', '-tulpn'],
                ['dmesg', '--level=err,warn', '-T'],
                ['systemctl', '--failed', '--no-pager'],
                ['journalctl', '-n', '100', '--no-pager', '-p', 'err'],
            ];
        case 'windows':
            return [
                ['powershell', '-Command', 'Get-ComputerInfo | Select-Object OsName,OsVersion,CsProcessors,OsTotalVisibleMemorySize'],
                ['powershell', '-Command', 'Get-EventLog -LogName System -EntryType Error -Newest 20 | Format-List'],
                ['powershell', '-Command', 'Get-Service | Where-Object {$_.Status -eq "Stopped"} | Format-Table'],
            ];
        case 'network_os':
            return [
                ['show', 'version'],
                ['show', 'interface', 'status'],
                ['show', 'ip', 'route', 'summary'],
                ['show', 'log'],
                ['show', 'environment'],
            ];
        case 'custom':
            return (customCmds ?? []).map((c) => c.split(/\s+/));
        default:
            return [];
    }
}

/**
 * Builds an SSH command that runs a single remote command string.
 * Pure function.
 */
export function buildSshCmd(params: {
    host:       string;
    user:       string;
    port?:      number;
    keyFile?:   string;
    remoteCmd:  string;
    timeoutSec?: number;
}): string[] {
    const cmd: string[] = ['ssh'];
    if (params.port)       { cmd.push('-p', String(params.port)); }
    if (params.keyFile)    { cmd.push('-i', params.keyFile); }
    if (params.timeoutSec) { cmd.push('-o', `ConnectTimeout=${params.timeoutSec}`); }
    cmd.push('-o', 'StrictHostKeyChecking=no', '-o', 'BatchMode=yes');
    cmd.push(`${params.user}@${params.host}`, params.remoteCmd);
    return cmd;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleInfraDebugAction(
    params: InfraDebugActionParams,
): Promise<InfraDebugActionResult> {
    const { actionType, payload, workspaceDir, executeAction, runCommand } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_infra_ipmi_console
        // Accesses a bare-metal server's IPMI/iDRAC management interface.
        //
        // payload:
        //   host          — BMC IP address or hostname (required)
        //   user          — IPMI user (required)
        //   password      — IPMI password (required)
        //   action?       — status | on | off | reset | cycle | soft | sensors
        //                    (default: status)
        //   sensor_filter? — substring filter for sensor output
        //   interface?    — IPMI interface type (default: lanplus)
        // ====================================================================
        case 'workspace_infra_ipmi_console': {
            const host         = str(payload['host']);
            const user         = str(payload['user']);
            const password     = str(payload['password']);
            const action       = str(payload['action'], 'status') as IpmiPowerAction | 'sensors';
            const sensorFilter = str(payload['sensor_filter']);
            const iface        = str(payload['interface'], 'lanplus');

            if (!host || !user || !password) {
                return { ok: false, output: '', errorOutput: 'workspace_infra_ipmi_console: host, user, password are required' };
            }

            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'workspace_infra_ipmi_console: runCommand is not available' };
            }

            if (action === 'sensors') {
                const cmd = buildIpmiSensorCmd({ host, user, password, filter: sensorFilter });
                const r   = await run(runCommand, cmd, workspaceDir, 30_000);
                const sensors = parseIpmiSensorOutput(r.stdout, sensorFilter || undefined);

                return safeJson({
                    host, action: 'sensors',
                    ok:       r.ok,
                    sensor_count: sensors.length,
                    sensors,
                    raw_output:   r.stdout.slice(0, 3000),
                    summary: `IPMI sensors: ${sensors.length} reading(s) from ${host}`,
                });
            }

            // Power action
            const cmd    = buildIpmiPowerCmd({ host, user, password, action, interface: iface });
            const r      = await run(runCommand, cmd, workspaceDir, 30_000);
            const status = r.stdout.trim() || r.stderr.trim();

            return safeJson({
                host, action,
                ok:         r.ok,
                raw_output: status.slice(0, 500),
                summary:    `IPMI ${action} on ${host}: ${r.ok ? status : 'failed — ' + r.stderr.slice(0, 100)}`,
            });
        }

        // ====================================================================
        // workspace_infra_netconf_query
        // Sends a NETCONF RPC to a router/switch and returns the XML response.
        //
        // payload:
        //   host         — network device IP or hostname (required)
        //   user         — NETCONF user (required)
        //   password     — NETCONF password (required)
        //   port?        — NETCONF port (default: 830)
        //   xpath_filter — YANG XPath filter expression (required)
        // ====================================================================
        case 'workspace_infra_netconf_query': {
            const host        = str(payload['host']);
            const user        = str(payload['user']);
            const password    = str(payload['password']);
            const port        = typeof payload['port'] === 'number' ? payload['port'] : 830;
            const xpathFilter = str(payload['xpath_filter']);

            if (!host || !user || !password || !xpathFilter) {
                return {
                    ok: false, output: '',
                    errorOutput: 'workspace_infra_netconf_query: host, user, password, xpath_filter are required',
                };
            }

            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'workspace_infra_netconf_query: runCommand is not available' };
            }

            // Write RPC to temp file
            const rpcXml  = buildNetconfGetXml(xpathFilter);
            const rpcFile = '.agentfarm/netconf-rpc.xml';
            await executeAction('workspace_write_file', { file_path: rpcFile, content: rpcXml });

            const cmd = buildNetconfConsoleCmd({ host, port, user, password, rpcFile });
            const r   = await run(runCommand, cmd, workspaceDir, 60_000);

            // Save raw response for analysis
            if (r.stdout) {
                await executeAction('workspace_write_file', {
                    file_path: '.agentfarm/netconf-response.xml',
                    content:   r.stdout,
                });
            }

            return safeJson({
                host, port, xpath_filter: xpathFilter,
                ok:         r.ok,
                response_length: r.stdout.length,
                raw_response:    r.stdout.slice(0, 4000),
                error:           r.ok ? null : r.stderr.slice(0, 400),
                summary: r.ok
                    ? `NETCONF query to ${host}: ${r.stdout.length} bytes response`
                    : `NETCONF query failed: ${r.stderr.slice(0, 200)}`,
            });
        }

        // ====================================================================
        // workspace_infra_remote_diag
        // Runs a set of diagnostic commands on a remote server via SSH and
        // returns all outputs in a structured diagnostic report.
        //
        // payload:
        //   host         — remote server IP or hostname (required)
        //   user         — SSH user (required)
        //   port?        — SSH port (default: 22)
        //   key_file?    — SSH private key path
        //   target_os?   — linux | windows | network_os | custom (default: linux)
        //   commands?    — string[] for custom target_os=custom
        //   timeout_sec? — per-command SSH timeout (default: 30)
        // ====================================================================
        case 'workspace_infra_remote_diag': {
            const host       = str(payload['host']);
            const user       = str(payload['user']);
            const port       = typeof payload['port'] === 'number' ? payload['port'] : 22;
            const keyFile    = str(payload['key_file']);
            const targetOs   = str(payload['target_os'], 'linux') as 'linux' | 'windows' | 'network_os' | 'custom';
            const customCmds = Array.isArray(payload['commands']) ? (payload['commands'] as string[]) : [];
            const timeoutSec = typeof payload['timeout_sec'] === 'number' ? payload['timeout_sec'] : 30;

            if (!host || !user) {
                return { ok: false, output: '', errorOutput: 'workspace_infra_remote_diag: host and user are required' };
            }

            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'workspace_infra_remote_diag: runCommand is not available' };
            }

            const diagCmds  = getRemoteDiagCommands(targetOs, customCmds);
            const cmdResults: Array<{
                command: string;
                ok:      boolean;
                output:  string;
                error:   string;
            }> = [];

            for (const cmdArgs of diagCmds) {
                const remoteCmd = cmdArgs.join(' ');
                const sshCmd    = buildSshCmd({
                    host, user, port: port !== 22 ? port : undefined,
                    keyFile: keyFile || undefined,
                    remoteCmd,
                    timeoutSec,
                });

                const r = await run(runCommand, sshCmd, workspaceDir, (timeoutSec + 5) * 1000);
                cmdResults.push({
                    command: remoteCmd,
                    ok:      r.ok,
                    output:  r.stdout.slice(0, 2000),
                    error:   r.stderr.slice(0, 500),
                });
            }

            // Build diagnostic report markdown
            const reportLines: string[] = [
                `# Remote Diagnostic Report`,
                `**Host:** ${host}  **User:** ${user}  **OS:** ${targetOs}`,
                `**Generated:** ${new Date().toISOString()}`,
                ``,
            ];
            for (const r of cmdResults) {
                reportLines.push(
                    `## \`${r.command}\``,
                    r.ok ? '**Status:** ✅ OK' : '**Status:** ❌ Failed',
                    '```',
                    r.ok ? r.output : r.error,
                    '```',
                    '',
                );
            }
            const reportMd = reportLines.join('\n');

            // Save report
            const reportFile = `.agentfarm/diag-${host.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.md`;
            await executeAction('workspace_write_file', { file_path: reportFile, content: reportMd });

            const okCount   = cmdResults.filter((r) => r.ok).length;
            const failCount = cmdResults.length - okCount;

            return safeJson({
                host, user, target_os: targetOs,
                commands_run:    cmdResults.length,
                commands_ok:     okCount,
                commands_failed: failCount,
                report_file:     reportFile,
                results:         cmdResults,
                summary: `Remote diag on ${host} (${targetOs}): ${okCount}/${cmdResults.length} commands succeeded — report: ${reportFile}`,
            });
        }
    }
}
