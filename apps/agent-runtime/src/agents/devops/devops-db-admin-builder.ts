// ============================================================================
// DEVOPS DATABASE ADMIN BUILDER
//
// Advanced DBA operations executed via kubectl exec into database pods:
//
//   PostgreSQL  — EXPLAIN ANALYZE, index advisor, VACUUM, locks, table bloat
//   Patroni     — HA cluster status, controlled switchover/failover
//   Replication — lag monitoring (streaming + logical)
//   Data masking — pg_dump with exclusions, anonymization extension
//
// All operations go through kubectl exec so no direct DB network access
// from the agent host is required.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DbEngine = 'postgres' | 'mysql' | 'redis' | 'mongo';

export interface ExplainPlan {
    planType:            string;
    totalCost:           number;
    actualTotalTime?:    number;
    planRows:            number;
    actualRows?:         number;
    sharedHitBlocks?:    number;
    sharedReadBlocks?:   number;
    seqScans:            number;
    indexScans:          number;
    loops?:              number;
    raw:                 string;
}

export interface IndexSuggestion {
    table:    string;
    columns:  string[];
    reason:   string;
    impact:   'high' | 'medium' | 'low';
}

export interface PatroniMember {
    name:       string;
    role:       'Leader' | 'Replica' | 'Standby Leader';
    state:      string;
    lagMb?:     number;
    timeline?:  number;
    host:       string;
}

export interface PatroniStatus {
    cluster:    string;
    members:    PatroniMember[];
    leader?:    string;
    healthy:    boolean;
}

export interface LockInfo {
    pid:         number;
    duration:    string;
    waitingPid?: number;
    lockType:    string;
    relation?:   string;
    query?:      string;
}

// ---------------------------------------------------------------------------
// PostgreSQL EXPLAIN ANALYZE
// ---------------------------------------------------------------------------

export function buildExplainAnalyzeArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    query:     string;
    user?:     string;
    container?: string;
}): string[] {
    const user = params.user ?? 'postgres';
    const sql  = `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON) ${params.query}`;
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'psql', '-U', user, '-d', params.database, '-t', '-c', sql);
    return args;
}

// ---------------------------------------------------------------------------
// Index advisor (queries pg_stat_user_indexes + pg_stat_user_tables)
// ---------------------------------------------------------------------------

const INDEX_ADVISOR_SQL = `
SELECT
  t.schemaname,
  t.relname AS table_name,
  t.seq_scan,
  t.seq_tup_read,
  t.idx_scan,
  t.n_live_tup,
  t.n_dead_tup,
  ROUND(t.n_dead_tup::numeric / NULLIF(t.n_live_tup + t.n_dead_tup, 0) * 100, 2) AS dead_pct,
  pg_size_pretty(pg_total_relation_size(t.relid)) AS total_size
FROM pg_stat_user_tables t
WHERE t.seq_scan > 50
ORDER BY t.seq_tup_read DESC
LIMIT 20;
`.trim();

const MISSING_INDEXES_SQL = `
SELECT
  schemaname,
  tablename,
  attname AS column_name,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND n_distinct > 100
  AND correlation < 0.1
ORDER BY n_distinct DESC
LIMIT 20;
`.trim();

export function buildIndexAdvisorArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    user?:     string;
    container?: string;
}): string[] {
    const user = params.user ?? 'postgres';
    const sql  = INDEX_ADVISOR_SQL + '\n' + MISSING_INDEXES_SQL;
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'psql', '-U', user, '-d', params.database, '-c', sql);
    return args;
}

// ---------------------------------------------------------------------------
// VACUUM / ANALYZE
// ---------------------------------------------------------------------------

export function buildVacuumAnalyzeArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    table?:    string;        // if omitted: VACUUM ANALYZE all tables
    verbose?:  boolean;
    full?:     boolean;       // VACUUM FULL — requires exclusive lock
    user?:     string;
    container?: string;
}): string[] {
    const user = params.user ?? 'postgres';
    const opts = [
        params.full    ? 'FULL'    : '',
        params.verbose ? 'VERBOSE' : '',
        'ANALYZE',
    ].filter(Boolean).join(', ');
    const sql  = `VACUUM (${opts})${params.table ? ` ${params.table}` : ''};`;
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'psql', '-U', user, '-d', params.database, '-c', sql);
    return args;
}

// ---------------------------------------------------------------------------
// Lock monitoring
// ---------------------------------------------------------------------------

const SHOW_LOCKS_SQL = `
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state,
  wait_event_type,
  wait_event,
  pg_blocking_pids(pid) AS blocked_by
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0
   OR wait_event_type = 'Lock'
ORDER BY duration DESC NULLS LAST
LIMIT 30;
`.trim();

export function buildShowLocksArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    user?:     string;
    container?: string;
}): string[] {
    const user = params.user ?? 'postgres';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'psql', '-U', user, '-d', params.database, '-c', SHOW_LOCKS_SQL);
    return args;
}

/** Kill a blocking backend by PID. */
export function buildKillBackendArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    pid:       number;
    force?:    boolean;      // pg_terminate_backend vs pg_cancel_backend
    user?:     string;
    container?: string;
}): string[] {
    const user = params.user ?? 'postgres';
    const fn   = params.force ? 'pg_terminate_backend' : 'pg_cancel_backend';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'psql', '-U', user, '-d', params.database, '-c', `SELECT ${fn}(${params.pid});`);
    return args;
}

// ---------------------------------------------------------------------------
// Table bloat
// ---------------------------------------------------------------------------

const TABLE_BLOAT_SQL = `
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename))       AS table_size,
  n_dead_tup,
  n_live_tup,
  ROUND(100 * n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS bloat_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC
LIMIT 20;
`.trim();

export function buildTableBloatArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    user?:     string;
    container?: string;
}): string[] {
    const user = params.user ?? 'postgres';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'psql', '-U', user, '-d', params.database, '-c', TABLE_BLOAT_SQL);
    return args;
}

// ---------------------------------------------------------------------------
// Patroni builders
// ---------------------------------------------------------------------------

export function buildPatroniStatusArgs(params: {
    pod:       string;
    namespace: string;
    configFile?: string;    // default: /etc/patroni/patroni.yaml
    container?:  string;
}): string[] {
    const cfg  = params.configFile ?? '/etc/patroni/patroni.yaml';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'patronictl', '-c', cfg, 'list', '--format', 'json');
    return args;
}

export function buildPatroniSwitchoverArgs(params: {
    pod:        string;
    namespace:  string;
    cluster:    string;
    leader:     string;
    candidate?: string;
    scheduled?: string;     // ISO timestamp for scheduled switchover
    configFile?: string;
    container?:  string;
}): string[] {
    const cfg  = params.configFile ?? '/etc/patroni/patroni.yaml';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'patronictl', '-c', cfg, 'switchover', params.cluster,
        '--master', params.leader, '--force');
    if (params.candidate) args.push('--candidate', params.candidate);
    if (params.scheduled) args.push('--scheduled', params.scheduled);
    return args;
}

export function buildPatroniFailoverArgs(params: {
    pod:        string;
    namespace:  string;
    cluster:    string;
    candidate?: string;
    configFile?: string;
    container?:  string;
}): string[] {
    const cfg  = params.configFile ?? '/etc/patroni/patroni.yaml';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'patronictl', '-c', cfg, 'failover', params.cluster, '--force');
    if (params.candidate) args.push('--candidate', params.candidate);
    return args;
}

export function buildPatroniPauseResumeArgs(params: {
    pod:       string;
    namespace: string;
    cluster:   string;
    action:    'pause' | 'resume';
    configFile?: string;
    container?:  string;
}): string[] {
    const cfg  = params.configFile ?? '/etc/patroni/patroni.yaml';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'patronictl', '-c', cfg, params.action, params.cluster);
    return args;
}

// ---------------------------------------------------------------------------
// Replication lag
// ---------------------------------------------------------------------------

