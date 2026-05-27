// ============================================================================
// DEVOPS CHAOS ENGINEERING BUILDER
//
// Chaos experiment management via:
//
//   Chaos Mesh   — PodChaos, NetworkChaos, StressChaos, DNSChaos CRD YAML
//   AWS FIS      — Fault Injection Simulator experiment templates + run
//   Litmus       — ChaosEngine + ChaosResult CRDs
//   Status/Stop  — kubectl get/delete chaos CRs, aws fis stop-experiment
//
// Destructive operations (applying chaos CRDs, starting FIS) always require
// allow_destructive: true.  All builders return string[] (CLI argv) or string
// (YAML), never shell strings with embedded variables.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChaosMeshKind =
    | 'PodChaos'
    | 'NetworkChaos'
    | 'StressChaos'
    | 'DNSChaos'
    | 'HTTPChaos'
    | 'IOChaos';

export type ChaosMeshAction =
    // PodChaos
    | 'pod-kill' | 'pod-failure' | 'container-kill'
    // NetworkChaos
    | 'delay' | 'loss' | 'duplicate' | 'corrupt' | 'partition'
    // StressChaos  — no action field; uses stressors
    // DNSChaos
    | 'error' | 'random';

export interface ChaosMeshSelectorSpec {
    namespaces?:    string[];
    labelSelectors?: Record<string, string>;
    pods?:          Record<string, string[]>;  // namespace → [pod names]
    fieldSelectors?: Record<string, string>;
}

export interface ChaosExperimentSpec {
    name:        string;
    namespace:   string;
    kind:        ChaosMeshKind;
    action?:     ChaosMeshAction;
    selector:    ChaosMeshSelectorSpec;
    duration?:   string;         // e.g. '30s', '5m'
    scheduler?:  string;         // cron expression
    mode?:       'one' | 'all' | 'fixed' | 'fixed-percent' | 'random-max-percent';
    value?:      string;         // count/percentage for fixed/percent modes
}

export interface NetworkChaosParams {
    latencyMs?:      number;
    jitterMs?:       number;
    lossPercent?:    number;
    correlationPct?: number;
    bandwidth?:      string;     // e.g. '1mbps'
    direction?:      'to' | 'from' | 'both';
    externalTargets?: string[];  // CIDRs or DNS names
}

export interface StressChaosParams {
    cpuWorkers?:    number;
    cpuLoad?:       number;     // 0-100 percent
    memoryWorkers?: number;
    memoryBytes?:   string;     // e.g. '256MB'
}

export interface FisExperimentTemplate {
    name:            string;
    description?:    string;
    targets:         Record<string, { resourceType: string; selectionMode: string; filters?: unknown[] }>;
    actions:         Record<string, { actionId: string; parameters?: Record<string, string>; targets?: Record<string, string> }>;
    stopConditions:  Array<{ source: string; value?: string }>;
    roleArn:         string;
    tags?:           Record<string, string>;
}

export interface ChaosResult {
    name:       string;
    namespace:  string;
    phase:      'Injected' | 'Recovered' | 'Failed' | 'Unknown';
    startTime?: string;
    endTime?:   string;
}

// ---------------------------------------------------------------------------
// Chaos Mesh YAML builders
// ---------------------------------------------------------------------------

function buildSelectorYaml(sel: ChaosMeshSelectorSpec, indent = 4): string {
    const pad = ' '.repeat(indent);
    const lines: string[] = [];
    if (sel.namespaces?.length) {
        lines.push(`${pad}namespaces:`);
        sel.namespaces.forEach((ns) => lines.push(`${pad}  - ${ns}`));
    }
    if (sel.labelSelectors && Object.keys(sel.labelSelectors).length) {
        lines.push(`${pad}labelSelectors:`);
        Object.entries(sel.labelSelectors).forEach(([k, v]) => lines.push(`${pad}  "${k}": "${v}"`));
    }
    if (sel.pods) {
        lines.push(`${pad}pods:`);
        Object.entries(sel.pods).forEach(([ns, pods]) => {
            lines.push(`${pad}  ${ns}:`);
            pods.forEach((p) => lines.push(`${pad}    - ${p}`));
        });
    }
    return lines.join('\n');
}

