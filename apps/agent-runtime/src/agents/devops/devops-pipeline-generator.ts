// ============================================================================
// DEVOPS PIPELINE GENERATOR
//
// LLM-driven CI/CD pipeline configuration file generator.
// Supports GitHub Actions (.github/workflows/*.yml) and GitLab CI (.gitlab-ci.yml).
//
// Pure builders/parsers — no side effects.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineProvider = 'github_actions' | 'gitlab_ci' | 'azure_pipelines' | 'jenkins';

export interface PipelineFile {
    filename: string;
    content:  string;
}

export interface PipelineParseResult {
    files:   PipelineFile[];
    summary: string;
}

export interface PipelineTriggerConfig {
    branches?:  string[];        // e.g. ['main', 'develop']
    tags?:      string[];        // e.g. ['v*']
    onPush?:    boolean;
    onPr?:      boolean;
    scheduled?: string;          // cron expression
    manual?:    boolean;
}

export interface PipelineJobSpec {
    name:          string;
    steps:         string[];     // plain English descriptions of steps
    runsOn?:       string;       // GitHub: ubuntu-latest, self-hosted, etc.
    needs?:        string[];     // job dependencies
    environment?:  string;       // target environment name
    condition?:    string;       // plain English condition for when to run
}

// ---------------------------------------------------------------------------
// GitHub Actions prompt builder
// ---------------------------------------------------------------------------

