// ============================================================================
// DEVOPS MLOPS BUILDER
//
// ML pipeline and model operations via CLI / REST:
//
//   Apache Airflow  — REST API v1 (trigger DAG, get task logs, pause/unpause)
//   MLflow          — CLI + Tracking Server REST API (experiments, runs, artifacts)
//   AWS SageMaker   — aws sagemaker CLI (endpoint management, training jobs)
//   dbt             — CLI (run, test, source freshness, docs generate)
//   Kubeflow        — kfp SDK CLI + kubectl for Pipeline + Experiment CRs
//
// All REST calls are expressed as curl argv arrays.
// All heavy mutations (delete endpoint, delete model version) require
// allow_destructive: true.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AirflowDagRun {
    dagRunId:       string;
    dagId:          string;
    state:          'queued' | 'running' | 'success' | 'failed';
    startDate?:     string;
    endDate?:       string;
    executionDate?: string;
}

export interface MlflowRun {
    runId:       string;
    experimentId: string;
    status:      'RUNNING' | 'SCHEDULED' | 'FINISHED' | 'FAILED' | 'KILLED';
    startTime?:  number;  // Unix ms
    endTime?:    number;
    metrics?:    Record<string, number>;
    params?:     Record<string, string>;
    tags?:       Record<string, string>;
    artifactUri?: string;
}

export interface SageMakerEndpoint {
    name:             string;
    status:           string;
    creationTime?:    string;
    instanceType?:    string;
    variantName?:     string;
    modelName?:       string;
}

export interface DbtRunResult {
    status:        'pass' | 'fail' | 'error' | 'warn' | 'skip';
    uniqueId:      string;
    executionTime: number;
    failures?:     number;
    message?:      string;
}

// ---------------------------------------------------------------------------
// Apache Airflow REST API builders
// ---------------------------------------------------------------------------

export function buildAirflowTriggerDagArgs(params: {
    baseUrl:     string;
    dagId:       string;
    conf?:       Record<string, unknown>;
    executionDate?: string;
    username?:   string;
    password?:   string;
}): string[] {
    const url  = `${params.baseUrl}/api/v1/dags/${encodeURIComponent(params.dagId)}/dagRuns`;
    const body = JSON.stringify({
        conf:           params.conf ?? {},
        ...(params.executionDate ? { execution_date: params.executionDate } : {}),
    });
    const args = ['curl', '-s', '-X', 'POST', url,
        '-H', 'Content-Type: application/json',
        '-d', body];
    if (params.username && params.password) {
        args.push('-u', `${params.username}:${params.password}`);
    }
    return args;
}

export function buildAirflowGetDagRunArgs(params: {
    baseUrl:   string;
    dagId:     string;
    dagRunId:  string;
    username?: string;
    password?: string;
}): string[] {
    const url  = `${params.baseUrl}/api/v1/dags/${encodeURIComponent(params.dagId)}/dagRuns/${encodeURIComponent(params.dagRunId)}`;
    const args = ['curl', '-s', url, '-H', 'Accept: application/json'];
    if (params.username && params.password) args.push('-u', `${params.username}:${params.password}`);
    return args;
}

export function buildAirflowListDagRunsArgs(params: {
    baseUrl:   string;
    dagId:     string;
    limit?:    number;
    state?:    'queued' | 'running' | 'success' | 'failed';
    username?: string;
    password?: string;
}): string[] {
    const qs = new URLSearchParams({ limit: String(params.limit ?? 10) });
    if (params.state) qs.set('state', params.state);
    const url  = `${params.baseUrl}/api/v1/dags/${encodeURIComponent(params.dagId)}/dagRuns?${qs}`;
    const args = ['curl', '-s', url, '-H', 'Accept: application/json'];
    if (params.username && params.password) args.push('-u', `${params.username}:${params.password}`);
    return args;
}

export function buildAirflowGetTaskLogsArgs(params: {
    baseUrl:    string;
    dagId:      string;
    dagRunId:   string;
    taskId:     string;
    taskTryNumber?: number;
    username?:  string;
    password?:  string;
}): string[] {
    const tryNum = params.taskTryNumber ?? 1;
    const url = `${params.baseUrl}/api/v1/dags/${encodeURIComponent(params.dagId)}/dagRuns/${encodeURIComponent(params.dagRunId)}/taskInstances/${encodeURIComponent(params.taskId)}/logs/${tryNum}`;
    const args = ['curl', '-s', url, '-H', 'Accept: text/plain'];
    if (params.username && params.password) args.push('-u', `${params.username}:${params.password}`);
    return args;
}

