// ============================================================================
// DEVOPS K8S EXEC BUILDER
//
// Builders for in-cluster command execution:
//   kubectl exec         — run ad-hoc commands in a running container
//   Database operations  — pg_dump, psql migration, redis-cli, mongo shell
//   One-off K8s Jobs     — generate Job YAML, wait for completion, tail logs
//
// All builders return string arrays suitable for passing to runCommand().
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface K8sJobSpec {
    jobName:      string;
    namespace:    string;
    image:        string;
    command:      string[];
    envVars?:     Record<string, string>;
    secretEnvs?:  Array<{ envName: string; secretName: string; secretKey: string }>;
    ttlSeconds?:  number;         // clean up after N seconds (default: 300)
    backoffLimit?: number;        // retries (default: 0 for migrations)
    serviceAccount?: string;
    resources?:   { cpu: string; memory: string };
}

export type DbEngine = 'postgres' | 'mysql' | 'redis' | 'mongodb';

// ---------------------------------------------------------------------------
// kubectl exec builders
// ---------------------------------------------------------------------------

/**
 * Build `kubectl exec` args for running a command in a running container.
 * Returns args suitable for runCommand; the command comes after `--`.
 */
export function buildKubectlExecArgs(params: {
    pod:          string;         // exact pod name or a label selector prefix
    namespace:    string;
    command:      string[];       // command + args to run inside the container
    container?:   string;         // -c flag (needed in multi-container pods)
    stdin?:       boolean;        // -i
    tty?:         boolean;        // -t
    podSelector?: boolean;        // if true, pod is a label selector, not a name
}): string[] {
    const args = ['kubectl', 'exec', '-n', params.namespace];
    if (params.container) args.push('-c', params.container);
    if (params.stdin)     args.push('-i');
    if (params.tty)       args.push('-t');
    args.push(params.pod, '--', ...params.command);
    return args;
}

/**
 * Build `kubectl exec` args that use the first pod matching a label selector.
 * Generates a two-step approach: first get the pod name, then exec into it.
 */
export function buildGetPodNameArgs(labelSelector: string, namespace: string): string[] {
    return ['kubectl', 'get', 'pod', '-l', labelSelector, '-n', namespace,
        '-o', 'jsonpath={.items[0].metadata.name}'];
}

// ---------------------------------------------------------------------------
// Database operation builders
// ---------------------------------------------------------------------------

/**
 * Build args to run a database migration command inside a pod.
 * Supports common migration frameworks:
 *   - Prisma:    prisma migrate deploy
 *   - Flyway:    flyway migrate
 *   - Alembic:   alembic upgrade head
 *   - Liquibase: liquibase update
 *   - Custom:    any shell command
 */
export function buildDbMigrationExecArgs(params: {
    pod:        string;
    namespace:  string;
    engine?:    DbEngine;
    framework?: 'prisma' | 'flyway' | 'alembic' | 'liquibase' | 'custom';
    customCommand?: string[];   // for 'custom' framework
    container?: string;
}): string[] {
    let command: string[];
    switch (params.framework) {
        case 'prisma':    command = ['npx', 'prisma', 'migrate', 'deploy']; break;
        case 'flyway':    command = ['flyway', 'migrate']; break;
        case 'alembic':   command = ['alembic', 'upgrade', 'head']; break;
        case 'liquibase': command = ['liquibase', 'update']; break;
        default:          command = params.customCommand ?? ['echo', 'no migration command specified'];
    }
    return buildKubectlExecArgs({ pod: params.pod, namespace: params.namespace, command, container: params.container });
}

/**
 * Build pg_dump args executed inside a Postgres pod.
 */
export function buildPgDumpExecArgs(params: {
    pod:        string;
    namespace:  string;
    database:   string;
    user?:      string;
    host?:      string;         // default: localhost
    format?:    'plain' | 'custom' | 'directory' | 'tar';  // -F
    outputPath?: string;        // inside the container — pipe to a file
    container?:  string;
    noOwner?:    boolean;       // -O
    noAcl?:      boolean;       // -x
}): string[] {
    const pgDump = ['pg_dump',
        '-U', params.user ?? 'postgres',
        '-h', params.host ?? 'localhost',
        '-F', params.format === 'custom' ? 'c' : params.format === 'directory' ? 'd' : params.format === 'tar' ? 't' : 'p',
        ...(params.noOwner ? ['-O'] : []),
        ...(params.noAcl   ? ['-x'] : []),
        params.database,
        ...(params.outputPath ? ['-f', params.outputPath] : []),
    ];
    return buildKubectlExecArgs({ pod: params.pod, namespace: params.namespace, command: pgDump, container: params.container });
}

