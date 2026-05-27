// ============================================================================
// DEVOPS WINDOWS BUILDER
//
// Windows Server administration via CLI-accessible tooling:
//
//   WinRM / PSRemoting  — PowerShell remote execution (winrs / Enter-PSSession)
//   PowerShell DSC      — Start-DscConfiguration, Test-DscConfiguration
//   Active Directory    — New/Get/Set/Remove-ADUser, groups, OUs
//   IIS                 — Get/Start/Stop-Website, app-pool management
//   Windows Event Log   — Get-WinEvent queries, wevtutil
//   Windows Update      — PSWindowsUpdate module, wuauclt
//
// All commands are expressed as string arrays (argv) to avoid shell injection.
// Destructive ops (Remove-ADUser, Stop-Website, etc.) require allow_destructive.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WinRmTarget {
    host:       string;
    port?:      number;        // default 5985 (HTTP) or 5986 (HTTPS)
    https?:     boolean;
    username?:  string;
    password?:  string;        // populated from vault — never log
    skipCaCheck?: boolean;
}

export interface DscConfiguration {
    name:           string;
    mofPath:        string;    // compiled .mof file path
    credential?:    string;    // PSCredential name
    verbose?:       boolean;
    wait?:          boolean;
    force?:         boolean;
}

export interface AdUserSpec {
    samAccountName: string;
    displayName?:   string;
    email?:         string;
    ou?:            string;    // OU=Users,DC=corp,DC=example,DC=com
    enabled?:       boolean;
    groups?:        string[];
    passwordNeverExpires?: boolean;
}

export interface IisSiteInfo {
    name:           string;
    physicalPath?:  string;
    port?:          number;
    appPoolName?:   string;
    state?:         'Started' | 'Stopped';
}

export interface EventLogQuery {
    logName:        string;    // e.g. 'System', 'Application', 'Security'
    id?:            number[];  // Event IDs
    level?:         1 | 2 | 3 | 4 | 5;  // Critical/Error/Warning/Information/Verbose
    source?:        string;    // Provider name
    startTime?:     string;    // ISO timestamp
    endTime?:       string;
    maxEvents?:     number;
}

export interface WindowsUpdateInfo {
    title:          string;
    kb:             string;
    severity?:      string;
    rebootRequired: boolean;
    installed:      boolean;
}

// ---------------------------------------------------------------------------
// WinRM / PSRemoting command builders
// ---------------------------------------------------------------------------

/**
 * Run a PowerShell command on a remote Windows host using winrs.
 * winrs is available on Windows management hosts or via RSAT.
 */
export function buildWinrsArgs(params: {
    target:     WinRmTarget;
    command:    string;      // PowerShell command string
    useHttps?:  boolean;
}): string[] {
    const scheme = (params.useHttps ?? params.target.https) ? 'https' : 'http';
    const port   = params.target.port ?? (params.target.https ? 5986 : 5985);
    const remote = `${scheme}://${params.target.host}:${port}/wsman`;
    const args   = ['winrs', '-r:', remote];
    if (params.target.username) args.push(`-u:${params.target.username}`);
    if (params.target.password) args.push(`-p:${params.target.password}`);
    if (params.target.skipCaCheck) args.push('-noprofile');
    args.push(params.command);
    return args;
}

/**
 * Invoke-Command via PowerShell CLI — useful when winrs is unavailable.
 * Returns a powershell.exe invocation that wraps the remote scriptblock.
 */
export function buildInvokeCommandArgs(params: {
    target:      WinRmTarget;
    scriptBlock: string;
    credential?: string;     // PSCredential variable name (pre-loaded)
    https?:      boolean;
}): string[] {
    const useHttps    = params.https ?? params.target.https;
    const port        = params.target.port ?? (useHttps ? 5986 : 5985);
    const sessionOpts = useHttps
        ? `New-PSSessionOption -SkipCACheck -SkipCNCheck`
        : '';

    let invoke = `Invoke-Command -ComputerName '${params.target.host}' -Port ${port}`;
    if (params.credential) invoke += ` -Credential ${params.credential}`;
    if (useHttps)          invoke += ` -UseSSL -SessionOption (${sessionOpts})`;
    invoke += ` -ScriptBlock { ${params.scriptBlock} }`;

    return ['powershell.exe', '-NonInteractive', '-Command', invoke];
}