export function buildAirflowPauseDagArgs(params: {
    baseUrl:   string;
    dagId:     string;
    pause:     boolean;
    username?: string;
    password?: string;
}): string[] {
    const url  = `${params.baseUrl}/api/v1/dags/${encodeURIComponent(params.dagId)}`;
    const body = JSON.stringify({ is_paused: params.pause });
    const args = ['curl', '-s', '-X', 'PATCH', url,
        '-H', 'Content-Type: application/json',
        '-d', body];
    if (params.username && params.password) args.push('-u', `${params.username}:${params.password}`);
    return args;
}

export function buildAirflowListDagsArgs(params: {
    baseUrl:   string;
    limit?:    number;
    onlyActive?: boolean;
    username?: string;
    password?: string;
}): string[] {
    const qs = new URLSearchParams({ limit: String(params.limit ?? 50) });
    if (params.onlyActive) qs.set('only_active', 'true');
    const url  = `${params.baseUrl}/api/v1/dags?${qs}`;
    const args = ['curl', '-s', url, '-H', 'Accept: application/json'];
    if (params.username && params.password) args.push('-u', `${params.username}:${params.password}`);
    return args;
}

// ---------------------------------------------------------------------------
// MLflow REST API builders
// ---------------------------------------------------------------------------

export function buildMlflowListExperimentsArgs(trackingUri: string, token?: string): string[] {
    const args = ['curl', '-s', `${trackingUri}/api/2.0/mlflow/experiments/search`,
        '-H', 'Content-Type: application/json',
        '-d', '{"max_results":100}'];
    if (token) args.push('-H', `Authorization: Bearer ${token}`);
    return args;
}

export function buildMlflowSearchRunsArgs(params: {
    trackingUri:   string;
    experimentIds: string[];
    filter?:       string;   // MLflow filter expression, e.g. "metrics.accuracy > 0.9"
    maxResults?:   number;
    orderBy?:      string[];
    token?:        string;
}): string[] {
    const body = JSON.stringify({
        experiment_ids: params.experimentIds,
        filter:         params.filter ?? '',
        max_results:    params.maxResults ?? 50,
        order_by:       params.orderBy ?? ['start_time DESC'],
    });
    const args = ['curl', '-s', '-X', 'POST',
        `${params.trackingUri}/api/2.0/mlflow/runs/search`,
        '-H', 'Content-Type: application/json',
        '-d', body];
    if (params.token) args.push('-H', `Authorization: Bearer ${params.token}`);
    return args;
}

export function buildMlflowGetRunArgs(trackingUri: string, runId: string, token?: string): string[] {
    const args = ['curl', '-s', `${trackingUri}/api/2.0/mlflow/runs/get?run_id=${runId}`,
        '-H', 'Accept: application/json'];
    if (token) args.push('-H', `Authorization: Bearer ${token}`);
    return args;
}

export function buildMlflowRegisterModelArgs(params: {
    trackingUri: string;
    runId:       string;
    modelUri:    string;   // e.g. 'runs:/abc123/model'
    name:        string;   // registered model name
    token?:      string;
}): string[] {
    const body = JSON.stringify({ name: params.name, source: params.modelUri, run_id: params.runId });
    const args = ['curl', '-s', '-X', 'POST',
        `${params.trackingUri}/api/2.0/mlflow/model-versions/create`,
        '-H', 'Content-Type: application/json',
        '-d', body];
    if (params.token) args.push('-H', `Authorization: Bearer ${params.token}`);
    return args;
}

export function buildMlflowTransitionModelStageArgs(params: {
    trackingUri: string;
    name:        string;
    version:     string;
    stage:       'Staging' | 'Production' | 'Archived';
    token?:      string;
}): string[] {
    const body = JSON.stringify({
        name:                params.name,
        version:             params.version,
        stage:               params.stage,
        archive_existing_versions: params.stage === 'Production',
    });
    const args = ['curl', '-s', '-X', 'POST',
        `${params.trackingUri}/api/2.0/mlflow/model-versions/transition-stage`,
        '-H', 'Content-Type: application/json',
        '-d', body];
    if (params.token) args.push('-H', `Authorization: Bearer ${params.token}`);
    return args;
}

