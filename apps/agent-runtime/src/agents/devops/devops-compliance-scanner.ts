// ============================================================================
// DEVOPS COMPLIANCE SCANNER
//
// CIS benchmark and runtime security tooling:
//
//   kube-bench   — run CIS Kubernetes Benchmark checks against the cluster
//   Falco        — runtime security rules, daemon health, alert log parsing
//   Custom rules — generate Falco rule YAML from a description via LLM
//
// kube-bench can run as a Job in the cluster or locally against a kubeconfig.
// Falco rules are applied as a ConfigMap that the DaemonSet picks up.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComplianceTarget = 'master' | 'node' | 'etcd' | 'controlplane' | 'policies' | 'all';
export type FalcoRulePriority = 'EMERGENCY' | 'ALERT' | 'CRITICAL' | 'ERROR' | 'WARNING' | 'NOTICE' | 'INFORMATIONAL' | 'DEBUG';

export interface KubeBenchResult {
    id:        string;
    text:      string;
    tests:     KubeBenchTest[];
    totalPass: number;
    totalFail: number;
    totalWarn: number;
    totalInfo: number;
}

export interface KubeBenchTest {
    id:       string;
    desc:     string;
    result:   'PASS' | 'FAIL' | 'WARN' | 'INFO';
    reason?:  string;
    remediation?: string;
}

export interface FalcoRule {
    rule:        string;         // rule name
    desc:        string;         // human description
    condition:   string;         // Falco condition (sysdig filter)
    output:      string;         // output string (fields to log)
    priority:    FalcoRulePriority;
    tags?:       string[];       // e.g. ['container', 'process', 'network']
    enabled?:    boolean;        // default: true
    exceptions?: FalcoException[];
}

export interface FalcoException {
    name:   string;
    fields: string[];
    comps:  string[];
    values: string[][];
}

export interface FalcoAlert {
    time:      string;
    rule:      string;
    priority:  FalcoRulePriority;
    output:    string;
    fields:    Record<string, string>;
}

// ---------------------------------------------------------------------------
// kube-bench CLI builders
// ---------------------------------------------------------------------------

/**
 * Build `kube-bench run` args.
 * kube-bench auto-detects the node type if --targets is omitted.
 */
export function buildKubeBenchArgs(params?: {
    targets?:    ComplianceTarget[];
    outputFormat?: 'text' | 'json' | 'junit';
    configDir?:  string;
    version?:    string;   // K8s version override, e.g. '1.28'
    benchmarkVersion?: string;  // CIS benchmark version override
}): string[] {
    const args = ['kube-bench', 'run'];
    if (params?.targets?.length) {
        args.push('--targets', params.targets.filter((t) => t !== 'all').join(','));
    }
    args.push('--outputfile', '/dev/stdout');
    const fmt = params?.outputFormat ?? 'json';
    args.push(fmt === 'json' ? '--json' : fmt === 'junit' ? '--junit' : '--noremediations');
    if (params?.configDir)       args.push('--config-dir', params.configDir);
    if (params?.version)         args.push('--version', params.version);
    if (params?.benchmarkVersion) args.push('--benchmark', params.benchmarkVersion);
    return args;
}

/**
 * Build args to run kube-bench as a one-shot Kubernetes Job.
 * Returns the Job YAML content.
 */
