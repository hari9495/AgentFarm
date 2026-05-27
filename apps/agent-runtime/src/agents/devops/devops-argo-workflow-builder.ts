// ============================================================================
// DEVOPS ARGO WORKFLOWS BUILDER
//
// Builders for Argo Workflows (NOT ArgoCD) used by the
// workspace_devops_argo_workflow action.
//
// Sub-actions:
//   submit           — argo submit
//   get              — argo get
//   list             — argo list
//   logs             — argo logs
//   retry            — argo retry
//   resubmit         — argo resubmit
//   terminate        — argo terminate
//   stop             — argo stop
//   delete           — argo delete
//   watch            — argo watch (bounded poll)
//   lint             — argo lint
//   template_list    — argo template list
//   template_get     — argo template get
//   template_create  — argo template create (from inline YAML)
//   template_delete  — argo template delete
//   cron_list        — argo cron list
//   cron_create      — argo cron create (from inline YAML)
//   cron_suspend     — argo cron suspend
//   cron_resume      — argo cron resume
//   cron_delete      — argo cron delete
//   generate         — LLM-generated workflow YAML from description
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowSummary {
    name:       string;
    namespace:  string;
    status:     'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Error' | 'Unknown';
    startedAt?: string;
    finishedAt?: string;
    duration?:  string;
    message?:   string;
}

export interface WorkflowNode {
    id:          string;
    name:        string;
    type:        string;
    phase:       string;
    startedAt?:  string;
    finishedAt?: string;
    message?:    string;
}

export interface WorkflowSpec {
    name?:        string;
    namespace?:   string;
    entrypoint:   string;
    templates:    WorkflowTemplate[];
    arguments?:   Record<string, string>;
    serviceAccount?: string;
    ttlStrategy?: { secondsAfterCompletion?: number; secondsAfterSuccess?: number; secondsAfterFailure?: number };
}

export interface WorkflowTemplate {
    name:     string;
    steps?:   Array<Array<{ name: string; template: string; arguments?: Record<string, unknown> }>>;
    dag?:     { tasks: Array<{ name: string; template: string; dependencies?: string[]; arguments?: Record<string, unknown> }> };
    container?: { image: string; command?: string[]; args?: string[]; env?: Array<{ name: string; value: string }> };
    script?:  { image: string; command: string[]; source: string };
    resource?: { action: string; manifest: string };
    suspend?: {};
}

// ---------------------------------------------------------------------------
// Workflow CLI builders
// ---------------------------------------------------------------------------

function argoBase(namespace?: string): string[] {
    const cmd = ['argo'];
    if (namespace) { cmd.push('-n', namespace); }
    return cmd;
}

export function buildArgoSubmitArgs(params: {
    file?:         string;
    name?:         string;
    namespace?:    string;
    entrypoint?:   string;
    parameters?:   Record<string, string>;
    serviceAccount?: string;
    wait?:         boolean;
    log?:          boolean;
    labels?:       Record<string, string>;
}): string[] {
    const cmd = [...argoBase(params.namespace), 'submit'];
    if (params.wait)  { cmd.push('--wait'); }
    if (params.log)   { cmd.push('--log'); }
    if (params.name)  { cmd.push('--name', params.name); }
    if (params.entrypoint)    { cmd.push('--entrypoint', params.entrypoint); }
    if (params.serviceAccount) { cmd.push('--serviceaccount', params.serviceAccount); }
    if (params.parameters) {
        for (const [k, v] of Object.entries(params.parameters)) {
            cmd.push('-p', `${k}=${v}`);
        }
    }
    if (params.labels) {
        for (const [k, v] of Object.entries(params.labels)) {
            cmd.push('-l', `${k}=${v}`);
        }
    }
    cmd.push(params.file ?? '-');
    return cmd;
}

export function buildArgoGetArgs(params: {
    name:       string;
    namespace?: string;
    output?:    'json' | 'yaml' | 'wide';
}): string[] {
    const cmd = [...argoBase(params.namespace), 'get'];
    if (params.output) { cmd.push('-o', params.output); }
    cmd.push(params.name);
    return cmd;
}

export function buildArgoListArgs(params: {
    namespace?:  string;
    status?:     'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Error';
    labels?:     string;
    limit?:      number;
    output?:     'json' | 'yaml' | 'wide';
}): string[] {
    const cmd = [...argoBase(params.namespace), 'list'];
    if (params.status)   { cmd.push('--status', params.status); }
    if (params.labels)   { cmd.push('-l', params.labels); }
    if (params.limit)    { cmd.push('--chunk-size', String(params.limit)); }
    if (params.output)   { cmd.push('-o', params.output); }
    return cmd;
}

export function buildArgoLogsArgs(params: {
    name:        string;
    namespace?:  string;
    follow?:     boolean;
    tailLines?:  number;
    container?:  string;
    since?:      string;
}): string[] {
    const cmd = [...argoBase(params.namespace), 'logs'];
    if (params.follow)    { cmd.push('--follow'); }
    if (params.tailLines) { cmd.push('--tail', String(params.tailLines)); }
    if (params.container) { cmd.push('-c', params.container); }
    if (params.since)     { cmd.push('--since', params.since); }
    cmd.push(params.name);
    return cmd;
}