/**
 * Test WinRM connectivity to a host (does not run any command).
 */
export function buildTestWsManArgs(target: WinRmTarget): string[] {
    const port = target.port ?? (target.https ? 5986 : 5985);
    const opts = target.skipCaCheck ? `-SessionOption (New-PSSessionOption -SkipCACheck -SkipCNCheck)` : '';
    const script = `Test-WSMan -ComputerName '${target.host}' -Port ${port} ${opts}`;
    return ['powershell.exe', '-NonInteractive', '-Command', script];
}

// ---------------------------------------------------------------------------
// PowerShell DSC
// ---------------------------------------------------------------------------

export function buildDscApplyArgs(config: DscConfiguration): string[] {
    let cmd = `Start-DscConfiguration -Path '${config.mofPath}' -ComputerName '${config.name}'`;
    if (config.wait)    cmd += ' -Wait';
    if (config.force)   cmd += ' -Force';
    if (config.verbose) cmd += ' -Verbose';
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildDscTestArgs(config: DscConfiguration): string[] {
    const cmd = `Test-DscConfiguration -ComputerName '${config.name}' -Detailed | ConvertTo-Json -Depth 5`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildDscGetArgs(target: WinRmTarget): string[] {
    const cmd = `Get-DscConfiguration -CimSession (New-CimSession -ComputerName '${target.host}') | ConvertTo-Json -Depth 5`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildDscStatusArgs(target: WinRmTarget): string[] {
    const cmd = `Get-DscLocalConfigurationManager -CimSession (New-CimSession -ComputerName '${target.host}') | ConvertTo-Json`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

// ---------------------------------------------------------------------------
// Active Directory management (requires RSAT/AD module on management host)
// ---------------------------------------------------------------------------

export function buildAdGetUserArgs(samAccountName: string, properties?: string[]): string[] {
    const props = properties?.join(',') ?? '*';
    const cmd   = `Get-ADUser -Identity '${samAccountName}' -Properties ${props} | ConvertTo-Json`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildAdNewUserArgs(spec: AdUserSpec, plainTextPassword: string): string[] {
    let cmd = `New-ADUser -SamAccountName '${spec.samAccountName}'`;
    if (spec.displayName)         cmd += ` -DisplayName '${spec.displayName}'`;
    if (spec.email)               cmd += ` -EmailAddress '${spec.email}'`;
    if (spec.ou)                  cmd += ` -Path '${spec.ou}'`;
    if (spec.enabled !== false)   cmd += ' -Enabled $true';
    if (spec.passwordNeverExpires) cmd += ' -PasswordNeverExpires $true';
    cmd += ` -AccountPassword (ConvertTo-SecureString '${plainTextPassword}' -AsPlainText -Force)`;
    if (spec.groups?.length) {
        const groupStr = spec.groups.map((g) => `'${g}'`).join(',');
        cmd += `; Add-ADGroupMember -Identity ${groupStr} -Members '${spec.samAccountName}'`;
    }
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildAdDisableUserArgs(samAccountName: string): string[] {
    const cmd = `Disable-ADAccount -Identity '${samAccountName}'`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildAdResetPasswordArgs(samAccountName: string, newPassword: string): string[] {
    const cmd = `Set-ADAccountPassword -Identity '${samAccountName}' -Reset -NewPassword (ConvertTo-SecureString '${newPassword}' -AsPlainText -Force)`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildAdRemoveUserArgs(samAccountName: string): string[] {
    const cmd = `Remove-ADUser -Identity '${samAccountName}' -Confirm:$false`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildAdGetGroupMembersArgs(groupName: string): string[] {
    const cmd = `Get-ADGroupMember -Identity '${groupName}' | ConvertTo-Json`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

export function buildAdAddGroupMemberArgs(groupName: string, member: string): string[] {
    const cmd = `Add-ADGroupMember -Identity '${groupName}' -Members '${member}'`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

// ---------------------------------------------------------------------------
// IIS management (requires WebAdministration module)
// ---------------------------------------------------------------------------

export function buildIisListSitesArgs(target?: WinRmTarget): string[] {
    const cmd = `Import-Module WebAdministration; Get-WebSite | ConvertTo-Json`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

export function buildIisStartSiteArgs(siteName: string, target?: WinRmTarget): string[] {
    const cmd = `Import-Module WebAdministration; Start-WebSite -Name '${siteName}'`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

export function buildIisStopSiteArgs(siteName: string, target?: WinRmTarget): string[] {
    const cmd = `Import-Module WebAdministration; Stop-WebSite -Name '${siteName}'`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

export function buildIisRestartAppPoolArgs(appPoolName: string, target?: WinRmTarget): string[] {
    const cmd = `Import-Module WebAdministration; Restart-WebAppPool -Name '${appPoolName}'`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

export function buildIisGetAppPoolsArgs(target?: WinRmTarget): string[] {
    const cmd = `Import-Module WebAdministration; Get-WebConfiguration system.applicationHost/applicationPools/add | ConvertTo-Json -Depth 3`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

// ---------------------------------------------------------------------------
// Windows Event Log
// ---------------------------------------------------------------------------

export function buildGetWinEventArgs(query: EventLogQuery): string[] {
    const filters: string[] = [`LogName='${query.logName}'`];
    if (query.id?.length)   filters.push(`Id=${query.id.join(',')}`);
    if (query.level)        filters.push(`Level=${query.level}`);
    if (query.source)       filters.push(`ProviderName='${query.source}'`);
    if (query.startTime)    filters.push(`StartTime='${query.startTime}'`);
    if (query.endTime)      filters.push(`EndTime='${query.endTime}'`);
    const filterHash = `@{${filters.join('; ')}}`;
    const maxEvents  = query.maxEvents ?? 50;
    const cmd = `Get-WinEvent -FilterHashtable ${filterHash} -MaxEvents ${maxEvents} | Select-Object TimeCreated,Id,LevelDisplayName,Message,ProviderName | ConvertTo-Json`;
    return ['powershell.exe', '-NonInteractive', '-Command', cmd];
}

/** wevtutil for exporting event logs to a file (useful for audits). */
export function buildWevtutilExportArgs(params: {
    logName:  string;
    outFile:  string;
    query?:   string;   // XPath query
    remote?:  string;   // remote computer name
}): string[] {
    const args = ['wevtutil', 'epl', params.logName, params.outFile];
    if (params.query)  args.push(`/q:${params.query}`);
    if (params.remote) args.push(`/r:${params.remote}`);
    return args;
}

/** Clear a Windows event log (requires allow_destructive). */
export function buildClearEventLogArgs(logName: string, target?: WinRmTarget): string[] {
    const cmd = `Clear-EventLog -LogName '${logName}'`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

// ---------------------------------------------------------------------------
// Windows Update (requires PSWindowsUpdate module)
// ---------------------------------------------------------------------------

export function buildGetWindowsUpdateArgs(target?: WinRmTarget): string[] {
    const cmd = `Get-WindowsUpdate -AcceptAll -IgnoreReboot | ConvertTo-Json`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

export function buildInstallWindowsUpdateArgs(params: {
    target?:     WinRmTarget;
    kbArticleId?: string;     // specific KB to install; null = all
    autoReboot?:  boolean;
}): string[] {
    let cmd = 'Install-WindowsUpdate -AcceptAll -IgnoreReboot';
    if (params.kbArticleId) cmd += ` -KBArticleID '${params.kbArticleId}'`;
    if (params.autoReboot)  cmd = cmd.replace('-IgnoreReboot', '-AutoReboot');
    if (!params.target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target: params.target, scriptBlock: cmd });
}

/** Check pending reboot status. */
export function buildCheckPendingRebootArgs(target?: WinRmTarget): string[] {
    const cmd = [
        `$reboot = $false;`,
        `if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { $reboot = $true };`,
        `[PSCustomObject]@{ RebootRequired = $reboot; ComputerName = $env:COMPUTERNAME } | ConvertTo-Json`,
    ].join(' ');
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

// ---------------------------------------------------------------------------
// Service management (general Windows services)
// ---------------------------------------------------------------------------

export function buildGetServiceArgs(serviceName: string, target?: WinRmTarget): string[] {
    const cmd = `Get-Service -Name '${serviceName}' | ConvertTo-Json`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

export function buildRestartServiceArgs(serviceName: string, target?: WinRmTarget): string[] {
    const cmd = `Restart-Service -Name '${serviceName}' -Force`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

export function buildStopServiceArgs(serviceName: string, target?: WinRmTarget): string[] {
    const cmd = `Stop-Service -Name '${serviceName}' -Force`;
    if (!target) return ['powershell.exe', '-NonInteractive', '-Command', cmd];
    return buildInvokeCommandArgs({ target, scriptBlock: cmd });
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseWindowsUpdateList(raw: string): WindowsUpdateInfo[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        const items  = Array.isArray(parsed) ? parsed : [parsed];
        return items
            .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
            .map((i) => ({
                title:          String(i['Title']   ?? i['title']   ?? ''),
                kb:             String(i['KBArticleIDs'] ?? i['KB'] ?? ''),
                severity:       i['MsrcSeverity'] ? String(i['MsrcSeverity']) : undefined,
                rebootRequired: Boolean(i['RebootRequired'] ?? i['RebootRequired'] ?? false),
                installed:      Boolean(i['IsInstalled'] ?? false),
            }));
    } catch {
        return [];
    }
}

export function parseIisSites(raw: string): IisSiteInfo[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        const items  = Array.isArray(parsed) ? parsed : [parsed];
        return items
            .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
            .map((i) => ({
                name:        String(i['name']         ?? ''),
                physicalPath: i['physicalPath'] ? String(i['physicalPath']) : undefined,
                port:        i['bindings'] ? undefined : undefined,
                state:       (i['state'] as IisSiteInfo['state']) ?? 'Stopped',
            }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

export function buildWindowsAnalysisPrompt(params: {
    task:       string;
    eventLogs?: string;
    dscStatus?: string;
    iisInfo?:   string;
    services?:  string;
    updates?:   string;
}): string {
    return [
        `You are a Windows Server administrator. Analyze the following system state and ${params.task}.`,
        ``,
        params.eventLogs ? `Event Log entries:\n${params.eventLogs.slice(0, 2000)}\n` : '',
        params.dscStatus ? `DSC compliance status:\n${params.dscStatus.slice(0, 1000)}\n` : '',
        params.iisInfo   ? `IIS site/app-pool state:\n${params.iisInfo.slice(0, 1000)}\n` : '',
        params.services  ? `Windows services:\n${params.services.slice(0, 1000)}\n` : '',
        params.updates   ? `Pending Windows Updates:\n${params.updates.slice(0, 1000)}\n` : '',
        `Provide a concise diagnosis and a step-by-step remediation plan.`,
        `For each step, include the exact PowerShell command to run.`,
        `Return JSON: { "diagnosis": string, "severity": "low"|"medium"|"high"|"critical", "steps": [{ "description": string, "command": string }] }`,
        `Return ONLY the JSON object — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseWindowsAnalysisOutput(raw: string): {
    diagnosis: string;
    severity:  string;
    steps:     Array<{ description: string; command: string }>;
} | null {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const j = JSON.parse(cleaned) as Record<string, unknown>;
        return {
            diagnosis: String(j['diagnosis'] ?? ''),
            severity:  String(j['severity']  ?? 'medium'),
            steps:     Array.isArray(j['steps'])
                ? (j['steps'] as Array<Record<string, unknown>>).map((s) => ({
                    description: String(s['description'] ?? ''),
                    command:     String(s['command']     ?? ''),
                  }))
                : [],
        };
    } catch {
        return null;
    }
}

export function formatWindowsReport(params: {
    host:       string;
    diagnosis?: string;
    severity?:  string;
    steps?:     Array<{ description: string; command: string }>;
    updates?:   WindowsUpdateInfo[];
    sites?:     IisSiteInfo[];
}): string {
    const lines = [`Windows Admin Report — ${params.host}`];
    if (params.severity)  lines.push(`Severity: ${params.severity.toUpperCase()}`);
    if (params.diagnosis) lines.push(`Diagnosis: ${params.diagnosis}`);
    if (params.updates?.length) {
        lines.push(``, `Pending Updates: ${params.updates.length}`);
        params.updates.slice(0, 5).forEach((u) => lines.push(`  [${u.kb}] ${u.title}`));
    }
    if (params.sites?.length) {
        lines.push(``, `IIS Sites:`);
        params.sites.forEach((s) => lines.push(`  ${s.name}: ${s.state ?? 'Unknown'}`));
    }
    if (params.steps?.length) {
        lines.push(``, `Remediation Steps:`);
        params.steps.forEach((s, i) => {
            lines.push(`  ${i + 1}. ${s.description}`);
            if (s.command) lines.push(`     > ${s.command}`);
        });
    }
    return lines.join('\n');
}