export function buildMlflowDeleteRunArgs(trackingUri: string, runId: string, token?: string): string[] {
    const body = JSON.stringify({ run_id: runId });
    const args = ['curl', '-s', '-X', 'POST',
        `${params.trackingUri}/api/2.0/mlflow/runs/delete`,
        '-H', 'Content-Type: application/json',
        '-d', body];
    if (token) args.push('-H', `Authorization: Bearer ${token}`);
    return args.map((a) => a.replace('params.trackingUri', trackingUri));
}

// ---------------------------------------------------------------------------
// MLflow CLI builders
// ---------------------------------------------------------------------------

export function buildMlflowCliRunsListArgs(params: {
    experimentId: string;
    trackingUri?: string;
}): string[] {
    const args = ['mlflow', 'runs', 'list', '--experiment-id', params.experimentId];
    if (params.trackingUri) args.push('--tracking-uri', params.trackingUri);
    return args;
}

export function buildMlflowCliArtifactListArgs(params: {
    runId:        string;
    artifactPath?: string;
    trackingUri?: string;
}): string[] {
    const args = ['mlflow', 'artifacts', 'list', '--run-id', params.runId];
    if (params.artifactPath) args.push('--artifact-path', params.artifactPath);
    if (params.trackingUri)  args.push('--tracking-uri',  params.trackingUri);
    return args;
}

export function buildMlflowCliDownloadArtifactsArgs(params: {
    runId:        string;
    artifactPath?: string;
    dst:          string;
    trackingUri?: string;
}): string[] {
    const args = ['mlflow', 'artifacts', 'download', '--run-id', params.runId, '--dst-path', params.dst];
    if (params.artifactPath) args.push('--artifact-path', params.artifactPath);
    if (params.trackingUri)  args.push('--tracking-uri',  params.trackingUri);
    return args;
}

// ---------------------------------------------------------------------------
// AWS SageMaker builders
// ---------------------------------------------------------------------------

export function buildSageMakerListEndpointsArgs(params: {
    region?:     string;
    statusEquals?: 'InService' | 'Updating' | 'Failed' | 'Creating' | 'Deleting';
    nameContains?: string;
}): string[] {
    const args = ['aws', 'sagemaker', 'list-endpoints', '--output', 'json'];
    if (params.statusEquals)  args.push('--status-equals', params.statusEquals);
    if (params.nameContains)  args.push('--name-contains', params.nameContains);
    if (params.region)        args.push('--region', params.region);
    return args;
}

