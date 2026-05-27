// ============================================================================
// DEVOPS NETWORK DIAGNOSTICS BUILDER
//
// Structured builders for common network diagnostic commands used by the
// workspace_devops_net_diag action.
//
// Supported sub-actions:
//   ping            — ICMP echo test (count, interval, deadline)
//   traceroute      — path discovery (traceroute / tracepath)
//   dns_lookup      — DNS resolution (dig / nslookup)
//   port_check      — TCP port reachability (nc -z / nmap)
//   http_check      — HTTP/HTTPS endpoint check (curl)
//   mtr             — combined MTR path analysis
//   arp_table       — local ARP cache (arp -n / ip neigh)
//   route_table     — routing table (ip route / netstat -r)
//   ssl_check       — TLS certificate info (openssl s_client)
//   bandwidth_test  — throughput test (iperf3 client mode)
//
// All builders return string[] (CLI argv) — no shell expansion, no pipes.
// Parsers return typed structs; formatters return markdown strings.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PingResult {
    host:            string;
    packets_sent:    number;
    packets_received: number;
    packet_loss_pct: number;
    rtt_min_ms?:     number;
    rtt_avg_ms?:     number;
    rtt_max_ms?:     number;
    reachable:       boolean;
}

export interface TracerouteHop {
    hop:      number;
    host:     string;
    rtt_ms?:  number;
    timeout:  boolean;
}

export interface DnsRecord {
    name:  string;
    type:  string;
    value: string;
    ttl?:  number;
}

export interface HttpCheckResult {
    url:            string;
    status_code:    number;
    response_time_ms: number;
    content_length?: number;
    ok:             boolean;
    error?:         string;
    redirect_url?:  string;
}

export interface PortCheckResult {
    host:   string;
    port:   number;
    open:   boolean;
    proto:  'tcp' | 'udp';
    banner?: string;
}