export function buildGitHubActionsPrompt(params: {
    repoName:    string;
    description: string;
    language:    string;       // e.g. 'Node.js', 'Python', 'Go', 'Java'
    jobs:        PipelineJobSpec[];
    triggers:    PipelineTriggerConfig;
    workflowName?: string;
    secretRefs?: string[];     // secret names the pipeline needs
    envVars?:    Record<string, string>;
    dockerRegistry?: string;
    sonarEnabled?: boolean;
    snykEnabled?:  boolean;
}): string {
    const { repoName, description, language, jobs, triggers, workflowName, secretRefs, envVars, dockerRegistry } = params;
    const jobDescriptions = jobs.map((j) =>
        `  - Job "${j.name}": ${j.steps.join('; ')}${j.needs ? ` (needs: ${j.needs.join(', ')})` : ''}${j.environment ? ` → deploys to environment: ${j.environment}` : ''}`,
    ).join('\n');

    const secretList  = (secretRefs ?? []).map((s) => `  - secrets.${s}`).join('\n');
    const envVarList  = Object.entries(envVars ?? {}).map(([k, v]) => `  ${k}: ${v}`).join('\n');

    return [
        `Generate a production-ready GitHub Actions workflow for the following repository.`,
        ``,
        `Repository: ${repoName}`,
        `Description: ${description}`,
        `Language / Runtime: ${language}`,
        `Workflow name: ${workflowName ?? 'CI/CD Pipeline'}`,
        ``,
        `Triggers:`,
        triggers.onPush    ? `  - Push to branches: ${(triggers.branches ?? ['main']).join(', ')}` : '',
        triggers.onPr      ? `  - Pull request targeting: ${(triggers.branches ?? ['main']).join(', ')}` : '',
        triggers.tags?.length ? `  - Tags matching: ${triggers.tags.join(', ')}` : '',
        triggers.scheduled ? `  - Scheduled (cron): ${triggers.scheduled}` : '',
        triggers.manual    ? `  - Manual dispatch (workflow_dispatch)` : '',
        ``,
        `Jobs:`,
        jobDescriptions,
        ``,
        secretList  ? `Secrets available:\n${secretList}` : '',
        envVarList  ? `Environment variables:\n${envVarList}` : '',
        dockerRegistry ? `Docker registry: ${dockerRegistry}` : '',
        params.sonarEnabled ? `Include SonarCloud scan step` : '',
        params.snykEnabled  ? `Include Snyk security scan step` : '',
        ``,
        `Requirements:`,
        `  - Use actions/checkout@v4`,
        `  - Pin all third-party actions to their SHA or @v4+ tag`,
        `  - Cache dependencies (npm/pip/maven/go modules as appropriate)`,
        `  - Upload test coverage as an artifact`,
        `  - Set timeout-minutes on every job`,
        `  - Use concurrency group to cancel in-flight runs on the same branch`,
        `  - Include proper permissions block (contents: read, by default)`,
        `  - Add workflow_dispatch trigger with environment input if any deploy jobs exist`,
        ``,
        `Return a JSON array: [{ "filename": ".github/workflows/ci.yml", "content": "..." }, ...]`,
        `Return ONLY the JSON array — no markdown code fences.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// GitLab CI prompt builder
// ---------------------------------------------------------------------------

export function buildGitLabCIPrompt(params: {
    repoName:    string;
    description: string;
    language:    string;
    jobs:        PipelineJobSpec[];
    triggers:    PipelineTriggerConfig;
    dockerRegistry?: string;
    kubernetesAgent?: string;   // e.g. 'my-group/my-agent'
    secretRefs?:     string[];
    envVars?:        Record<string, string>;
    dastEnabled?:    boolean;
    sast?:           boolean;
}): string {
    const { repoName, description, language, jobs, triggers } = params;
    const jobDescriptions = jobs.map((j) =>
        `  - Stage/Job "${j.name}": ${j.steps.join('; ')}${j.needs ? ` (depends on: ${j.needs.join(', ')})` : ''}${j.environment ? ` → environment: ${j.environment}` : ''}`,
    ).join('\n');

    return [
        `Generate a production-ready GitLab CI/CD configuration file (.gitlab-ci.yml).`,
        ``,
        `Repository: ${repoName}`,
        `Description: ${description}`,
        `Language / Runtime: ${language}`,
        ``,
        `Triggers:`,
        triggers.onPush    ? `  - Push to: ${(triggers.branches ?? ['main']).join(', ')}` : '',
        triggers.onPr      ? `  - Merge requests` : '',
        triggers.tags?.length ? `  - Tags: ${triggers.tags.join(', ')}` : '',
        triggers.scheduled ? `  - Scheduled (cron): ${triggers.scheduled}` : '',
        triggers.manual    ? `  - Manual jobs (when: manual)` : '',
        ``,
        `Jobs / Stages:`,
        jobDescriptions,
        ``,
        params.dockerRegistry  ? `Docker registry: ${params.dockerRegistry}` : '',
        params.kubernetesAgent ? `Kubernetes agent for deploy: ${params.kubernetesAgent}` : '',
        params.sast            ? `Include GitLab SAST template` : '',
        params.dastEnabled     ? `Include GitLab DAST template` : '',
        ``,
        `Requirements:`,
        `  - Use stages: [build, test, scan, deploy]`,
        `  - Cache dependencies using cache: key: $CI_COMMIT_REF_SLUG`,
        `  - Use extends: or !reference[] to avoid duplication`,
        `  - Add retry: 2 on transient failures`,
        `  - Include environment: section for deploy jobs`,
        `  - Use rules: instead of only/except`,
        `  - Add timeout: 30 minutes on jobs`,
        ``,
        `Return a JSON array: [{ "filename": ".gitlab-ci.yml", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown code fences.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Azure Pipelines prompt builder
// ---------------------------------------------------------------------------

export function buildAzurePipelinesPrompt(params: {
    repoName:    string;
    description: string;
    language:    string;
    jobs:        PipelineJobSpec[];
    triggers:    PipelineTriggerConfig;
    pool?:       string;   // e.g. 'ubuntu-latest', 'windows-latest'
    serviceConnection?: string;
    containerRegistry?: string;
}): string {
    const { repoName, description, language, jobs } = params;
    const jobDescriptions = jobs.map((j) =>
        `  - Job "${j.name}": ${j.steps.join('; ')}`,
    ).join('\n');

    return [
        `Generate a production-ready Azure Pipelines YAML configuration (azure-pipelines.yml).`,
        ``,
        `Repository: ${repoName}`,
        `Description: ${description}`,
        `Language / Runtime: ${language}`,
        `Agent pool: ${params.pool ?? 'ubuntu-latest'}`,
        ``,
        `Jobs:`,
        jobDescriptions,
        ``,
        params.serviceConnection  ? `Azure service connection: ${params.serviceConnection}` : '',
        params.containerRegistry  ? `Azure Container Registry: ${params.containerRegistry}` : '',
        ``,
        `Requirements:`,
        `  - Use trigger: with branch includes/excludes`,
        `  - Use variables: group for variable groups`,
        `  - Include caching step`,
        `  - Use deployment jobs for environment deploys`,
        `  - Add approvals via environment.resources.environments`,
        `  - Set timeoutInMinutes: 30`,
        ``,
        `Return a JSON array: [{ "filename": "azure-pipelines.yml", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown code fences.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Jenkinsfile prompt builder
// ---------------------------------------------------------------------------

export function buildJenkinsfilePrompt(params: {
    repoName:    string;
    description: string;
    language:    string;
    jobs:        PipelineJobSpec[];
    agentLabel?: string;
    dockerEnabled?: boolean;
    notifySlack?: boolean;
}): string {
    const { repoName, description, language, jobs } = params;
    const stageDescriptions = jobs.map((j) =>
        `  - Stage "${j.name}": ${j.steps.join('; ')}`,
    ).join('\n');

    return [
        `Generate a production-ready Jenkins declarative pipeline (Jenkinsfile).`,
        ``,
        `Repository: ${repoName}`,
        `Description: ${description}`,
        `Language / Runtime: ${language}`,
        `Agent label: ${params.agentLabel ?? 'any'}`,
        ``,
        `Stages:`,
        stageDescriptions,
        ``,
        params.dockerEnabled ? `Use Docker agent with pipeline` : '',
        params.notifySlack   ? `Add Slack notification in post { always { } }` : '',
        ``,
        `Requirements:`,
        `  - Use declarative pipeline syntax`,
        `  - Add options { timeout(time: 30, unit: 'MINUTES') }`,
        `  - Include post { failure { ... } success { ... } }`,
        `  - Add environment {} block for credentials()`,
        `  - Include parallel stages for test and lint where possible`,
        ``,
        `Return a JSON array: [{ "filename": "Jenkinsfile", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown code fences.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Output parser (shared across all providers)
// ---------------------------------------------------------------------------

export function parsePipelineOutput(raw: string, provider: PipelineProvider): PipelineParseResult {
    try {
        const cleaned = raw
            .replace(/^```(?:json)?\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
        const parsed = JSON.parse(cleaned) as unknown;
        if (!Array.isArray(parsed)) {
            return { files: [], summary: 'No files returned by generator' };
        }
        const files: PipelineFile[] = parsed
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .filter((item) => typeof item['filename'] === 'string' && typeof item['content'] === 'string')
            .map((item) => ({
                filename: item['filename'] as string,
                content:  item['content'] as string,
            }));

        const providerNames: Record<PipelineProvider, string> = {
            github_actions:  'GitHub Actions',
            gitlab_ci:       'GitLab CI',
            azure_pipelines: 'Azure Pipelines',
            jenkins:         'Jenkins',
        };

        return {
            files,
            summary: `Generated ${files.length} ${providerNames[provider]} configuration file(s): ${files.map((f) => f.filename).join(', ')}`,
        };
    } catch {
        return { files: [], summary: 'Failed to parse pipeline generator output' };
    }
}

// ---------------------------------------------------------------------------
// Prompt builder router — picks the right prompt for the provider
// ---------------------------------------------------------------------------

export function buildPipelinePrompt(params: {
    provider:    PipelineProvider;
    repoName:    string;
    description: string;
    language:    string;
    jobs:        PipelineJobSpec[];
    triggers:    PipelineTriggerConfig;
    [key: string]: unknown;
}): string {
    switch (params.provider) {
        case 'github_actions':
            return buildGitHubActionsPrompt(params as Parameters<typeof buildGitHubActionsPrompt>[0]);
        case 'gitlab_ci':
            return buildGitLabCIPrompt(params as Parameters<typeof buildGitLabCIPrompt>[0]);
        case 'azure_pipelines':
            return buildAzurePipelinesPrompt(params as Parameters<typeof buildAzurePipelinesPrompt>[0]);
        case 'jenkins':
            return buildJenkinsfilePrompt(params as Parameters<typeof buildJenkinsfilePrompt>[0]);
    }
}

// ---------------------------------------------------------------------------
// Default job specs for common pipeline patterns
// ---------------------------------------------------------------------------

export function defaultCiJobs(language: string): PipelineJobSpec[] {
    const lc = language.toLowerCase();

    if (lc.includes('node') || lc.includes('javascript') || lc.includes('typescript')) {
        return [
            { name: 'lint',  steps: ['Install dependencies with npm ci', 'Run ESLint'] },
            { name: 'test',  steps: ['Run Jest unit tests with coverage', 'Upload coverage report'] },
            { name: 'build', steps: ['Run npm run build', 'Upload build artifact'], needs: ['lint', 'test'] },
        ];
    }

    if (lc.includes('python')) {
        return [
            { name: 'lint',  steps: ['Install dependencies with pip', 'Run flake8 and black --check'] },
            { name: 'test',  steps: ['Run pytest with coverage', 'Upload coverage to Codecov'] },
            { name: 'build', steps: ['Build Docker image'], needs: ['test'] },
        ];
    }

    if (lc.includes('go') || lc.includes('golang')) {
        return [
            { name: 'lint',  steps: ['Run golangci-lint'] },
            { name: 'test',  steps: ['Run go test ./... with coverage', 'Run go vet'] },
            { name: 'build', steps: ['Build binary with go build', 'Upload binary artifact'], needs: ['test'] },
        ];
    }

    if (lc.includes('java') || lc.includes('maven') || lc.includes('gradle')) {
        return [
            { name: 'test',  steps: ['Run mvn test or gradle test with coverage'] },
            { name: 'build', steps: ['Run mvn package or gradle build', 'Upload JAR artifact'], needs: ['test'] },
        ];
    }

    // Generic fallback
    return [
        { name: 'test',  steps: ['Run unit tests'] },
        { name: 'build', steps: ['Build the application'], needs: ['test'] },
    ];
}