export function buildKubeBenchJobYaml(params?: {
    namespace?:      string;
    imageTag?:       string;     // aquasec/kube-bench image tag
    targets?:        ComplianceTarget[];
    serviceAccount?: string;
}): string {
    const ns        = params?.namespace ?? 'kube-system';
    const image     = `aquasec/kube-bench:${params?.imageTag ?? 'latest'}`;
    const targetArg = params?.targets?.length
        ? `["--targets", "${params.targets.filter((t) => t !== 'all').join(',')}"]`
        : '[]';

    return `apiVersion: batch/v1
kind: Job
metadata:
  name: kube-bench
  namespace: ${ns}
  labels:
    app.kubernetes.io/name: kube-bench
    app.kubernetes.io/component: compliance-scan
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      serviceAccountName: ${params?.serviceAccount ?? 'kube-bench'}
      hostPID: true
      containers:
        - name: kube-bench
          image: ${image}
          command: ["kube-bench", "run", "--json"]
          args: ${targetArg}
          volumeMounts:
            - name: var-lib-etcd
              mountPath: /var/lib/etcd
              readOnly: true
            - name: var-lib-kubelet
              mountPath: /var/lib/kubelet
              readOnly: true
            - name: etc-systemd
              mountPath: /etc/systemd
              readOnly: true
            - name: etc-kubernetes
              mountPath: /etc/kubernetes
              readOnly: true
      volumes:
        - name: var-lib-etcd
          hostPath:
            path: /var/lib/etcd
        - name: var-lib-kubelet
          hostPath:
            path: /var/lib/kubelet
        - name: etc-systemd
          hostPath:
            path: /etc/systemd
        - name: etc-kubernetes
          hostPath:
            path: /etc/kubernetes`;
}

/**
 * Build kubectl args to retrieve kube-bench Job logs.
 */
export function buildKubeBenchLogsArgs(namespace = 'kube-system'): string[] {
    return ['kubectl', 'logs', '-n', namespace, '-l', 'app.kubernetes.io/name=kube-bench', '--tail=-1'];
}

// ---------------------------------------------------------------------------
// Falco CLI / kubectl builders
// ---------------------------------------------------------------------------

/** Check Falco DaemonSet health. */
export function buildFalcoStatusArgs(namespace = 'falco'): string[] {
    return ['kubectl', 'get', 'daemonset', 'falco', '-n', namespace, '-o', 'json'];
}

/** Tail Falco alert logs from a pod. */
export function buildFalcoLogsArgs(namespace = 'falco', tail = 200): string[] {
    return ['kubectl', 'logs', '-n', namespace, '-l', 'app.kubernetes.io/name=falco', `--tail=${tail}`];
}

/** Apply a Falco custom rules ConfigMap. */
export function buildFalcoRulesApplyArgs(configMapName: string, namespace = 'falco'): string[] {
    return ['kubectl', 'apply', '-f', configMapName, '-n', namespace];
}

/** Restart Falco DaemonSet pods to pick up new rules. */
export function buildFalcoRestartArgs(namespace = 'falco'): string[] {
    return ['kubectl', 'rollout', 'restart', 'daemonset/falco', '-n', namespace];
}

// ---------------------------------------------------------------------------
// Falco rule YAML builder
// ---------------------------------------------------------------------------

/**
 * Generate a Falco custom rules YAML string from typed rule definitions.
 */
export function buildFalcoRulesYaml(rules: FalcoRule[]): string {
    const rulesYaml = rules.map((r) => {
        const lines: string[] = [
            `- rule: ${r.rule}`,
            `  desc: ${r.desc}`,
            `  condition: ${r.condition}`,
            `  output: "${r.output}"`,
            `  priority: ${r.priority}`,
        ];
        if (r.tags?.length) lines.push(`  tags: [${r.tags.join(', ')}]`);
        if (r.enabled === false) lines.push(`  enabled: false`);
        if (r.exceptions?.length) {
            lines.push(`  exceptions:`);
            for (const ex of r.exceptions) {
                lines.push(`    - name: ${ex.name}`);
                lines.push(`      fields: [${ex.fields.join(', ')}]`);
                lines.push(`      comps: [${ex.comps.join(', ')}]`);
            }
        }
        return lines.join('\n');
    }).join('\n\n');

    return rulesYaml;
}

/**
 * Wrap Falco rules YAML in a Kubernetes ConfigMap for deployment.
 */