/**
 * Build psql exec args for running a SQL statement directly.
 */
export function buildPsqlExecArgs(params: {
    pod:       string;
    namespace: string;
    database:  string;
    sql:       string;          // SQL statement to execute
    user?:     string;
    host?:     string;
    container?: string;
}): string[] {
    const psql = ['psql', '-U', params.user ?? 'postgres', '-h', params.host ?? 'localhost', '-d', params.database, '-c', params.sql];
    return buildKubectlExecArgs({ pod: params.pod, namespace: params.namespace, command: psql, container: params.container });
}

/**
 * Build redis-cli exec args.
 * Supports FLUSHDB, FLUSHALL, DEL by pattern (via redis-cli --scan | xargs), and arbitrary commands.
 */
export function buildRedisExecArgs(params: {
    pod:           string;
    namespace:     string;
    operation:     'flushdb' | 'flushall' | 'del_pattern' | 'info' | 'custom';
    pattern?:      string;       // for del_pattern
    customCommand?: string[];    // for 'custom'
    host?:         string;       // default: localhost
    port?:         number;       // default: 6379
    password?:     string;       // -a flag
    container?:    string;
}): string[] {
    const redisCli = ['redis-cli', '-h', params.host ?? 'localhost', '-p', String(params.port ?? 6379)];
    if (params.password) redisCli.push('-a', params.password);

    let command: string[];
    switch (params.operation) {
        case 'flushdb':      command = [...redisCli, 'FLUSHDB']; break;
        case 'flushall':     command = [...redisCli, 'FLUSHALL']; break;
        case 'info':         command = [...redisCli, 'INFO']; break;
        case 'del_pattern':  {
            // redis-cli --scan --pattern 'prefix:*' | xargs redis-cli del
            // Run as a shell -c command inside the pod
            const scan = `redis-cli -h ${params.host ?? 'localhost'} -p ${params.port ?? 6379} --scan --pattern '${params.pattern ?? '*'}' | xargs ${redisCli.join(' ')} del`;
            command = ['sh', '-c', scan];
            break;
        }
        default: command = [...redisCli, ...(params.customCommand ?? ['PING'])];
    }

    return buildKubectlExecArgs({ pod: params.pod, namespace: params.namespace, command, container: params.container });
}

/**
 * Build mongo shell exec args for a MongoDB pod.
 */
export function buildMongoExecArgs(params: {
    pod:        string;
    namespace:  string;
    database:   string;
    jsScript:   string;         // JavaScript to eval, e.g. "db.collection.find().count()"
    host?:      string;
    port?:      number;
    username?:  string;
    password?:  string;
    container?: string;
}): string[] {
    const mongo = [
        'mongosh',
        `${params.host ?? 'localhost'}:${params.port ?? 27017}/${params.database}`,
        '--eval', params.jsScript,
        ...(params.username ? ['--username', params.username] : []),
        ...(params.password ? ['--password', params.password] : []),
        '--quiet',
    ];
    return buildKubectlExecArgs({ pod: params.pod, namespace: params.namespace, command: mongo, container: params.container });
}

// ---------------------------------------------------------------------------
// One-off Kubernetes Job builders
// ---------------------------------------------------------------------------

/**
 * Generate a Kubernetes Job YAML for a one-off task (migration, seed, cleanup).
 */