export function buildPodChaosYaml(params: {
    spec:    ChaosExperimentSpec;
    action:  'pod-kill' | 'pod-failure' | 'container-kill';
    containerName?: string;
    gracePeriod?:   number;
}): string {
    const mode     = params.spec.mode     ?? 'one';
    const duration = params.spec.duration ?? '30s';
    const selectorYaml = buildSelectorYaml(params.spec.selector);
    return `apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: ${params.spec.name}
  namespace: ${params.spec.namespace}
spec:
  action: ${params.action}
  mode: ${mode}${params.spec.value ? `\n  value: "${params.spec.value}"` : ''}
  duration: "${duration}"
  selector:
${selectorYaml}${params.containerName ? `\n  containerName: "${params.containerName}"` : ''}${params.gracePeriod !== undefined ? `\n  gracePeriod: ${params.gracePeriod}` : ''}`;
}

export function buildNetworkChaosYaml(params: {
    spec:    ChaosExperimentSpec;
    action:  'delay' | 'loss' | 'duplicate' | 'corrupt' | 'partition';
    network: NetworkChaosParams;
}): string {
    const mode     = params.spec.mode     ?? 'all';
    const duration = params.spec.duration ?? '60s';
    const dir      = params.network.direction ?? 'to';
    const selectorYaml = buildSelectorYaml(params.spec.selector);

    let networkSpec = '';
    if (params.action === 'delay') {
        networkSpec = `
  delay:
    latency: "${params.network.latencyMs ?? 100}ms"
    jitter: "${params.network.jitterMs ?? 10}ms"
    correlation: "${params.network.correlationPct ?? 25}"`;
    } else if (params.action === 'loss') {
        networkSpec = `
  loss:
    loss: "${params.network.lossPercent ?? 25}"
    correlation: "${params.network.correlationPct ?? 25}"`;
    } else if (params.action === 'corrupt') {
        networkSpec = `
  corrupt:
    corrupt: "${params.network.lossPercent ?? 5}"
    correlation: "${params.network.correlationPct ?? 25}"`;
    } else if (params.action === 'bandwidth') {
        networkSpec = `
  bandwidth:
    rate: "${params.network.bandwidth ?? '1mbps'}"`;
    }

    const externalTargets = params.network.externalTargets?.length
        ? `\n  externalTargets:\n` + params.network.externalTargets.map((t) => `  - ${t}`).join('\n')
        : '';

    return `apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: ${params.spec.name}
  namespace: ${params.spec.namespace}
spec:
  action: ${params.action}
  mode: ${mode}
  duration: "${duration}"
  direction: ${dir}
  selector:
${selectorYaml}${networkSpec}${externalTargets}`;
}

export function buildStressChaosYaml(params: {
    spec:    ChaosExperimentSpec;
    stress:  StressChaosParams;
}): string {
    const mode     = params.spec.mode     ?? 'all';
    const duration = params.spec.duration ?? '120s';
    const selectorYaml = buildSelectorYaml(params.spec.selector);

    const cpuStressor = params.stress.cpuWorkers
        ? `
    cpu:
      workers: ${params.stress.cpuWorkers}
      load: ${params.stress.cpuLoad ?? 100}`
        : '';

    const memStressor = params.stress.memoryWorkers
        ? `
    memory:
      workers: ${params.stress.memoryWorkers}
      size: "${params.stress.memoryBytes ?? '256MB'}"`
        : '';

    return `apiVersion: chaos-mesh.org/v1alpha1
kind: StressChaos
metadata:
  name: ${params.spec.name}
  namespace: ${params.spec.namespace}
spec:
  mode: ${mode}
  duration: "${duration}"
  selector:
${selectorYaml}
  stressors:${cpuStressor}${memStressor}`;
}