export function buildFalcoRulesConfigMapYaml(rules: FalcoRule[], params: {
    name:      string;
    namespace: string;
    filename?: string;
}): string {
    const rulesYaml = buildFalcoRulesYaml(rules).split('\n').map((l) => `    ${l}`).join('\n');
    const fname = params.filename ?? 'custom_rules.yaml';
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${params.name}
  namespace: ${params.namespace}
  labels:
    app.kubernetes.io/name: falco
    app.kubernetes.io/component: custom-rules
data:
  ${fname}: |
${rulesYaml}`;
}

// ---------------------------------------------------------------------------
// Common Falco rules library
// ---------------------------------------------------------------------------

/** Predefined hardened Falco rules covering the most common threats. */
export const FALCO_HARDENED_RULES: FalcoRule[] = [
    {
        rule:      'shell-in-container',
        desc:      'Detect shell spawned in a container',
        condition: 'spawned_process and container and proc.name in (bash, sh, zsh, ash, dash, ksh) and not proc.pname in (runc, containerd-shim, docker)',
        output:    'Shell spawned in container (container=%container.name user=%user.name cmd=%proc.cmdline)',
        priority:  'WARNING',
        tags:      ['container', 'process', 'mitre_execution'],
    },
    {
        rule:      'write-below-etc',
        desc:      'Detect file write below /etc in a container',
        condition: 'container and open_write and fd.name startswith /etc',
        output:    'File written below /etc in container (container=%container.name file=%fd.name)',
        priority:  'ERROR',
        tags:      ['container', 'filesystem'],
    },
    {
        rule:      'sensitive-mount',
        desc:      'Detect container mounting host sensitive path',
        condition: 'container and evt.type = mount and fd.name in (/proc, /sys, /dev, /var/run/docker.sock)',
        output:    'Sensitive mount in container (container=%container.name mount=%fd.name)',
        priority:  'CRITICAL',
        tags:      ['container', 'cis'],
    },
    {
        rule:      'outbound-connection-to-unexpected-destination',
        desc:      'Detect unexpected outbound network connections',
        condition: 'outbound and container and not fd.net in (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)',
        output:    'Unexpected outbound connection (container=%container.name dst=%fd.rip:%fd.rport)',
        priority:  'NOTICE',
        tags:      ['network', 'container'],
    },
    {
        rule:      'privilege-escalation',
        desc:      'Detect setuid or setgid bits set on a file',
        condition: 'container and open_write and (fd.name endswith setuid or (evt.arg.mode contains S_ISUID or evt.arg.mode contains S_ISGID))',
        output:    'Privilege escalation attempt (container=%container.name file=%fd.name)',
        priority:  'ALERT',
        tags:      ['container', 'process', 'mitre_privilege_escalation'],
    },
];

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

export function parseKubeBenchOutput(raw: string): { controls: KubeBenchResult[]; totals: { pass: number; fail: number; warn: number; info: number } } {
    try {
        const json = JSON.parse(raw) as { Controls?: Array<{ id?: string; text?: string; tests?: Array<{ results?: Array<{ test_number?: string; test_desc?: string; status?: string; reason?: string; remediation?: string }> }>; total_pass?: number; total_fail?: number; total_warn?: number; total_info?: number }> };
        const controls = (json.Controls ?? []).map((c) => {
            const tests: KubeBenchTest[] = (c.tests ?? []).flatMap((t) =>
                (t.results ?? []).map((r) => ({
                    id:          r.test_number ?? '',
                    desc:        r.test_desc   ?? '',
                    result:      (r.status ?? 'PASS').toUpperCase() as KubeBenchTest['result'],
                    reason:      r.reason,
                    remediation: r.remediation,
                }))
            );
            return {
                id:         c.id ?? '',
                text:       c.text ?? '',
                tests,
                totalPass:  c.total_pass ?? 0,
                totalFail:  c.total_fail ?? 0,
                totalWarn:  c.total_warn ?? 0,
                totalInfo:  c.total_info ?? 0,
            };
        });
        const totals = controls.reduce((acc, c) => ({
            pass: acc.pass + c.totalPass, fail: acc.fail + c.totalFail,
            warn: acc.warn + c.totalWarn, info: acc.info + c.totalInfo,
        }), { pass: 0, fail: 0, warn: 0, info: 0 });
        return { controls, totals };
    } catch {
        return { controls: [], totals: { pass: 0, fail: 0, warn: 0, info: 0 } };
    }
}

export function parseFalcoAlerts(raw: string): FalcoAlert[] {
    return raw.split('\n')
        .filter((l) => l.trim().startsWith('{'))
        .map((l) => {
            try {
                const j = JSON.parse(l) as { time?: string; rule?: string; priority?: string; output?: string; output_fields?: Record<string, string> };
                return {
                    time:     j.time     ?? '',
                    rule:     j.rule     ?? '',
                    priority: (j.priority ?? 'NOTICE') as FalcoRulePriority,
                    output:   j.output   ?? '',
                    fields:   j.output_fields ?? {},
                };
            } catch { return null; }
        })
        .filter((a): a is FalcoAlert => a !== null);
}

export function formatComplianceReport(result: ReturnType<typeof parseKubeBenchOutput>): string {
    const { controls, totals } = result;
    const lines = [
        `CIS Kubernetes Benchmark Results`,
        `Total: ${totals.pass} PASS, ${totals.fail} FAIL, ${totals.warn} WARN, ${totals.info} INFO`,
        ``,
    ];
    for (const ctrl of controls) {
        lines.push(`[${ctrl.id}] ${ctrl.text}: ${ctrl.totalPass} pass / ${ctrl.totalFail} fail`);
        for (const t of ctrl.tests.filter((t) => t.result === 'FAIL')) {
            lines.push(`  FAIL [${t.id}] ${t.desc}`);
            if (t.remediation) lines.push(`    Remediation: ${t.remediation.slice(0, 200)}`);
        }
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LLM prompts
// ---------------------------------------------------------------------------

export function buildComplianceScanPrompt(params: {
    service:       string;
    failedChecks:  KubeBenchTest[];
    environment:   'production' | 'staging';
}): string {
    const failList = params.failedChecks.slice(0, 20).map((t) =>
        `  [${t.id}] ${t.desc}${t.remediation ? `\n    Suggested: ${t.remediation.slice(0, 150)}` : ''}`
    ).join('\n');
    return [
        `You are a Kubernetes security expert. Review the following CIS benchmark failures for "${params.service}" in ${params.environment} and provide remediation steps.`,
        ``,
        `Failed checks (${params.failedChecks.length} total):`,
        failList,
        ``,
        `For each failure, provide:`,
        `  1. Risk level (critical/high/medium/low)`,
        `  2. Concrete kubectl or manifest fix`,
        `  3. Effort estimate (minutes)`,
        ``,
        `Return JSON: { "remediations": [{ "id": string, "risk": string, "fix": string, "effort_minutes": number }] }`,
    ].join('\n');
}

export function buildFalcoRulePrompt(params: {
    service:     string;
    description: string;
    threat:      string;   // what behavior to detect
    namespace?:  string;
}): string {
    return [
        `Generate Falco runtime security rules to detect the following threat.`,
        ``,
        `Service: ${params.service}`,
        `Namespace: ${params.namespace ?? 'default'}`,
        `Description: ${params.description}`,
        `Threat to detect: ${params.threat}`,
        ``,
        `Requirements:`,
        `  - Use standard Falco condition syntax (sysdig filter language)`,
        `  - Include relevant tags: container, process, network, filesystem, etc.`,
        `  - Output format: all useful metadata fields`,
        `  - Priority: appropriate for the threat level`,
        `  - Add exceptions for known-good processes if needed`,
        ``,
        `Return a JSON array: [{ "filename": "falco-rules.yaml", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].join('\n');
}