export interface SslCertInfo {
    subject:     string;
    issuer:      string;
    not_before:  string;
    not_after:   string;
    days_until_expiry: number;
    expired:     boolean;
    san?:        string[];
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * Builds a ping command.
 * @param count   number of ICMP packets (default 4)
 * @param deadline total wait timeout in seconds
 */
export function buildPingArgs(params: {
    host:       string;
    count?:     number;
    deadline?:  number;
    interval?:  number;
    ipv6?:      boolean;
}): string[] {
    const cmd = [params.ipv6 ? 'ping6' : 'ping'];
    cmd.push('-c', String(params.count ?? 4));
    if (params.deadline)  { cmd.push('-w', String(params.deadline)); }
    if (params.interval)  { cmd.push('-i', String(params.interval)); }
    cmd.push(params.host);
    return cmd;
}

/**
 * Builds a traceroute command.
 * Uses traceroute on Linux, falls back to tracepath for environments without
 * raw socket privilege.
 */
export function buildTracerouteArgs(params: {
    host:      string;
    max_hops?: number;
    timeout?:  number;
    use_tcp?:  boolean;   // -T flag for environments that block UDP
}): string[] {
    const cmd = ['traceroute'];
    if (params.max_hops) { cmd.push('-m', String(params.max_hops)); }
    if (params.timeout)  { cmd.push('-w', String(params.timeout));  }
    if (params.use_tcp)  { cmd.push('-T'); }
    cmd.push(params.host);
    return cmd;
}

/**
 * Builds a dig DNS lookup command.
 */
export function buildDnsLookupArgs(params: {
    host:       string;
    record_type?: string;   // A, AAAA, MX, TXT, CNAME, NS, PTR (default: A)
    server?:    string;     // custom resolver e.g. "8.8.8.8"
    short?:     boolean;
    timeout?:   number;
}): string[] {
    const cmd = ['dig'];
    if (params.server) { cmd.push(`@${params.server}`); }
    cmd.push(params.host);
    if (params.record_type) { cmd.push(params.record_type.toUpperCase()); }
    if (params.short)       { cmd.push('+short'); }
    if (params.timeout)     { cmd.push(`+time=${params.timeout}`); }
    return cmd;
}

/**
 * Builds an nslookup command as a fallback when dig is not available.
 */
export function buildNslookupArgs(params: {
    host:   string;
    server?: string;
}): string[] {
    const cmd = ['nslookup', params.host];
    if (params.server) { cmd.push(params.server); }
    return cmd;
}

/**
 * Builds a TCP port check using nc (netcat).
 * nc -z closes immediately after connecting — ideal for availability checks.
 */
export function buildPortCheckArgs(params: {
    host:      string;
    port:      number;
    timeout?:  number;
    udp?:      boolean;
}): string[] {
    const cmd = ['nc', '-z'];
    if (params.udp)     { cmd.push('-u'); }
    if (params.timeout) { cmd.push('-w', String(params.timeout)); }
    cmd.push(params.host, String(params.port));
    return cmd;
}

/**
 * Builds an nmap port scan for environments where nc is unavailable.
 */
export function buildNmapPortCheckArgs(params: {
    host:   string;
    port:   number;
    udp?:   boolean;
}): string[] {
    return [
        'nmap',
        params.udp ? '-sU' : '-sT',
        '-p', String(params.port),
        '--open',
        '-T4',
        params.host,
    ];
}

/**
 * Builds a curl HTTP health-check command.
 * Returns HTTP status code, total time, and optionally response body.
 */
export function buildHttpCheckArgs(params: {
    url:            string;
    method?:        string;
    timeout?:       number;
    headers?:       Record<string, string>;
    body?:          string;
    follow_redirects?: boolean;
    insecure?:      boolean;
    max_response_bytes?: number;
}): string[] {
    const cmd = [
        'curl',
        '-s',
        '-o', '/dev/null',
        '-w', '%{http_code} %{time_total} %{size_download} %{redirect_url}',
        '-X', (params.method ?? 'GET').toUpperCase(),
    ];
    if (params.timeout)           { cmd.push('--max-time', String(params.timeout)); }
    if (params.follow_redirects)  { cmd.push('-L'); }
    if (params.insecure)          { cmd.push('-k'); }
    if (params.body)              { cmd.push('-d', params.body); }
    if (params.headers) {
        for (const [k, v] of Object.entries(params.headers)) {
            cmd.push('-H', `${k}: ${v}`);
        }
    }
    cmd.push(params.url);
    return cmd;
}

/**
 * Builds a curl command that also captures the response body.
 */
export function buildHttpCheckWithBodyArgs(params: {
    url:      string;
    timeout?: number;
    insecure?: boolean;
}): string[] {
    return [
        'curl', '-s',
        '-w', '\n---HTTP_STATUS:%{http_code}---TIME:%{time_total}---',
        '--max-time', String(params.timeout ?? 10),
        ...(params.insecure ? ['-k'] : []),
        params.url,
    ];
}

/**
 * Builds an MTR (my traceroute) command in report mode.
 */
export function buildMtrArgs(params: {
    host:       string;
    report_cycles?: number;
    max_hops?:  number;
    no_dns?:    boolean;
}): string[] {
    const cmd = ['mtr', '--report'];
    if (params.report_cycles) { cmd.push('--report-cycles', String(params.report_cycles)); }
    if (params.max_hops)      { cmd.push('--max-ttl', String(params.max_hops)); }
    if (params.no_dns)        { cmd.push('--no-dns'); }
    cmd.push(params.host);
    return cmd;
}

/**
 * Builds a command to display the local ARP table.
 */
export function buildArpTableArgs(): string[] {
    return ['arp', '-n'];
}

/**
 * Builds a command to display the routing table.
 */
export function buildRouteTableArgs(params?: { ipv6?: boolean }): string[] {
    return ['ip', 'route', ...(params?.ipv6 ? ['show', 'table', 'all'] : [])];
}

/**
 * Builds an openssl s_client command for SSL certificate inspection.
 */
export function buildSslCheckArgs(params: {
    host:     string;
    port?:    number;
    timeout?: number;
    sni?:     string;
}): string[] {
    return [
        'openssl', 's_client',
        '-connect', `${params.host}:${params.port ?? 443}`,
        '-servername', params.sni ?? params.host,
        '-showcerts',
    ];
}

/**
 * Builds an iperf3 client bandwidth test command.
 */
export function buildIperf3Args(params: {
    host:       string;
    port?:      number;
    duration?:  number;   // seconds (default 10)
    parallel?:  number;   // streams
    reverse?:   boolean;  // test download instead of upload
    udp?:       boolean;
}): string[] {
    const cmd = ['iperf3', '-c', params.host];
    if (params.port)     { cmd.push('-p', String(params.port)); }
    if (params.duration) { cmd.push('-t', String(params.duration)); }
    if (params.parallel) { cmd.push('-P', String(params.parallel)); }
    if (params.reverse)  { cmd.push('-R'); }
    if (params.udp)      { cmd.push('-u'); }
    cmd.push('-J');   // JSON output
    return cmd;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Parses Linux ping output into a PingResult struct.
 */
export function parsePingOutput(raw: string, host: string): PingResult {
    const lossMatch = raw.match(/(\d+)%\s+packet\s+loss/);
    const statsMatch = raw.match(/rtt\s+min\/avg\/max[^=]+=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/);
    const sentMatch = raw.match(/(\d+)\s+packets\s+transmitted/);
    const rcvMatch  = raw.match(/(\d+)\s+received/);

    const packet_loss_pct   = lossMatch  ? parseInt(lossMatch[1]!, 10) : 100;
    const packets_sent       = sentMatch ? parseInt(sentMatch[1]!, 10) : 0;
    const packets_received   = rcvMatch  ? parseInt(rcvMatch[1]!, 10)  : 0;

    return {
        host,
        packets_sent,
        packets_received,
        packet_loss_pct,
        rtt_min_ms: statsMatch ? parseFloat(statsMatch[1]!) : undefined,
        rtt_avg_ms: statsMatch ? parseFloat(statsMatch[2]!) : undefined,
        rtt_max_ms: statsMatch ? parseFloat(statsMatch[3]!) : undefined,
        reachable:  packet_loss_pct < 100,
    };
}

/**
 * Parses traceroute output into a list of TracerouteHop structs.
 */
export function parseTracerouteOutput(raw: string): TracerouteHop[] {
    const hops: TracerouteHop[] = [];
    for (const line of raw.split('\n')) {
        const m = line.match(/^\s*(\d+)\s+(\S+)\s+(?:\([\d.]+\))?\s+(?:([\d.]+)\s+ms)?/);
        if (!m) continue;
        hops.push({
            hop:     parseInt(m[1]!, 10),
            host:    m[2] === '*' ? 'timeout' : m[2]!,
            rtt_ms:  m[3] ? parseFloat(m[3]) : undefined,
            timeout: m[2] === '*',
        });
    }
    return hops;
}

/**
 * Parses dig output into a list of DnsRecord structs.
 */
export function parseDnsOutput(raw: string): DnsRecord[] {
    const records: DnsRecord[] = [];
    for (const line of raw.split('\n')) {
        if (line.startsWith(';') || !line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        records.push({
            name:  parts[0]!,
            ttl:   parseInt(parts[1]!, 10),
            type:  parts[3]!,
            value: parts.slice(4).join(' '),
        });
    }
    return records;
}

/**
 * Parses curl -w output (space-separated: status_code time_total size redirect_url).
 */
export function parseHttpCheckOutput(raw: string, url: string): HttpCheckResult {
    const parts    = raw.trim().split(/\s+/);
    const code     = parseInt(parts[0] ?? '0', 10);
    const time_ms  = Math.round(parseFloat(parts[1] ?? '0') * 1000);
    const size     = parseInt(parts[2] ?? '0', 10);
    const redirect = parts[3] ?? '';

    return {
        url,
        status_code:      code,
        response_time_ms: time_ms,
        content_length:   size || undefined,
        ok:               code >= 200 && code < 400,
        redirect_url:     redirect || undefined,
    };
}

/**
 * Parses openssl s_client -showcerts output for certificate metadata.
 */
export function parseSslCertOutput(raw: string): SslCertInfo | null {
    const subjectMatch   = raw.match(/subject=([^\n]+)/);
    const issuerMatch    = raw.match(/issuer=([^\n]+)/);
    const notBeforeMatch = raw.match(/notBefore=([^\n]+)/);
    const notAfterMatch  = raw.match(/notAfter=([^\n]+)/);
    const sanMatch       = raw.match(/DNS:([^\n,]+)/g);

    if (!notAfterMatch) return null;

    const notAfter   = new Date(notAfterMatch[1]!.trim());
    const now        = new Date();
    const daysLeft   = Math.floor((notAfter.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
        subject:           subjectMatch?.[1]?.trim() ?? '',
        issuer:            issuerMatch?.[1]?.trim() ?? '',
        not_before:        notBeforeMatch?.[1]?.trim() ?? '',
        not_after:         notAfterMatch[1]!.trim(),
        days_until_expiry: daysLeft,
        expired:           daysLeft < 0,
        san:               sanMatch?.map((s) => s.replace('DNS:', '').trim()),
    };
}

// ---------------------------------------------------------------------------
// Report formatter
// ---------------------------------------------------------------------------

export function formatNetDiagReport(params: {
    action:  string;
    host:    string;
    results: unknown;
}): string {
    const lines: string[] = [];
    lines.push(`# Network Diagnostic — ${params.action.toUpperCase()}`);
    lines.push(`**Target:** \`${params.host}\` | **Time:** ${new Date().toISOString()}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(params.results, null, 2).slice(0, 4000));
    lines.push('```');
    return lines.join('\n');
}