export function buildDnsChaosYaml(params: {
    spec:    ChaosExperimentSpec;
    action:  'error' | 'random';
    patterns?: string[];          // DNS patterns to target, e.g. ['google.com', '*.aws.com']
}): string {
    const mode     = params.spec.mode     ?? 'all';
    const duration = params.spec.duration ?? '60s';
    const selectorYaml = buildSelectorYaml(params.spec.selector);
    const patterns = params.patterns?.length
        ? `\n  patterns:\n` + params.patterns.map((p) => `  - ${p}`).join('\n')
        : '';
    return `apiVersion: chaos-mesh.org/v1alpha1
kind: DNSChaos
metadata:
  name: ${params.spec.name}
  namespace: ${params.spec.namespace}
spec:
  action: ${params.action}
  mode: ${mode}
  duration: "${duration}"
  selector:
${selectorYaml}${patterns}`;
}

// ---------------------------------------------------------------------------
// Chaos Mesh kubectl status / stop
// ---------------------------------------------------------------------------

export function buildChaosMeshListArgs(namespace: string, kind?: ChaosMeshKind): string[] {
    const resource = kind ? kind.toLowerCase() : 'podchaos,networkchaos,stresschaos,dnschaos';
    return ['kubectl', 'get', resource, '-n', namespace, '-o', 'json'];
}

export function buildChaosMeshDeleteArgs(params: {
    name:      string;
    namespace: string;
    kind:      ChaosMeshKind;
}): string[] {
    return ['kubectl', 'delete', params.kind.toLowerCase(), params.name, '-n', params.namespace];
}

export function buildChaosMeshPauseArgs(params: {
    name:      string;
    namespace: string;
    kind:      ChaosMeshKind;
}): string[] {
    return ['kubectl', 'annotate', params.kind.toLowerCase(), params.name,
        '-n', params.namespace,
        'experiment.chaos-mesh.org/pause=true',
        '--overwrite'];
}

export function buildChaosMeshResumeArgs(params: {
    name:      string;
    namespace: string;
    kind:      ChaosMeshKind;
}): string[] {
    return ['kubectl', 'annotate', params.kind.toLowerCase(), params.name,
        '-n', params.namespace,
        'experiment.chaos-mesh.org/pause-',
        '--overwrite'];
}

export function buildChaosMeshApplyArgs(namespace: string): string[] {
    // Caller writes YAML to a temp file; this applies it
    return ['kubectl', 'apply', '-n', namespace, '-f', '-'];
}

// ---------------------------------------------------------------------------
// AWS FIS (Fault Injection Simulator)
// ---------------------------------------------------------------------------