export function buildSageMakerDescribeEndpointArgs(endpointName: string, region?: string): string[] {
    const args = ['aws', 'sagemaker', 'describe-endpoint', '--endpoint-name', endpointName, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

export function buildSageMakerUpdateEndpointArgs(params: {
    endpointName:       string;
    endpointConfigName: string;
    region?:            string;
}): string[] {
    const args = ['aws', 'sagemaker', 'update-endpoint',
        '--endpoint-name', params.endpointName,
        '--endpoint-config-name', params.endpointConfigName,
        '--output', 'json'];
    if (params.region) args.push('--region', params.region);
    return args;
}

export function buildSageMakerDeleteEndpointArgs(endpointName: string, region?: string): string[] {
    const args = ['aws', 'sagemaker', 'delete-endpoint', '--endpoint-name', endpointName, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

export function buildSageMakerListTrainingJobsArgs(params: {
    region?:     string;
    statusEquals?: 'InProgress' | 'Completed' | 'Failed' | 'Stopping' | 'Stopped';
    maxResults?:  number;
}): string[] {
    const args = ['aws', 'sagemaker', 'list-training-jobs', '--output', 'json'];
    if (params.statusEquals) args.push('--status-equals', params.statusEquals);
    if (params.maxResults)   args.push('--max-results', String(params.maxResults));
    if (params.region)       args.push('--region', params.region);
    return args;
}

export function buildSageMakerDescribeTrainingJobArgs(jobName: string, region?: string): string[] {
    const args = ['aws', 'sagemaker', 'describe-training-job', '--training-job-name', jobName, '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

export function buildSageMakerStopTrainingJobArgs(jobName: string, region?: string): string[] {
    const args = ['aws', 'sagemaker', 'stop-training-job', '--training-job-name', jobName];
    if (region) args.push('--region', region);
    return args;
}

export function buildSageMakerListModelsArgs(region?: string): string[] {
    const args = ['aws', 'sagemaker', 'list-models', '--output', 'json'];
    if (region) args.push('--region', region);
    return args;
}

// ---------------------------------------------------------------------------
// dbt CLI builders
// ---------------------------------------------------------------------------

export function buildDbtRunArgs(params: {
    projectDir?:  string;
    profilesDir?: string;
    target?:      string;      // profile target (dev/prod/staging)
    models?:      string[];    // model selector, e.g. ['tag:daily', 'my_model+']
    exclude?:     string[];
    fullRefresh?: boolean;
    vars?:        Record<string, unknown>;
    threads?:     number;
    noVersionCheck?: boolean;
}): string[] {
    const args = ['dbt', 'run'];
    if (params.projectDir)    args.push('--project-dir', params.projectDir);
    if (params.profilesDir)   args.push('--profiles-dir', params.profilesDir);
    if (params.target)        args.push('--target', params.target);
    if (params.models?.length)  args.push('--models', ...params.models);
    if (params.exclude?.length) args.push('--exclude', ...params.exclude);
    if (params.fullRefresh)   args.push('--full-refresh');
    if (params.vars)          args.push('--vars', JSON.stringify(params.vars));
    if (params.threads)       args.push('--threads', String(params.threads));
    if (params.noVersionCheck) args.push('--no-version-check');
    return args;
}

export function buildDbtTestArgs(params: {
    projectDir?:  string;
    target?:      string;
    models?:      string[];
    select?:      string[];
    exclude?:     string[];
    testName?:    string;
    vars?:        Record<string, unknown>;
}): string[] {
    const args = ['dbt', 'test'];
    if (params.projectDir)    args.push('--project-dir', params.projectDir);
    if (params.target)        args.push('--target', params.target);
    if (params.models?.length)  args.push('--models', ...params.models);
    if (params.select?.length)  args.push('--select', ...params.select);
    if (params.exclude?.length) args.push('--exclude', ...params.exclude);
    if (params.testName)      args.push('--name', params.testName);
    if (params.vars)          args.push('--vars', JSON.stringify(params.vars));
    return args;
}

export function buildDbtSourceFreshnessArgs(params: {
    projectDir?:  string;
    target?:      string;
    select?:      string[];
    output?:      string;    // path for results JSON file
}): string[] {
    const args = ['dbt', 'source', 'freshness'];
    if (params.projectDir)   args.push('--project-dir', params.projectDir);
    if (params.target)       args.push('--target', params.target);
    if (params.select?.length) args.push('--select', ...params.select);
    if (params.output)       args.push('--output', params.output);
    return args;
}

export function buildDbtDocsGenerateArgs(params: {
    projectDir?:  string;
    target?:      string;
    noCompile?:   boolean;
}): string[] {
    const args = ['dbt', 'docs', 'generate'];
    if (params.projectDir) args.push('--project-dir', params.projectDir);
    if (params.target)     args.push('--target', params.target);
    if (params.noCompile)  args.push('--no-compile');
    return args;
}

export function buildDbtCompileArgs(params: {
    projectDir?:  string;
    target?:      string;
    models?:      string[];
}): string[] {
    const args = ['dbt', 'compile'];
    if (params.projectDir)   args.push('--project-dir', params.projectDir);
    if (params.target)       args.push('--target', params.target);
    if (params.models?.length) args.push('--models', ...params.models);
    return args;
}

// ---------------------------------------------------------------------------
// Kubeflow Pipelines builders
// ---------------------------------------------------------------------------

export function buildKfpListPipelinesArgs(params: {
    host:      string;
    pageToken?: string;
    pageSize?:  number;
    sortBy?:    string;
    token?:     string;
}): string[] {
    const qs = new URLSearchParams({ page_size: String(params.pageSize ?? 25) });
    if (params.pageToken) qs.set('page_token', params.pageToken);
    if (params.sortBy)    qs.set('sort_by', params.sortBy);
    const args = ['curl', '-s', `${params.host}/pipeline/apis/v1beta1/pipelines?${qs}`,
        '-H', 'Accept: application/json'];
    if (params.token) args.push('-H', `Authorization: Bearer ${params.token}`);
    return args;
}

export function buildKfpRunPipelineArgs(params: {
    host:         string;
    pipelineId:   string;
    name:         string;
    params?:      Record<string, string>;
    experimentId?: string;
    serviceAccount?: string;
    token?:       string;
}): string[] {
    const body = JSON.stringify({
        name:          params.name,
        pipeline_spec: { pipeline_id: params.pipelineId },
        resource_references: params.experimentId
            ? [{ key: { id: params.experimentId, type: 'EXPERIMENT' }, relationship: 'OWNER' }]
            : [],
        service_account: params.serviceAccount,
        params: Object.entries(params.params ?? {}).map(([name, value]) => ({ name, value })),
    });
    const args = ['curl', '-s', '-X', 'POST',
        `${params.host}/pipeline/apis/v1beta1/runs`,
        '-H', 'Content-Type: application/json',
        '-d', body];
    if (params.token) args.push('-H', `Authorization: Bearer ${params.token}`);
    return args;
}

export function buildKfpGetRunArgs(host: string, runId: string, token?: string): string[] {
    const args = ['curl', '-s', `${host}/pipeline/apis/v1beta1/runs/${runId}`,
        '-H', 'Accept: application/json'];
    if (token) args.push('-H', `Authorization: Bearer ${token}`);
    return args;
}

export function buildKfpStopRunArgs(host: string, runId: string, token?: string): string[] {
    const args = ['curl', '-s', '-X', 'POST',
        `${host}/pipeline/apis/v1beta1/runs/${runId}/terminate`];
    if (token) args.push('-H', `Authorization: Bearer ${token}`);
    return args;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseAirflowDagRun(raw: string): AirflowDagRun | null {
    try {
        const j = JSON.parse(raw) as Record<string, unknown>;
        return {
            dagRunId:      String(j['dag_run_id']    ?? j['run_id'] ?? ''),
            dagId:         String(j['dag_id']        ?? ''),
            state:         (j['state'] as AirflowDagRun['state']) ?? 'queued',
            startDate:     j['start_date']     ? String(j['start_date'])     : undefined,
            endDate:       j['end_date']       ? String(j['end_date'])       : undefined,
            executionDate: j['execution_date'] ? String(j['execution_date']) : undefined,
        };
    } catch {
        return null;
    }
}

export function parseMlflowRuns(raw: string): MlflowRun[] {
    try {
        const j = JSON.parse(raw) as { runs?: Array<Record<string, unknown>> };
        return (j.runs ?? []).map((r) => {
            const info    = (r['info']   ?? {}) as Record<string, unknown>;
            const data    = (r['data']   ?? {}) as Record<string, unknown>;
            const metrics = (data['metrics'] as Array<{ key: string; value: number }> ?? [])
                .reduce((acc, m) => ({ ...acc, [m.key]: m.value }), {} as Record<string, number>);
            const runParams  = (data['params'] as Array<{ key: string; value: string }> ?? [])
                .reduce((acc, p) => ({ ...acc, [p.key]: p.value }), {} as Record<string, string>);
            return {
                runId:        String(info['run_id']        ?? info['run_uuid'] ?? ''),
                experimentId: String(info['experiment_id'] ?? ''),
                status:       (info['status'] as MlflowRun['status']) ?? 'FINISHED',
                startTime:    info['start_time'] ? Number(info['start_time']) : undefined,
                endTime:      info['end_time']   ? Number(info['end_time'])   : undefined,
                metrics,
                params:       runParams,
                artifactUri:  info['artifact_uri'] ? String(info['artifact_uri']) : undefined,
            };
        });
    } catch {
        return [];
    }
}

export function parseSageMakerEndpoints(raw: string): SageMakerEndpoint[] {
    try {
        const j = JSON.parse(raw) as { Endpoints?: Array<Record<string, unknown>> };
        return (j.Endpoints ?? []).map((e) => ({
            name:         String(e['EndpointName']   ?? ''),
            status:       String(e['EndpointStatus'] ?? ''),
            creationTime: e['CreationTime'] ? String(e['CreationTime']) : undefined,
        }));
    } catch {
        return [];
    }
}

export function parseDbtRunResults(raw: string): DbtRunResult[] {
    try {
        const j = JSON.parse(raw) as { results?: Array<Record<string, unknown>> };
        return (j.results ?? []).map((r) => ({
            status:        String(r['status'] ?? 'skip') as DbtRunResult['status'],
            uniqueId:      String(r['unique_id'] ?? ''),
            executionTime: Number(r['execution_time'] ?? 0),
            failures:      r['failures'] !== undefined ? Number(r['failures']) : undefined,
            message:       r['message'] ? String(r['message']) : undefined,
        }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// LLM prompts
// ---------------------------------------------------------------------------

export function buildMlopsAnalysisPrompt(params: {
    task:           string;    // e.g. 'diagnose failed training job', 'compare model runs'
    airflowData?:   string;
    mlflowData?:    string;
    sagemakerData?: string;
    dbtData?:       string;
    context?:       string;
}): string {
    return [
        `You are an MLOps engineer. ${params.task}`,
        ``,
        params.airflowData   ? `Airflow pipeline data:\n${params.airflowData.slice(0, 1500)}\n`    : '',
        params.mlflowData    ? `MLflow experiment data:\n${params.mlflowData.slice(0, 1500)}\n`    : '',
        params.sagemakerData ? `SageMaker endpoint data:\n${params.sagemakerData.slice(0, 1000)}\n` : '',
        params.dbtData       ? `dbt run results:\n${params.dbtData.slice(0, 1000)}\n`              : '',
        params.context       ? `Additional context:\n${params.context.slice(0, 500)}\n`            : '',
        `Analyze and return JSON:`,
        `{`,
        `  "status": "healthy"|"degraded"|"failed",`,
        `  "summary": string,`,
        `  "root_cause": string | null,`,
        `  "actions": [{ "description": string, "command": string | null }],`,
        `  "metrics_of_concern": [{ "name": string, "value": string, "threshold": string }]`,
        `}`,
        `Return ONLY the JSON object — no markdown fences.`,
    ].filter(Boolean).join('\n');
}

export function formatMlopsReport(params: {
    task:        string;
    dagRun?:     AirflowDagRun | null;
    mlflowRuns?: MlflowRun[];
    endpoints?:  SageMakerEndpoint[];
    dbtResults?: DbtRunResult[];
}): string {
    const lines = [`MLOps Report — ${params.task}`];
    if (params.dagRun) {
        lines.push(``, `Airflow DAG Run: ${params.dagRun.dagId} / ${params.dagRun.dagRunId}`);
        lines.push(`  State: ${params.dagRun.state}`);
        if (params.dagRun.startDate) lines.push(`  Started: ${params.dagRun.startDate}`);
    }
    if (params.mlflowRuns?.length) {
        lines.push(``, `MLflow Runs: ${params.mlflowRuns.length}`);
        params.mlflowRuns.slice(0, 5).forEach((r) => {
            lines.push(`  [${r.runId.slice(0, 8)}] ${r.status} — exp:${r.experimentId}`);
            if (r.metrics && Object.keys(r.metrics).length) {
                const topMetrics = Object.entries(r.metrics).slice(0, 3).map(([k, v]) => `${k}=${v.toFixed(4)}`).join(', ');
                lines.push(`    Metrics: ${topMetrics}`);
            }
        });
    }
    if (params.endpoints?.length) {
        lines.push(``, `SageMaker Endpoints: ${params.endpoints.length}`);
        params.endpoints.slice(0, 5).forEach((e) => lines.push(`  ${e.name}: ${e.status}`));
    }
    if (params.dbtResults?.length) {
        const passed = params.dbtResults.filter((r) => r.status === 'pass').length;
        const failed = params.dbtResults.filter((r) => r.status === 'fail' || r.status === 'error').length;
        lines.push(``, `dbt Results: ${passed} pass, ${failed} fail / error (total ${params.dbtResults.length})`);
        params.dbtResults.filter((r) => r.status !== 'pass' && r.status !== 'skip').slice(0, 5).forEach((r) => {
            lines.push(`  [${r.status.toUpperCase()}] ${r.uniqueId}${r.message ? ` — ${r.message}` : ''}`);
        });
    }
    return lines.join('\n');
}