const REPLICATION_LAG_SQL = `
SELECT
  application_name,
  client_addr,
  state,
  sync_state,
  pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn)    AS send_lag_bytes,
  pg_wal_lsn_diff(sent_lsn, write_lsn)                AS write_lag_bytes,
  pg_wal_lsn_diff(write_lsn, flush_lsn)               AS flush_lag_bytes,
  pg_wal_lsn_diff(flush_lsn, replay_lsn)              AS replay_lag_bytes,
  write_lag,
  flush_lag,
  replay_lag
FROM pg_stat_replication
ORDER BY replay_lag DESC NULLS LAST;
`.trim();

export function buildReplicationLagArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    user?:     string;
    container?: string;
}): string[] {
    const user = params.user ?? 'postgres';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'psql', '-U', user, '-d', params.database, '-c', REPLICATION_LAG_SQL);
    return args;
}

// ---------------------------------------------------------------------------
// Data masking via pg_dump
// ---------------------------------------------------------------------------

export function buildMaskedDumpArgs(params: {
    pod:              string;
    namespace:        string;
    database:         string;
    outputPath:       string;
    excludeTables?:   string[];    // tables containing PII to exclude entirely
    user?:            string;
    container?:       string;
}): string[] {
    const user = params.user ?? 'postgres';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'pg_dump', '-U', user, '-d', params.database,
        '-Fc', '-f', params.outputPath, '--no-owner', '--no-acl');
    for (const table of params.excludeTables ?? []) {
        args.push('--exclude-table', table);
    }
    return args;
}

// ---------------------------------------------------------------------------
// Slow query log
// ---------------------------------------------------------------------------

const SLOW_QUERIES_SQL = `
SELECT
  query,
  calls,
  total_exec_time::bigint AS total_ms,
  mean_exec_time::bigint  AS mean_ms,
  max_exec_time::bigint   AS max_ms,
  rows,
  shared_blks_hit,
  shared_blks_read
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
`.trim();

