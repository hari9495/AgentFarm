// ============================================================================
// DEVOPS LOAD TEST BUILDER
//
// Load and performance testing tooling:
//
//   k6        — Grafana k6 (JS, most cloud-native friendly, JSON output)
//   Gatling   — Scala-based, detailed HTML report, CI-friendly
//   JMeter    — XML JMX plans, widely adopted in enterprise
//
// All three support:
//   - Script generation via LLM
//   - CLI execution args
//   - Result parsing and comparison
//   - Threshold/regression detection
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoadTestTool = 'k6' | 'gatling' | 'jmeter';

export interface LoadTestScenario {
    name:         string;
    baseUrl:      string;
    endpoints:    Array<{
        method:      'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
        path:        string;
        body?:       string;         // JSON body string
        headers?:    Record<string, string>;
        expectedStatus?: number;     // default: 200
        name?:       string;
    }>;
    vus?:         number;            // virtual users (k6) / concurrent users (Gatling)
    duration?:    string;            // e.g. '5m' (k6) or '300' seconds (JMeter)
    rampUpTime?:  string;            // e.g. '30s' warm-up ramp
    thresholds?:  Array<{
        metric:    string;           // e.g. 'http_req_duration', 'error_rate'
        condition: string;           // e.g. 'p(99)<500', '<0.01'
    }>;
}

export interface LoadTestResult {
    tool:              LoadTestTool;
    scenarioName:      string;
    passedThresholds:  boolean;
    p50Ms?:            number;
    p90Ms?:            number;
    p95Ms?:            number;
    p99Ms?:            number;
    avgMs?:            number;
    maxMs?:            number;
    requestsPerSecond?: number;
    errorRate?:        number;     // fraction (0.01 = 1%)
    totalRequests?:    number;
    failedRequests?:   number;
    durationSeconds?:  number;
    raw?:              string;
}

// ---------------------------------------------------------------------------
// k6 script builder
// ---------------------------------------------------------------------------

/**
 * Generate a k6 JavaScript test script from a LoadTestScenario.
 * The script uses the k6 HTTP module and checks for expected status codes.
 */
export function buildK6Script(scenario: LoadTestScenario): string {
    const thresholdsObj: Record<string, string[]> = {};
    for (const t of scenario.thresholds ?? []) {
        const existing = thresholdsObj[t.metric] ?? [];
        existing.push(`'${t.condition}'`);
        thresholdsObj[t.metric] = existing;
    }
    const thresholdsJs = Object.entries(thresholdsObj).length > 0
        ? `thresholds: {\n    ${Object.entries(thresholdsObj).map(([k, v]) => `${k}: [${v.join(', ')}]`).join(',\n    ')}\n  },`
        : `thresholds: {\n    http_req_duration: ['p(95)<500'],\n    http_req_failed: ['rate<0.01'],\n  },`;

    const endpointJs = scenario.endpoints.map((ep, i) => {
        const headers = ep.headers
            ? `\n    const headers${i} = ${JSON.stringify(ep.headers)};`
            : '';
        const body    = ep.body ? `, ${ep.body}` : '';
        const method  = ep.method.toLowerCase();
        const headersArg = ep.headers ? `, headers${i}` : '';
        const checkName = ep.name ?? `${ep.method} ${ep.path}`;
        return `${headers}
    const res${i} = http.${method}(\`\${BASE_URL}${ep.path}\`${body}${headersArg});
    check(res${i}, { '${checkName} status ${ep.expectedStatus ?? 200}': (r) => r.status === ${ep.expectedStatus ?? 200} });
    sleep(0.1);`;
    }).join('\n');

    const vus      = scenario.vus ?? 10;
    const duration = scenario.duration ?? '5m';
    const rampUp   = scenario.rampUpTime ?? '30s';

    return `import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = '${scenario.baseUrl}';

export const options = {
  stages: [
    { duration: '${rampUp}', target: ${vus} },
    { duration: '${duration}', target: ${vus} },
    { duration: '15s', target: 0 },
  ],
  ${thresholdsJs}
};

export default function () {
  ${endpointJs}
}
`;
}

/**
 * Build k6 run CLI args.
 * Outputs JSON summary to a file for parsing.
 */