export function buildFisCreateTemplateArgs(params: {
    templateFile: string;  // path to JSON template file
    region?:      string;
    tags?:        Record<string, string>;
}): string[] {
    const args = ['aws', 'fis', 'create-experiment-template',
        '--cli-input-json', `file://${params.templateFile}`,
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

export function buildFisStartExperimentArgs(params: {
    templateId: string;
    tags?:      Record<string, string>;
    region?:    string;
}): string[] {
    const args = ['aws', 'fis', 'start-experiment',
        '--experiment-template-id', params.templateId,
        '--output', 'json'];
    if (params.tags && Object.keys(params.tags).length) {
        args.push('--tags', JSON.stringify(params.tags));
    }
    if (params.region) args.push('--region', params.region);
    return args;
}

export function buildFisStopExperimentArgs(experimentId: string, region?: string): string[] {
    const args = ['aws', 'fis', 'stop-experiment', '--id', experimentId, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

export function buildFisGetExperimentArgs(experimentId: string, region?: string): string[] {
    const args = ['aws', 'fis', 'get-experiment', '--id', experimentId, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

export function buildFisListExperimentsArgs(region?: string): string[] {
    const args = ['aws', 'fis', 'list-experiments', '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

export function buildFisListTemplatesArgs(region?: string): string[] {
    const args = ['aws', 'fis', 'list-experiment-templates', '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

/** Build a FIS EC2 instance-stop template JSON string. */
export function buildFisEc2StopTemplateJson(params: {
    name:        string;
    roleArn:     string;
    instanceIds: string[];
    region?:     string;
    durationSec?: number;
}): string {
    const template: FisExperimentTemplate = {
        name:        params.name,
        description: `Stop EC2 instances for chaos testing`,
        targets:     {
            'MyInstances': {
                resourceType:   'aws:ec2:instance',
                selectionMode:  'COUNT(1)',
                filters: [{ path: 'State.Name', values: ['running'] }],
            },
        },
        actions: {
            'StopInstances': {
                actionId: 'aws:ec2:stop-instances',
                parameters: { startInstancesAfterDuration: `PT${params.durationSec ?? 60}S` },
                targets: { Instances: 'MyInstances' },
            },
        },
        stopConditions: [{ source: 'none' }],
        roleArn: params.roleArn,
        tags: { Name: params.name },
    };
    return JSON.stringify(template, null, 2);
}

// ---------------------------------------------------------------------------
// Litmus CRDs
// ---------------------------------------------------------------------------

export function buildLitmusChaosEngineYaml(params: {
    name:          string;
    namespace:     string;
    appLabel:      string;
    appNs:         string;
    appKind:       string;             // Deployment, StatefulSet, etc.
    experiments:   string[];           // e.g. ['pod-delete', 'container-kill']
    serviceAccount?: string;
    annotationCheck?: boolean;
}): string {
    const expList = params.experiments.map((e) => `    - name: ${e}\n      spec:\n        components: {}`).join('\n');
    return `apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
spec:
  appinfo:
    appns: ${params.appNs}
    applabel: "${params.appLabel}"
    appkind: ${params.appKind}
  annotationCheck: '${params.annotationCheck ?? false}'
  engineState: 'active'
  chaosServiceAccount: ${params.serviceAccount ?? 'litmus-admin'}
  experiments:
${expList}`;
}

export function buildLitmusResultArgs(params: {
    engineName: string;
    namespace:  string;
    experiment: string;
}): string[] {
    return ['kubectl', 'get', 'chaosresult',
        `${params.engineName}-${params.experiment}`,
        '-n', params.namespace,
        '-o', 'json'];
}

export function buildLitmusStopArgs(engineName: string, namespace: string): string[] {
    return ['kubectl', 'patch', 'chaosengine', engineName,
        '-n', namespace,
        '--type=merge',
        '-p', '{"spec":{"engineState":"stop"}}'];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseChaosMeshResults(raw: string): ChaosResult[] {
    try {
        const json = JSON.parse(raw) as { items?: Array<Record<string, unknown>> };
        return (json.items ?? []).map((item) => {
            const meta   = (item['metadata'] ?? {}) as Record<string, unknown>;
            const status = (item['status']   ?? {}) as Record<string, unknown>;
            return {
                name:      String(meta['name']      ?? ''),
                namespace: String(meta['namespace'] ?? ''),
                phase:     (status['experiment'] as Record<string, unknown>)?.['phase'] as ChaosResult['phase'] ?? 'Unknown',
                startTime: meta['creationTimestamp'] ? String(meta['creationTimestamp']) : undefined,
            };
        });
    } catch {
        return [];
    }
}

export function parseFisExperiment(raw: string): {
    id: string;
    state: string;
    creationTime?: string;
} | null {
    try {
        const json = JSON.parse(raw) as { experiment?: Record<string, unknown> };
        const exp  = json.experiment ?? (json as Record<string, unknown>);
        return {
            id:           String(exp['id']   ?? ''),
            state:        String((exp['state'] as Record<string, string>)?.['status'] ?? exp['state'] ?? ''),
            creationTime: exp['creationTime'] ? String(exp['creationTime']) : undefined,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

export function buildChaosPrompt(params: {
    description:   string;
    target:        string;       // service or component name
    hypothesis:    string;       // steady-state hypothesis
    currentState?: string;
    provider?:     'chaos-mesh' | 'fis' | 'litmus';
}): string {
    return [
        `You are a chaos engineering specialist. Design a chaos experiment for the following scenario.`,
        ``,
        `Service/Component: ${params.target}`,
        `Description: ${params.description}`,
        `Steady-state hypothesis: ${params.hypothesis}`,
        params.currentState ? `Current system state:\n${params.currentState.slice(0, 1000)}\n` : '',
        `Preferred platform: ${params.provider ?? 'chaos-mesh'}`,
        ``,
        `Design:`,
        `  1. A minimal blast-radius experiment to verify the steady-state hypothesis`,
        `  2. The exact YAML or CLI commands to run the experiment`,
        `  3. The rollback / stop procedure`,
        `  4. Observable metrics to watch during the experiment`,
        ``,
        `Return JSON:`,
        `{`,
        `  "name": string,`,
        `  "hypothesis": string,`,
        `  "experiment_type": string,`,
        `  "yaml": string | null,`,
        `  "commands": string[],`,
        `  "rollback_commands": string[],`,
        `  "metrics_to_watch": string[],`,
        `  "expected_impact": string,`,
        `  "abort_condition": string`,
        `}`,
        `Return ONLY the JSON object — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function parseChaosDesign(raw: string): {
    name:             string;
    hypothesis:       string;
    experimentType:   string;
    yaml:             string | null;
    commands:         string[];
    rollbackCommands: string[];
    metricsToWatch:   string[];
    expectedImpact:   string;
    abortCondition:   string;
} | null {
    try {
        const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const j = JSON.parse(cleaned) as Record<string, unknown>;
        return {
            name:             String(j['name']             ?? ''),
            hypothesis:       String(j['hypothesis']       ?? ''),
            experimentType:   String(j['experiment_type']  ?? ''),
            yaml:             j['yaml'] ? String(j['yaml']) : null,
            commands:         Array.isArray(j['commands'])          ? j['commands'].map(String)          : [],
            rollbackCommands: Array.isArray(j['rollback_commands']) ? j['rollback_commands'].map(String) : [],
            metricsToWatch:   Array.isArray(j['metrics_to_watch'])  ? j['metrics_to_watch'].map(String)  : [],
            expectedImpact:   String(j['expected_impact']  ?? ''),
            abortCondition:   String(j['abort_condition']  ?? ''),
        };
    } catch {
        return null;
    }
}

export function formatChaosReport(params: {
    experiment:  string;
    phase:       string;
    results?:    ChaosResult[];
    design?:     ReturnType<typeof parseChaosDesign>;
}): string {
    const lines = [
        `Chaos Experiment Report — ${params.experiment}`,
        `Phase: ${params.phase}`,
    ];
    if (params.design) {
        lines.push(`Hypothesis: ${params.design.hypothesis}`);
        lines.push(`Type: ${params.design.experimentType}`);
        lines.push(`Expected impact: ${params.design.expectedImpact}`);
        lines.push(`Abort condition: ${params.design.abortCondition}`);
        if (params.design.metricsToWatch.length) {
            lines.push(`Metrics to watch:`);
            params.design.metricsToWatch.forEach((m) => lines.push(`  - ${m}`));
        }
    }
    if (params.results?.length) {
        lines.push(``, `Active experiments: ${params.results.length}`);
        params.results.forEach((r) => lines.push(`  ${r.name} (${r.namespace}): ${r.phase}`));
    }
    return lines.join('\n');
}