export function buildSlowQueryArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    user?:     string;
    container?: string;
}): string[] {
    const user = params.user ?? 'postgres';
    const args = ['kubectl', 'exec', params.pod, '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    args.push('--', 'psql', '-U', user, '-d', params.database, '-c', SLOW_QUERIES_SQL);
    return args;
}

// ---------------------------------------------------------------------------
// LLM prompts
// ---------------------------------------------------------------------------

export function buildExplainAnalysisPrompt(params: {
    query:       string;
    explainJson: string;
    database:    string;
}): string {
    return [
        `You are a PostgreSQL DBA. Analyze the following EXPLAIN ANALYZE output and recommend optimizations.`,
        ``,
        `Database: ${params.database}`,
        `Query:`,
        params.query,
        ``,
        `EXPLAIN ANALYZE (JSON):`,
        params.explainJson.slice(0, 4000),
        ``,
        `Provide:`,
        `  1. What the query is doing (join strategy, scan type)`,
        `  2. The performance bottleneck`,
        `  3. Specific index recommendation (include CREATE INDEX statement if applicable)`,
        `  4. Any query rewrite suggestions`,
        `  5. Expected improvement estimate`,
        ``,
        `Return JSON: { "bottleneck": string, "index_sql": string|null, "rewrite_sql": string|null, "estimated_improvement": string, "explanation": string }`,
        `Return ONLY the JSON — no markdown fences.`,
    ].join('\n');
}

export function buildIndexAdvisorPrompt(params: {
    database:    string;
    tableStats:  string;
    slowQueries?: string;
}): string {
    return [
        `You are a PostgreSQL DBA. Analyze the following table statistics and recommend missing indexes.`,
        ``,
        `Database: ${params.database}`,
        ``,
        `Table scan statistics:`,
        params.tableStats.slice(0, 3000),
        params.slowQueries ? `\nSlowest queries (pg_stat_statements):\n${params.slowQueries.slice(0, 2000)}` : '',
        ``,
        `Return a JSON array of index recommendations:`,
        `[{ "table": string, "columns": string[], "type": "btree"|"gin"|"gist"|"hash", "create_sql": string, "reason": string, "impact": "high"|"medium"|"low" }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseExplainOutput(raw: string): ExplainPlan {
    try {
        const json = JSON.parse(raw.trim()) as Array<{ 'Query Text'?: string; Plan?: Record<string, unknown> }>;
        const plan = json[0]?.Plan ?? {};
        let seqScans = 0;
        let idxScans = 0;
        const walk = (node: Record<string, unknown>) => {
            if (node['Node Type'] === 'Seq Scan')   seqScans++;
            if (String(node['Node Type']).includes('Index')) idxScans++;
            for (const child of (node['Plans'] as Record<string, unknown>[] | undefined) ?? []) walk(child);
        };
        walk(plan);
        return {
            planType:          String(plan['Node Type'] ?? 'Unknown'),
            totalCost:         Number(plan['Total Cost'] ?? 0),
            actualTotalTime:   plan['Actual Total Time'] !== undefined ? Number(plan['Actual Total Time']) : undefined,
            planRows:          Number(plan['Plan Rows'] ?? 0),
            actualRows:        plan['Actual Rows'] !== undefined ? Number(plan['Actual Rows']) : undefined,
            sharedHitBlocks:   plan['Shared Hit Blocks']  !== undefined ? Number(plan['Shared Hit Blocks'])  : undefined,
            sharedReadBlocks:  plan['Shared Read Blocks'] !== undefined ? Number(plan['Shared Read Blocks']) : undefined,
            seqScans,
            indexScans:        idxScans,
            raw:               raw.slice(0, 3000),
        };
    } catch {
        return { planType: 'Unknown', totalCost: 0, planRows: 0, seqScans: 0, indexScans: 0, raw: raw.slice(0, 500) };
    }
}

export function parsePatroniStatus(raw: string): PatroniStatus {
    try {
        const json = JSON.parse(raw) as Array<{ Member?: string; Role?: string; State?: string; TL?: number; Lag?: number; Host?: string }>;
        const members: PatroniMember[] = json.map((m) => ({
            name:      m.Member   ?? '',
            role:      (m.Role     ?? 'Replica') as PatroniMember['role'],
            state:     m.State    ?? '',
            lagMb:     m.Lag,
            timeline:  m.TL,
            host:      m.Host     ?? '',
        }));
        const leader = members.find((m) => m.role === 'Leader')?.name;
        const healthy = members.every((m) => m.state === 'running' || m.state === 'streaming');
        return { cluster: '', members, leader, healthy };
    } catch {
        return { cluster: '', members: [], healthy: false };
    }
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export function formatDbAdminReport(params: {
    action:      string;
    result?:     string;
    patroni?:    PatroniStatus;
    explainPlan?: ExplainPlan;
}): string {
    const lines: string[] = [`DB Admin — ${params.action}`];
    if (params.patroni) {
        lines.push(`Patroni cluster: ${params.patroni.healthy ? 'HEALTHY' : 'DEGRADED'}`);
        lines.push(`Leader: ${params.patroni.leader ?? 'unknown'}`);
        for (const m of params.patroni.members) {
            lines.push(`  ${m.name} (${m.role}): ${m.state}${m.lagMb !== undefined ? `, lag=${m.lagMb}MB` : ''}`);
        }
    }
    if (params.explainPlan) {
        lines.push(`Plan type: ${params.explainPlan.planType}, cost=${params.explainPlan.totalCost.toFixed(0)}`);
        lines.push(`Seq scans: ${params.explainPlan.seqScans}  Index scans: ${params.explainPlan.indexScans}`);
        if (params.explainPlan.actualTotalTime !== undefined) {
            lines.push(`Actual time: ${params.explainPlan.actualTotalTime.toFixed(2)} ms`);
        }
    }
    if (params.result) lines.push(params.result.slice(0, 2000));
    return lines.join('\n');
}