export function buildK6RunArgs(params: {
    scriptPath:   string;
    outputJson?:  string;      // path to write JSON summary (default: stdout)
    vus?:         number;
    duration?:    string;
    envVars?:     Record<string, string>;
    tags?:        Record<string, string>;
    cloud?:       boolean;     // run on Grafana Cloud k6
    quiet?:       boolean;
}): string[] {
    const cmd = params.cloud ? 'cloud' : 'run';
    const args = ['k6', cmd, params.scriptPath];
    if (!params.cloud) {
        args.push('--summary-export', params.outputJson ?? '/tmp/k6-summary.json');
    }
    if (params.vus)      args.push('--vus',      String(params.vus));
    if (params.duration) args.push('--duration', params.duration);
    if (params.quiet)    args.push('--quiet');
    for (const [k, v] of Object.entries(params.envVars ?? {})) args.push('-e', `${k}=${v}`);
    for (const [k, v] of Object.entries(params.tags   ?? {})) args.push('--tag', `${k}=${v}`);
    return args;
}

// ---------------------------------------------------------------------------
// Gatling builders
// ---------------------------------------------------------------------------

/**
 * Build Gatling run CLI args.
 * Assumes the Gatling bundle is installed and GATLING_HOME is set.
 */
export function buildGatlingArgs(params: {
    simulationClass: string;    // e.g. 'com.example.MySimulation'
    gatlingHome?:    string;
    resultsDir?:     string;
    jvmOpts?:        string;
    envVars?:        Record<string, string>;
}): string[] {
    const home = params.gatlingHome ?? (process.env['GATLING_HOME'] ?? '/opt/gatling');
    const args = [`${home}/bin/gatling.sh`,
        '-s', params.simulationClass,
        '-rf', params.resultsDir ?? './target/gatling'];
    if (params.jvmOpts) args.push('-jvm-opts', params.jvmOpts);
    return args;
}

export function buildGatlingMavenArgs(params: {
    simulationClass: string;
    resultsDir?:     string;
    mvnProfile?:     string;
}): string[] {
    const args = ['mvn', 'gatling:test',
        `-Dgatling.simulationClass=${params.simulationClass}`];
    if (params.resultsDir) args.push(`-Dgatling.resultsFolder=${params.resultsDir}`);
    if (params.mvnProfile) args.push('-P', params.mvnProfile);
    return args;
}

// ---------------------------------------------------------------------------
// JMeter builders
// ---------------------------------------------------------------------------

/**
 * Build JMeter CLI run args (non-GUI mode).
 */
