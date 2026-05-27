// ============================================================================
// DEVOPS TUNNEL BUILDER
//
// Structured builders for port-forwarding and SSH tunnels used by the
// workspace_devops_tunnel action.
//
// Sub-actions:
//   kubectl_forward      — kubectl port-forward pod/svc/deploy
//   ssh_local            — ssh -L local port forward
//   ssh_remote           — ssh -R remote port forward
//   ssh_dynamic          — ssh -D SOCKS proxy
//   ssh_proxy_jump       — ssh -J jump-host chain
//   list_forwards        — list active kubectl port-forwards (ps grep)
//   kill_forward         — kill a port-forward by local port or PID
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TunnelSpec {
    localPort:   number;
    remoteHost?: string;
    remotePort:  number;
    type:        'kubectl' | 'ssh_local' | 'ssh_remote' | 'ssh_dynamic';
}

export interface ActiveTunnel {
    pid:        number;
    localPort:  number;
    remotePort?: number;
    target:     string;
    type:       string;
}

// ---------------------------------------------------------------------------
// kubectl port-forward builders
// ---------------------------------------------------------------------------

export function buildKubectlPortForwardPodArgs(params: {
    pod:        string;
    namespace?: string;
    ports:      Array<{ local: number; remote: number }>;
    address?:   string;
}): string[] {
    const cmd = ['kubectl', 'port-forward'];
    if (params.namespace) { cmd.push('-n', params.namespace); }
    if (params.address)   { cmd.push('--address', params.address); }
    cmd.push(`pod/${params.pod}`);
    for (const p of params.ports) { cmd.push(`${p.local}:${p.remote}`); }
    return cmd;
}

export function buildKubectlPortForwardServiceArgs(params: {
    service:    string;
    namespace?: string;
    ports:      Array<{ local: number; remote: number }>;
    address?:   string;
}): string[] {
    const cmd = ['kubectl', 'port-forward'];
    if (params.namespace) { cmd.push('-n', params.namespace); }
    if (params.address)   { cmd.push('--address', params.address); }
    cmd.push(`svc/${params.service}`);
    for (const p of params.ports) { cmd.push(`${p.local}:${p.remote}`); }
    return cmd;
}

export function buildKubectlPortForwardDeploymentArgs(params: {
    deployment: string;
    namespace?: string;
    ports:      Array<{ local: number; remote: number }>;
    address?:   string;
}): string[] {
    const cmd = ['kubectl', 'port-forward'];
    if (params.namespace) { cmd.push('-n', params.namespace); }
    if (params.address)   { cmd.push('--address', params.address); }
    cmd.push(`deployment/${params.deployment}`);
    for (const p of params.ports) { cmd.push(`${p.local}:${p.remote}`); }
    return cmd;
}

// ---------------------------------------------------------------------------
// SSH tunnel builders
// ---------------------------------------------------------------------------

/**
 * ssh -L [localAddr:]localPort:remoteHost:remotePort user@sshHost
 * Forwards localPort on the local machine to remoteHost:remotePort via sshHost.
 */
export function buildSshLocalTunnelArgs(params: {
    localPort:   number;
    remoteHost:  string;
    remotePort:  number;
    sshHost:     string;
    sshUser:     string;
    sshPort?:    number;
    keyFile?:    string;
    localAddr?:  string;
    background?: boolean;
}): string[] {
    const bind = params.localAddr ? `${params.localAddr}:${params.localPort}` : String(params.localPort);
    const cmd  = ['ssh', '-N'];
    if (params.background) { cmd.push('-f'); }
    cmd.push('-L', `${bind}:${params.remoteHost}:${params.remotePort}`);
    if (params.sshPort)  { cmd.push('-p', String(params.sshPort)); }
    if (params.keyFile)  { cmd.push('-i', params.keyFile); }
    cmd.push('-o', 'StrictHostKeyChecking=no', '-o', 'ExitOnForwardFailure=yes');
    cmd.push(`${params.sshUser}@${params.sshHost}`);
    return cmd;
}

/**
 * ssh -R [remoteAddr:]remotePort:localHost:localPort user@sshHost
 * Exposes localHost:localPort on the remote machine as remotePort.
 */
export function buildSshRemoteTunnelArgs(params: {
    remotePort:  number;
    localHost:   string;
    localPort:   number;
    sshHost:     string;
    sshUser:     string;
    sshPort?:    number;
    keyFile?:    string;
    background?: boolean;
}): string[] {
    const cmd = ['ssh', '-N'];
    if (params.background) { cmd.push('-f'); }
    cmd.push('-R', `${params.remotePort}:${params.localHost}:${params.localPort}`);
    if (params.sshPort) { cmd.push('-p', String(params.sshPort)); }
    if (params.keyFile) { cmd.push('-i', params.keyFile); }
    cmd.push('-o', 'StrictHostKeyChecking=no');
    cmd.push(`${params.sshUser}@${params.sshHost}`);
    return cmd;
}