export function buildArgoRetryArgs(params: {
    name:               string;
    namespace?:         string;
    restartSuccessful?: boolean;
}): string[] {
    const cmd = [...argoBase(params.namespace), 'retry'];
    if (params.restartSuccessful) { cmd.push('--restart-successful'); }
    cmd.push(params.name);
    return cmd;
}

export function buildArgoResubmitArgs(params: {
    name:       string;
    namespace?: string;
    memoized?:  boolean;
}): string[] {
    const cmd = [...argoBase(params.namespace), 'resubmit'];
    if (params.memoized) { cmd.push('--memoized'); }
    cmd.push(params.name);
    return cmd;
}

export function buildArgoTerminateArgs(params: { name: string; namespace?: string }): string[] {
    return [...argoBase(params.namespace), 'terminate', params.name];
}

export function buildArgoStopArgs(params: {
    name:       string;
    namespace?: string;
    message?:   string;
    nodeField?: string;
}): string[] {
    const cmd = [...argoBase(params.namespace), 'stop'];
    if (params.message)   { cmd.push('--message', params.message); }
    if (params.nodeField) { cmd.push('--node-field-selector', params.nodeField); }
    cmd.push(params.name);
    return cmd;
}

export function buildArgoDeleteArgs(params: {
    name?:       string;
    namespace?:  string;
    completed?:  boolean;
    resubmitted?: boolean;
}): string[] {
    const cmd = [...argoBase(params.namespace), 'delete'];
    if (params.completed)   { cmd.push('--completed'); }
    if (params.resubmitted) { cmd.push('--resubmitted'); }
    if (params.name)        { cmd.push(params.name); }
    return cmd;
}

export function buildArgoWatchArgs(params: { name: string; namespace?: string; deadline?: string }): string[] {
    const cmd = [...argoBase(params.namespace), 'watch'];
    if (params.deadline) { cmd.push('--deadline', params.deadline); }
    cmd.push(params.name);
    return cmd;
}

export function buildArgoLintArgs(params: { file: string; strict?: boolean }): string[] {
    const cmd = ['argo', 'lint'];
    if (params.strict) { cmd.push('--strict'); }
    cmd.push(params.file);
    return cmd;
}

// ---------------------------------------------------------------------------
// Template management
// ---------------------------------------------------------------------------

export function buildArgoTemplateListArgs(params: { namespace?: string; output?: 'json' | 'yaml' }): string[] {
    const cmd = [...argoBase(params.namespace), 'template', 'list'];
    if (params.output) { cmd.push('-o', params.output); }
    return cmd;
}

export function buildArgoTemplateGetArgs(params: { name: string; namespace?: string; output?: 'json' | 'yaml' }): string[] {
    const cmd = [...argoBase(params.namespace), 'template', 'get'];
    if (params.output) { cmd.push('-o', params.output); }
    cmd.push(params.name);
    return cmd;
}

export function buildArgoTemplateCreateArgs(params: { file: string; namespace?: string }): string[] {
    return [...argoBase(params.namespace), 'template', 'create', params.file];
}

export function buildArgoTemplateDeleteArgs(params: { name: string; namespace?: string }): string[] {
    return [...argoBase(params.namespace), 'template', 'delete', params.name];
}

// ---------------------------------------------------------------------------
// Cron workflow management
// ---------------------------------------------------------------------------

export function buildArgoCronListArgs(params: { namespace?: string; output?: 'json' | 'yaml' }): string[] {
    const cmd = [...argoBase(params.namespace), 'cron', 'list'];
    if (params.output) { cmd.push('-o', params.output); }
    return cmd;
}

export function buildArgoCronCreateArgs(params: { file: string; namespace?: string }): string[] {
    return [...argoBase(params.namespace), 'cron', 'create', params.file];
}

export function buildArgoCronSuspendArgs(params: { name: string; namespace?: string }): string[] {
    return [...argoBase(params.namespace), 'cron', 'suspend', params.name];
}

export function buildArgoCronResumeArgs(params: { name: string; namespace?: string }): string[] {
    return [...argoBase(params.namespace), 'cron', 'resume', params.name];
}

export function buildArgoCronDeleteArgs(params: { name: string; namespace?: string }): string[] {
    return [...argoBase(params.namespace), 'cron', 'delete', params.name];
}

// ---------------------------------------------------------------------------
// YAML generator
// ---------------------------------------------------------------------------