export function buildJMeterArgs(params: {
    jmxPath:       string;      // path to the .jmx test plan
    resultsPath?:  string;      // .jtl results file
    reportDir?:    string;      // HTML report output dir
    properties?:   Record<string, string>;  // -J properties
    threads?:      number;      // override number of threads
    duration?:     number;      // override duration in seconds
    jmeterHome?:   string;
}): string[] {
    const home = params.jmeterHome ?? (process.env['JMETER_HOME'] ?? '/opt/jmeter');
    const args = [`${home}/bin/jmeter`, '-n', '-t', params.jmxPath];
    const resultsPath = params.resultsPath ?? '/tmp/jmeter-results.jtl';
    args.push('-l', resultsPath);
    if (params.reportDir) args.push('-e', '-o', params.reportDir);
    for (const [k, v] of Object.entries(params.properties ?? {})) args.push('-J', `${k}=${v}`);
    if (params.threads)  args.push('-Jthreads', String(params.threads));
    if (params.duration) args.push('-Jduration', String(params.duration));
    return args;
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

/**
 * Parse k6 JSON summary output (--summary-export).
 */
export function parseK6Output(raw: string, scenarioName: string): LoadTestResult {
    try {
        const json = JSON.parse(raw) as {
            metrics?: {
                http_req_duration?: { values?: { 'p(50)'?: number; 'p(90)'?: number; 'p(95)'?: number; 'p(99)'?: number; avg?: number; max?: number } };
                http_reqs?: { values?: { rate?: number; count?: number } };
                http_req_failed?: { values?: { rate?: number } };
            };
            state?: { testRunDurationMs?: number };
            thresholds?: Record<string, { ok?: boolean }>;
        };
        const dur   = json.metrics?.http_req_duration?.values;
        const reqs  = json.metrics?.http_reqs?.values;
        const fail  = json.metrics?.http_req_failed?.values;
        const passedThresholds = Object.values(json.thresholds ?? {}).every((t) => t.ok !== false);
        return {
            tool: 'k6', scenarioName, passedThresholds,
            p50Ms: dur?.['p(50)'],
            p90Ms: dur?.['p(90)'],
            p95Ms: dur?.['p(95)'],
            p99Ms: dur?.['p(99)'],
            avgMs: dur?.avg,
            maxMs: dur?.max,
            requestsPerSecond: reqs?.rate,
            totalRequests:     reqs?.count,
            errorRate:         fail?.rate,
            durationSeconds:   json.state?.testRunDurationMs ? json.state.testRunDurationMs / 1000 : undefined,
            raw: raw.slice(0, 2000),
        };
    } catch {
        return { tool: 'k6', scenarioName, passedThresholds: false, raw: raw.slice(0, 500) };
    }
}

/**
 * Parse Gatling simulation.log for key metrics.
 * Gatling's simulation.log is line-based with REQUEST entries.
 */
export function parseGatlingOutput(simulationLog: string, scenarioName: string): LoadTestResult {
    const lines   = simulationLog.split('\n');
    const reqLines = lines.filter((l) => l.startsWith('REQUEST'));
    const durations: number[] = [];
    let failed = 0;

    for (const line of reqLines) {
        const parts = line.split('\t');
        const status = parts[4] ?? '';
        const start  = parseInt(parts[2] ?? '0', 10);
        const end    = parseInt(parts[3] ?? '0', 10);
        const dur    = end - start;
        if (!isNaN(dur) && dur > 0) durations.push(dur);
        if (status === 'KO') failed++;
    }

    durations.sort((a, b) => a - b);
    const n        = durations.length;
    const p99idx   = Math.floor(n * 0.99);
    const p95idx   = Math.floor(n * 0.95);
    const p50idx   = Math.floor(n * 0.50);
    const avg      = n > 0 ? durations.reduce((a, b) => a + b, 0) / n : undefined;

    return {
        tool: 'gatling', scenarioName,
        passedThresholds: failed / Math.max(n, 1) < 0.01,
        p50Ms:  durations[p50idx],
        p95Ms:  durations[p95idx],
        p99Ms:  durations[p99idx],
        avgMs:  avg,
        maxMs:  durations[n - 1],
        totalRequests:  n,
        failedRequests: failed,
        errorRate:      n > 0 ? failed / n : 0,
    };
}

// ---------------------------------------------------------------------------
// Benchmark comparison (regression detection)
// ---------------------------------------------------------------------------

export interface BenchmarkComparison {
    scenario:     string;
    baselineP99:  number;
    currentP99:   number;
    deltaMs:      number;
    deltaPercent: number;
    regression:   boolean;   // true if current is >10% worse than baseline
    errorRateDelta: number;
}

export function compareBenchmarks(baseline: LoadTestResult, current: LoadTestResult, regressionThresholdPercent = 10): BenchmarkComparison {
    const baseP99 = baseline.p99Ms ?? 0;
    const currP99 = current.p99Ms  ?? 0;
    const deltaMs = currP99 - baseP99;
    const deltaPercent = baseP99 > 0 ? (deltaMs / baseP99) * 100 : 0;

    return {
        scenario:       current.scenarioName,
        baselineP99:    baseP99,
        currentP99:     currP99,
        deltaMs,
        deltaPercent,
        regression:     deltaPercent > regressionThresholdPercent,
        errorRateDelta: (current.errorRate ?? 0) - (baseline.errorRate ?? 0),
    };
}

// ---------------------------------------------------------------------------
// Formatted report
// ---------------------------------------------------------------------------

export function formatLoadTestReport(result: LoadTestResult): string {
    const lines = [
        `Load test: ${result.scenarioName} (${result.tool})`,
        `Thresholds: ${result.passedThresholds ? 'PASSED ✓' : 'FAILED ✗'}`,
        result.p50Ms  !== undefined ? `p50:    ${result.p50Ms.toFixed(0)} ms` : '',
        result.p95Ms  !== undefined ? `p95:    ${result.p95Ms.toFixed(0)} ms` : '',
        result.p99Ms  !== undefined ? `p99:    ${result.p99Ms.toFixed(0)} ms` : '',
        result.avgMs  !== undefined ? `avg:    ${result.avgMs.toFixed(0)} ms` : '',
        result.maxMs  !== undefined ? `max:    ${result.maxMs.toFixed(0)} ms` : '',
        result.requestsPerSecond !== undefined ? `RPS:    ${result.requestsPerSecond.toFixed(1)}` : '',
        result.errorRate !== undefined ? `errors: ${(result.errorRate * 100).toFixed(2)}%` : '',
        result.totalRequests !== undefined ? `total:  ${result.totalRequests} requests` : '',
    ];
    return lines.filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// LLM prompts for script generation
// ---------------------------------------------------------------------------

export function buildK6ScriptPrompt(params: {
    scenario:    LoadTestScenario;
    description: string;
    advanced?:   boolean;   // include scenarios, groups, custom metrics
}): string {
    const endpointList = params.scenario.endpoints.map((e) =>
        `  - ${e.method} ${e.path}${e.body ? ` (body: ${e.body.slice(0, 80)})` : ''}`
    ).join('\n');

    return [
        `Generate a production-quality k6 load test script for the following scenario.`,
        ``,
        `Scenario: ${params.scenario.name}`,
        `Base URL: ${params.scenario.baseUrl}`,
        `Description: ${params.description}`,
        `VUs: ${params.scenario.vus ?? 10}`,
        `Duration: ${params.scenario.duration ?? '5m'}`,
        `Ramp-up: ${params.scenario.rampUpTime ?? '30s'}`,
        ``,
        `Endpoints to test:`,
        endpointList,
        ``,
        params.advanced ? [
            `Advanced requirements:`,
            `  - Use k6 scenarios (ramping-vus or constant-arrival-rate)`,
            `  - Custom metrics: counter, gauge, trend for business metrics`,
            `  - Group requests logically`,
            `  - Parameterize data using SharedArray`,
        ].join('\n') : '',
        ``,
        `Thresholds (must pass for CI gate):`,
        `  - p(95) < 500ms`,
        `  - http_req_failed rate < 1%`,
        ``,
        `Return a JSON array: [{ "filename": "${params.scenario.name}.js", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function buildGatlingScriptPrompt(params: {
    scenario:      LoadTestScenario;
    description:   string;
    packageName?:  string;
}): string {
    const pkg  = params.packageName ?? 'com.agentfarm.loadtest';
    const endpointList = params.scenario.endpoints.map((e) =>
        `  - ${e.method} ${e.path}${e.body ? ` (body: ${e.body.slice(0, 80)})` : ''}`
    ).join('\n');

    return [
        `Generate a Gatling Scala simulation for the following load test scenario.`,
        ``,
        `Scenario: ${params.scenario.name}`,
        `Base URL: ${params.scenario.baseUrl}`,
        `Description: ${params.description}`,
        `Package: ${pkg}`,
        `Users: ${params.scenario.vus ?? 10}`,
        `Duration: ${params.scenario.duration ?? '300'} seconds`,
        ``,
        `Endpoints:`,
        endpointList,
        ``,
        `Requirements:`,
        `  - Use Gatling 3.9 DSL`,
        `  - HTTP protocol with baseUrl, headers`,
        `  - Assertions: global responseTime percentile3 < 500ms, global failedRequests percent < 1`,
        `  - Ramp from 1 to ${params.scenario.vus ?? 10} users over ${params.scenario.rampUpTime ?? '30s'}`,
        ``,
        `Return a JSON array: [{ "filename": "${params.scenario.name}Simulation.scala", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseLoadTestScriptOutput(raw: string): Array<{ filename: string; content: string }> {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const parsed  = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .filter((item) => typeof item['filename'] === 'string' && typeof item['content'] === 'string')
            .map((item) => ({ filename: item['filename'] as string, content: item['content'] as string }));
    } catch {
        return [];
    }
}