/**
 * ssh -D localPort user@sshHost  (SOCKS5 dynamic proxy)
 */
export function buildSshDynamicTunnelArgs(params: {
    localPort:   number;
    sshHost:     string;
    sshUser:     string;
    sshPort?:    number;
    keyFile?:    string;
    background?: boolean;
}): string[] {
    const cmd = ['ssh', '-N'];
    if (params.background) { cmd.push('-f'); }
    cmd.push('-D', String(params.localPort));
    if (params.sshPort) { cmd.push('-p', String(params.sshPort)); }
    if (params.keyFile) { cmd.push('-i', params.keyFile); }
    cmd.push('-o', 'StrictHostKeyChecking=no');
    cmd.push(`${params.sshUser}@${params.sshHost}`);
    return cmd;
}

/**
 * ssh -J jumpHost user@targetHost  (ProxyJump)
 */
export function buildSshProxyJumpArgs(params: {
    targetHost:  string;
    targetUser:  string;
    jumpHost:    string;
    jumpUser:    string;
    targetPort?: number;
    jumpPort?:   number;
    keyFile?:    string;
    remoteCmd?:  string;
}): string[] {
    const jumpSpec = params.jumpPort
        ? `${params.jumpUser}@${params.jumpHost}:${params.jumpPort}`
        : `${params.jumpUser}@${params.jumpHost}`;
    const cmd = ['ssh', '-J', jumpSpec];
    if (params.targetPort) { cmd.push('-p', String(params.targetPort)); }
    if (params.keyFile)    { cmd.push('-i', params.keyFile); }
    cmd.push('-o', 'StrictHostKeyChecking=no');
    cmd.push(`${params.targetUser}@${params.targetHost}`);
    if (params.remoteCmd)  { cmd.push(params.remoteCmd); }
    return cmd;
}

// ---------------------------------------------------------------------------
// Process management helpers
// ---------------------------------------------------------------------------

/** Lists running kubectl port-forward processes. */
export function buildListPortForwardsArgs(): string[] {
    return ['sh', '-c', "ps aux | grep 'kubectl port-forward' | grep -v grep"];
}

/** Kills a port-forward process by PID. */
export function buildKillPortForwardByPidArgs(pid: number): string[] {
    return ['kill', String(pid)];
}

/** Finds the PID using a given local port (via ss/lsof). */
export function buildFindPortPidArgs(localPort: number): string[] {
    return ['sh', '-c', `ss -tlnp | grep ':${localPort} '`];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/** Parses `ps aux` grep output into ActiveTunnel records. */
export function parseActiveTunnels(raw: string): ActiveTunnel[] {
    const tunnels: ActiveTunnel[] = [];
    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const parts  = line.trim().split(/\s+/);
        const pid    = parseInt(parts[1] ?? '0', 10);
        const cmdStr = parts.slice(10).join(' ');
        // kubectl port-forward
        const kpf = cmdStr.match(/kubectl port-forward.*?(\d+):(\d+)/);
        if (kpf) {
            tunnels.push({ pid, localPort: parseInt(kpf[1]!, 10), remotePort: parseInt(kpf[2]!, 10), target: cmdStr.split(' ')[3] ?? '', type: 'kubectl' });
            continue;
        }
        // ssh -L
        const sshL = cmdStr.match(/ssh.*-L\s+(?:\S+:)?(\d+):(\S+):(\d+)/);
        if (sshL) {
            tunnels.push({ pid, localPort: parseInt(sshL[1]!, 10), remotePort: parseInt(sshL[3]!, 10), target: sshL[2]!, type: 'ssh_local' });
        }
    }
    return tunnels;
}

/** Formats a tunnel report. */
export function formatTunnelReport(tunnels: ActiveTunnel[]): string {
    if (tunnels.length === 0) return '# Active Tunnels\nNo active port-forwards found.';
    const lines = ['# Active Tunnels', '', '| PID | Type | Local Port | Remote | Target |', '|-----|------|-----------|--------|--------|'];
    for (const t of tunnels) {
        lines.push(`| ${t.pid} | ${t.type} | ${t.localPort} | ${t.remotePort ?? '-'} | ${t.target} |`);
    }
    return lines.join('\n');
}