export function buildK8sJobYaml(spec: K8sJobSpec): string {
    const envYaml: string[] = [];

    for (const [name, value] of Object.entries(spec.envVars ?? {})) {
        envYaml.push(`            - name: ${name}\n              value: "${value}"`);
    }
    for (const se of spec.secretEnvs ?? []) {
        envYaml.push([
            `            - name: ${se.envName}`,
            `              valueFrom:`,
            `                secretKeyRef:`,
            `                  name: ${se.secretName}`,
            `                  key: ${se.secretKey}`,
        ].join('\n'));
    }

    const cpuReq  = spec.resources?.cpu    ?? '100m';
    const memReq  = spec.resources?.memory ?? '256Mi';
    const envBlock = envYaml.length > 0 ? `          env:\n${envYaml.join('\n')}` : '';

    return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${spec.jobName}
  namespace: ${spec.namespace}
  labels:
    app.kubernetes.io/name: ${spec.jobName}
    app.kubernetes.io/component: job
spec:
  ttlSecondsAfterFinished: ${spec.ttlSeconds ?? 300}
  backoffLimit: ${spec.backoffLimit ?? 0}
  template:
    spec:
      restartPolicy: Never
      ${spec.serviceAccount ? `serviceAccountName: ${spec.serviceAccount}` : ''}
      containers:
        - name: ${spec.jobName}
          image: ${spec.image}
          command: [${spec.command.map((c) => `"${c}"`).join(', ')}]
${envBlock}
          resources:
            requests:
              cpu: "${cpuReq}"
              memory: "${memReq}"
            limits:
              cpu: "${cpuReq}"
              memory: "${memReq}"`;
}

/** Build kubectl apply args for a Job manifest. */
export function buildKubectlCreateJobArgs(manifestPath: string, namespace?: string): string[] {
    const args = ['kubectl', 'apply', '-f', manifestPath];
    if (namespace) args.push('-n', namespace);
    return args;
}

/** Build kubectl wait args — wait for a Job to complete. */
export function buildKubectlWaitJobArgs(jobName: string, namespace: string, timeoutSeconds = 300): string[] {
    return ['kubectl', 'wait', 'job', jobName, '-n', namespace,
        '--for=condition=complete',
        `--timeout=${timeoutSeconds}s`];
}

/** Build kubectl logs args for a Job's pod. */
export function buildKubectlLogsJobArgs(jobName: string, namespace: string): string[] {
    return ['kubectl', 'logs', '-n', namespace, `job/${jobName}`];
}

/** Build kubectl delete job args. */
export function buildKubectlDeleteJobArgs(jobName: string, namespace: string): string[] {
    return ['kubectl', 'delete', 'job', jobName, '-n', namespace, '--ignore-not-found'];
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

export function parseJobStatus(raw: string): { name: string; namespace: string; succeeded: number; failed: number; active: number; complete: boolean } | null {
    try {
        const json = JSON.parse(raw) as {
            metadata?: { name?: string; namespace?: string };
            status?: { succeeded?: number; failed?: number; active?: number; conditions?: Array<{ type: string; status: string }> };
        };
        const conditions = json.status?.conditions ?? [];
        const complete = conditions.some((c) => c.type === 'Complete' && c.status === 'True');
        return {
            name:      json.metadata?.name ?? '',
            namespace: json.metadata?.namespace ?? '',
            succeeded: json.status?.succeeded ?? 0,
            failed:    json.status?.failed    ?? 0,
            active:    json.status?.active    ?? 0,
            complete,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// LLM prompt for generating a one-off migration job
// ---------------------------------------------------------------------------

export function buildMigrationJobPrompt(params: {
    appName:        string;
    namespace:      string;
    image:          string;
    framework:      string;   // e.g. 'Prisma', 'Flyway', 'Alembic'
    dbSecretName:   string;
    description?:   string;
    serviceAccount?: string;
}): string {
    return [
        `Generate a Kubernetes Job YAML for running a database migration.`,
        ``,
        `App: ${params.appName}`,
        `Namespace: ${params.namespace}`,
        `Image: ${params.image}`,
        `Migration framework: ${params.framework}`,
        `DB secret name: ${params.dbSecretName}`,
        params.description ? `Description: ${params.description}` : '',
        params.serviceAccount ? `Service account: ${params.serviceAccount}` : '',
        ``,
        `Requirements:`,
        `  - apiVersion: batch/v1, kind: Job`,
        `  - restartPolicy: Never, backoffLimit: 0`,
        `  - ttlSecondsAfterFinished: 300`,
        `  - Mount DB credentials from secret "${params.dbSecretName}" as env vars`,
        `  - Set resource limits (cpu: 500m, memory: 512Mi)`,
        `  - Add labels: app.kubernetes.io/name, app.kubernetes.io/component: migration`,
        ``,
        `Return a JSON array: [{ "filename": "${params.appName}-migration-job.yaml", "content": "..." }]`,
        `Return ONLY the JSON array — no markdown fences.`,
    ].filter(Boolean).join('\n');
}