export function buildWorkflowYaml(spec: WorkflowSpec): string {
    const args: string[] = [];
    if (spec.arguments) {
        args.push(...Object.entries(spec.arguments).map(([k, v]) => `    - name: ${k}\n      value: "${v}"`));
    }

    const templates = spec.templates.map((t) => {
        const lines = [`  - name: ${t.name}`];
        if (t.container) {
            lines.push(`    container:`);
            lines.push(`      image: ${t.container.image}`);
            if (t.container.command) {
                lines.push(`      command: [${t.container.command.map((c) => `"${c}"`).join(', ')}]`);
            }
            if (t.container.args) {
                lines.push(`      args: [${t.container.args.map((a) => `"${a}"`).join(', ')}]`);
            }
            if (t.container.env?.length) {
                lines.push('      env:');
                for (const e of t.container.env) {
                    lines.push(`      - name: ${e.name}\n        value: "${e.value}"`);
                }
            }
        }
        if (t.script) {
            lines.push('    script:');
            lines.push(`      image: ${t.script.image}`);
            lines.push(`      command: [${t.script.command.map((c) => `"${c}"`).join(', ')}]`);
            lines.push('      source: |');
            for (const l of t.script.source.split('\n')) { lines.push(`        ${l}`); }
        }
        if (t.suspend !== undefined) { lines.push('    suspend: {}'); }
        return lines.join('\n');
    });

    return [
        'apiVersion: argoproj.io/v1alpha1',
        'kind: Workflow',
        'metadata:',
        `  name: ${spec.name ?? 'wf-' + Date.now()}`,
        `  namespace: ${spec.namespace ?? 'argo'}`,
        'spec:',
        `  entrypoint: ${spec.entrypoint}`,
        ...(args.length ? ['  arguments:', '    parameters:', ...args] : []),
        ...(spec.serviceAccount ? [`  serviceAccountName: ${spec.serviceAccount}`] : []),
        ...(spec.ttlStrategy ? [
            '  ttlStrategy:',
            ...(spec.ttlStrategy.secondsAfterCompletion !== undefined
                ? [`    secondsAfterCompletion: ${spec.ttlStrategy.secondsAfterCompletion}`] : []),
            ...(spec.ttlStrategy.secondsAfterSuccess !== undefined
                ? [`    secondsAfterSuccess: ${spec.ttlStrategy.secondsAfterSuccess}`] : []),
        ] : []),
        '  templates:',
        ...templates,
    ].join('\n');
}

export function buildArgoWorkflowGeneratePrompt(description: string, context?: string): string {
    return [
        '# Argo Workflow Generation Request',
        '',
        `**Objective:** ${description}`,
        ...(context ? ['', `**Context:** ${context}`] : []),
        '',
        '## Task',
        'Generate a complete Argo Workflow YAML for the above objective.',
        'Use best practices: resource limits, retry policies, ttlStrategy, meaningful step names.',
        'Respond with ONLY a valid YAML code block.',
        '```yaml',
        '# workflow here',
        '```',
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseArgoWorkflowStatus(raw: string): WorkflowSummary | null {
    try {
        // Try JSON first
        const j    = JSON.parse(raw);
        const meta = j.metadata ?? {};
        const status = j.status ?? {};
        return {
            name:       meta.name      ?? '',
            namespace:  meta.namespace ?? '',
            status:     status.phase   ?? 'Unknown',
            startedAt:  status.startedAt,
            finishedAt: status.finishedAt,
            message:    status.message || undefined,
        };
    } catch {
        // Parse text output: NAME  STATUS  AGE  DURATION  MESSAGE
        const match = raw.match(/^(\S+)\s+(\S+)\s+\S+\s+(\S+)?/m);
        if (!match) return null;
        return { name: match[1]!, namespace: '', status: match[2] as WorkflowSummary['status'], duration: match[3] };
    }
}

export function parseArgoWorkflowList(raw: string): WorkflowSummary[] {
    try {
        const j = JSON.parse(raw);
        const items: unknown[] = j.items ?? j;
        return (items as any[]).map((it) => ({
            name:       it.metadata?.name      ?? '',
            namespace:  it.metadata?.namespace ?? '',
            status:     it.status?.phase       ?? 'Unknown',
            startedAt:  it.status?.startedAt,
            finishedAt: it.status?.finishedAt,
            message:    it.status?.message || undefined,
        }));
    } catch {
        return raw.split('\n')
            .filter((l) => l.trim() && !l.startsWith('NAME'))
            .map((l) => {
                const p = l.trim().split(/\s+/);
                return { name: p[0]!, namespace: '', status: (p[1] ?? 'Unknown') as WorkflowSummary['status'] };
            });
    }
}

export function formatArgoWorkflowReport(wfs: WorkflowSummary[]): string {
    if (wfs.length === 0) return '# Argo Workflows\nNo workflows found.';
    const running   = wfs.filter((w) => w.status === 'Running').length;
    const succeeded = wfs.filter((w) => w.status === 'Succeeded').length;
    const failed    = wfs.filter((w) => w.status === 'Failed' || w.status === 'Error').length;
    const lines     = [
        `# Argo Workflows`,
        `**Total:** ${wfs.length} | **Running:** ${running} | **Succeeded:** ${succeeded} | **Failed:** ${failed}`,
        '',
        '| Name | Status | Started | Duration |',
        '|------|--------|---------|----------|',
    ];
    for (const w of wfs.slice(0, 20)) {
        const icon = w.status === 'Succeeded' ? '✓' : w.status === 'Running' ? '⏳' : '✗';
        lines.push(`| ${icon} ${w.name} | ${w.status} | ${w.startedAt ?? '-'} | ${w.duration ?? '-'} |`);
    }
    return lines.join('\n');
}
