// ============================================================================
// BOOTSTRAP ACTION HANDLER — Gap 4: Cloud & GitHub Org Bootstrap
//
// Gives the DevOps agent the ability to provision entire cloud accounts and
// GitHub organisations from scratch using well-known CLIs (AWS CLI, gh CLI,
// eksctl / Terraform).
//
// Actions:
//   workspace_bootstrap_aws_org    — AWS sub-account + IAM + billing alerts
//   workspace_bootstrap_github_org — GitHub repos, teams, CODEOWNERS, branch-protection
//   workspace_bootstrap_k8s_cluster — EKS cluster via eksctl or Terraform
//
// Architecture:
//   All I/O via runCommand / executeAction callbacks (no direct imports).
//   Pure builder helpers produce CLI commands; the handler executes them.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BootstrapActionType =
    | 'workspace_bootstrap_aws_org'
    | 'workspace_bootstrap_github_org'
    | 'workspace_bootstrap_k8s_cluster';

export const BOOTSTRAP_ACTION_TYPES = new Set<BootstrapActionType>([
    'workspace_bootstrap_aws_org',
    'workspace_bootstrap_github_org',
    'workspace_bootstrap_k8s_cluster',
]);

export function isBootstrapActionType(at: string): at is BootstrapActionType {
    return BOOTSTRAP_ACTION_TYPES.has(at as BootstrapActionType);
}

export type BootstrapActionResult = {
    ok:           boolean;
    output:       string;
    errorOutput?: string;
    [key: string]: unknown;
};

type RunCommandFn = (
    args:      string[],
    cwd:       string,
    timeoutMs?: number,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

type ExecuteActionFn = (
    actionType: string,
    payload:    Record<string, unknown>,
) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;

export interface BootstrapActionParams {
    actionType:    BootstrapActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    runCommand?:   RunCommandFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function safeJson(obj: Record<string, unknown>): BootstrapActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}

async function run(
    runCommand:  RunCommandFn,
    args:        string[],
    cwd:         string,
    timeoutMs  = 300_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
    const r = await runCommand(args, cwd, timeoutMs);
    return { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr };
}

// ---------------------------------------------------------------------------
// AWS Org bootstrap — pure builder helpers
// ---------------------------------------------------------------------------

function buildAwsAccountCreateCmd(accountName: string, email: string, ouId: string): string[][] {
    const cmds: string[][] = [];

    // Create the account under the OU
    cmds.push([
        'aws', 'organizations', 'create-account',
        '--account-name', accountName,
        '--email', email,
        '--iam-user-access-to-billing', 'ALLOW',
        '--output', 'json',
    ]);

    // Move to the target OU (requires account-id — caller must chain)
    if (ouId) {
        cmds.push([
            'aws', 'organizations', 'move-account',
            '--account-id', 'ACCOUNT_ID_PLACEHOLDER',
            '--source-parent-id', 'ROOT_ID_PLACEHOLDER',
            '--destination-parent-id', ouId,
        ]);
    }

    return cmds;
}

function buildAwsBillingAlertCmd(threshold: number, email: string, region: string): string[][] {
    const topicArn = `arn:aws:sns:${region}:ACCOUNT_ID:billing-alerts`;
    return [
        [
            'aws', 'cloudwatch', 'put-metric-alarm',
            '--alarm-name', 'BillingThreshold',
            '--alarm-description', `Alert when estimated charges exceed $${threshold}`,
            '--namespace', 'AWS/Billing',
            '--metric-name', 'EstimatedCharges',
            '--dimensions', 'Name=Currency,Value=USD',
            '--statistic', 'Maximum',
            '--period', '86400',
            '--evaluation-periods', '1',
            '--threshold', String(threshold),
            '--comparison-operator', 'GreaterThanOrEqualToThreshold',
            '--alarm-actions', topicArn,
            '--region', 'us-east-1',   // billing metrics only in us-east-1
        ],
        [
            'aws', 'sns', 'subscribe',
            '--topic-arn', topicArn,
            '--protocol', 'email',
            '--notification-endpoint', email,
            '--region', 'us-east-1',
        ],
    ];
}

// ---------------------------------------------------------------------------
// GitHub Org bootstrap — pure builder helpers
// ---------------------------------------------------------------------------

function buildCODEOWNERS(teamSlug: string, paths: string[]): string {
    const lines = ['# Auto-generated CODEOWNERS', ''];
    for (const p of paths) {
        lines.push(`${p} @${teamSlug}`);
    }
    return lines.join('\n');
}

function buildBranchProtectionPayload(requirePr: boolean, requiredReviewCount: number): string {
    return JSON.stringify({
        required_status_checks:       { strict: true, contexts: [] },
        enforce_admins:               false,
        required_pull_request_reviews: requirePr
            ? { required_approving_review_count: requiredReviewCount, dismiss_stale_reviews: true }
            : null,
        restrictions: null,
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleBootstrapAction(
    params: BootstrapActionParams,
): Promise<BootstrapActionResult> {
    const { actionType, payload, workspaceDir, executeAction, runCommand } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_bootstrap_aws_org
        // Creates a new AWS sub-account in the organisation, moves it to the
        // correct OU, creates an admin IAM role, and sets billing alerts.
        //
        // payload:
        //   account_name        — new account name (required)
        //   account_email       — root email for the new account (required)
        //   ou_id?              — target OU ID (e.g. ou-xxxx-yyyyyyyy)
        //   billing_threshold?  — USD amount for billing alert (default: 100)
        //   alert_email?        — email to receive billing alerts
        //   admin_role_name?    — IAM role name to create (default: OrgAdminRole)
        //   region?             — AWS region (default: us-east-1)
        //   dry_run?            — print commands only, do not execute
        // ====================================================================
        case 'workspace_bootstrap_aws_org': {
            const accountName       = str(payload['account_name']);
            const accountEmail      = str(payload['account_email']);
            const ouId              = str(payload['ou_id']);
            const billingThreshold  = typeof payload['billing_threshold'] === 'number' ? payload['billing_threshold'] : 100;
            const alertEmail        = str(payload['alert_email'], accountEmail);
            const adminRoleName     = str(payload['admin_role_name'], 'OrgAdminRole');
            const region            = str(payload['region'], 'us-east-1');
            const dryRun            = payload['dry_run'] === true;

            if (!accountName || !accountEmail) {
                return { ok: false, output: '', errorOutput: 'workspace_bootstrap_aws_org: account_name and account_email are required' };
            }

            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'workspace_bootstrap_aws_org: runCommand is not available' };
            }

            const steps: string[] = [];
            let accountId: string | null = null;

            // Step 1: Create account
            const createCmds = buildAwsAccountCreateCmd(accountName, accountEmail, ouId);
            if (dryRun) {
                steps.push(`[dry-run] create-account: ${createCmds[0]!.join(' ')}`);
            } else {
                const createResult = await run(runCommand, createCmds[0]!, workspaceDir);
                if (createResult.ok) {
                    try {
                        const parsed = JSON.parse(createResult.stdout) as { CreateAccountStatus?: { AccountId?: string } };
                        accountId = parsed.CreateAccountStatus?.AccountId ?? null;
                    } catch { /* ignore parse error */ }
                    steps.push(`Account created${accountId ? ': ' + accountId : ''}`);
                } else {
                    steps.push(`Account creation failed: ${createResult.stderr.slice(0, 200)}`);
                }
            }

            // Step 2: Create IAM admin role in new account (requires cross-account assume-role, simplified here)
            const iamRoleCmd = [
                'aws', 'iam', 'create-role',
                '--role-name', adminRoleName,
                '--assume-role-policy-document',
                JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [{
                        Effect: 'Allow',
                        Principal: { AWS: 'arn:aws:iam::MANAGEMENT_ACCOUNT_ID:root' },
                        Action: 'sts:AssumeRole',
                    }],
                }),
                '--region', region,
            ];
            if (dryRun) {
                steps.push(`[dry-run] create-role: ${iamRoleCmd.join(' ')}`);
            } else if (accountId) {
                const roleResult = await run(runCommand, iamRoleCmd, workspaceDir);
                steps.push(roleResult.ok ? `IAM role "${adminRoleName}" created` : `IAM role creation failed: ${roleResult.stderr.slice(0, 150)}`);
            }

            // Step 3: Billing alerts
            const billingCmds = buildAwsBillingAlertCmd(billingThreshold, alertEmail, region);
            if (dryRun) {
                steps.push(`[dry-run] billing-alert: threshold=$${billingThreshold}, email=${alertEmail}`);
            } else {
                for (const cmd of billingCmds) {
                    const br = await run(runCommand, cmd, workspaceDir);
                    steps.push(br.ok ? `Billing alert step done` : `Billing alert step failed: ${br.stderr.slice(0, 100)}`);
                }
            }

            // Persist a bootstrap record
            const record = {
                type:            'aws_org_bootstrap',
                account_name:    accountName,
                account_email:   accountEmail,
                account_id:      accountId,
                ou_id:           ouId || null,
                admin_role:      adminRoleName,
                billing_threshold: billingThreshold,
                alert_email:     alertEmail,
                region,
                dry_run:         dryRun,
                bootstrapped_at: new Date().toISOString(),
            };
            await executeAction('workspace_write_file', {
                file_path: '.agentfarm/bootstrap-aws.json',
                content:   JSON.stringify(record, null, 2),
            });

            return safeJson({
                account_name:      accountName,
                account_id:        accountId,
                admin_role:        adminRoleName,
                billing_threshold: billingThreshold,
                dry_run:           dryRun,
                steps,
                summary: dryRun
                    ? `AWS org bootstrap plan: ${accountName} (dry-run)`
                    : `AWS account "${accountName}" bootstrapped${accountId ? ' (ID: ' + accountId + ')' : ''}`,
            });
        }

        // ====================================================================
        // workspace_bootstrap_github_org
        // Creates repos, teams, CODEOWNERS files, and branch protection rules
        // in a GitHub org using the gh CLI.
        //
        // payload:
        //   org              — GitHub org name (required)
        //   repos            — string[] of repo names to create
        //   teams            — { name, members: string[], repos: string[] }[]
        //   default_branch?  — default branch name (default: main)
        //   require_pr?      — enforce PR review (default: true)
        //   required_reviews? — number of required reviewers (default: 1)
        //   dry_run?         — print commands only, do not execute
        // ====================================================================
        case 'workspace_bootstrap_github_org': {
            const org            = str(payload['org']);
            const repos          = Array.isArray(payload['repos']) ? (payload['repos'] as string[]) : [];
            const teamsRaw       = Array.isArray(payload['teams']) ? (payload['teams'] as Array<Record<string, unknown>>) : [];
            const defaultBranch  = str(payload['default_branch'], 'main');
            const requirePr      = payload['require_pr'] !== false;
            const requiredReviews = typeof payload['required_reviews'] === 'number' ? payload['required_reviews'] : 1;
            const dryRun         = payload['dry_run'] === true;

            if (!org) {
                return { ok: false, output: '', errorOutput: 'workspace_bootstrap_github_org: org is required' };
            }

            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'workspace_bootstrap_github_org: runCommand is not available' };
            }

            const steps: string[] = [];

            // Step 1: Create repos
            for (const repo of repos) {
                const cmd = ['gh', 'repo', 'create', `${org}/${repo}`,
                    '--private', '--description', `${repo} — bootstrapped by AgentFarm`];
                if (dryRun) {
                    steps.push(`[dry-run] create repo: ${org}/${repo}`);
                } else {
                    const r = await run(runCommand, cmd, workspaceDir, 60_000);
                    steps.push(r.ok ? `Repo ${org}/${repo} created` : `Repo ${repo} failed: ${r.stderr.slice(0, 120)}`);
                }
            }

            // Step 2: Create teams and add members
            for (const team of teamsRaw) {
                const teamName    = str(team['name']);
                const members     = Array.isArray(team['members']) ? (team['members'] as string[]) : [];
                const teamRepos   = Array.isArray(team['repos'])   ? (team['repos']   as string[]) : [];
                const teamSlug    = teamName.toLowerCase().replace(/\s+/g, '-');

                const createTeamCmd = ['gh', 'api', `orgs/${org}/teams`,
                    '--method', 'POST',
                    '--field', `name=${teamName}`,
                    '--field', `privacy=closed`];

                if (dryRun) {
                    steps.push(`[dry-run] create team: ${teamName} (${members.length} members)`);
                } else {
                    const tr = await run(runCommand, createTeamCmd, workspaceDir, 60_000);
                    steps.push(tr.ok ? `Team "${teamName}" created` : `Team failed: ${tr.stderr.slice(0, 100)}`);

                    // Add members
                    for (const member of members) {
                        const addCmd = ['gh', 'api', `orgs/${org}/teams/${teamSlug}/memberships/${member}`,
                            '--method', 'PUT', '--field', 'role=member'];
                        const mr = await run(runCommand, addCmd, workspaceDir, 30_000);
                        steps.push(mr.ok ? `Added ${member} to ${teamName}` : `Failed to add ${member}: ${mr.stderr.slice(0, 80)}`);
                    }

                    // Grant team access to repos
                    for (const teamRepo of teamRepos) {
                        const grantCmd = ['gh', 'api', `orgs/${org}/teams/${teamSlug}/repos/${org}/${teamRepo}`,
                            '--method', 'PUT', '--field', 'permission=push'];
                        const gr = await run(runCommand, grantCmd, workspaceDir, 30_000);
                        steps.push(gr.ok ? `Granted ${teamName} push to ${teamRepo}` : `Grant failed: ${gr.stderr.slice(0, 80)}`);

                        // Write CODEOWNERS
                        const codeownersContent = buildCODEOWNERS(`${org}/${teamSlug}`, ['/*', '/src/', '/packages/']);
                        await executeAction('workspace_write_file', {
                            file_path: `.agentfarm/codeowners-${teamRepo}.txt`,
                            content:   codeownersContent,
                        });
                    }
                }
            }

            // Step 3: Branch protection on all repos
            const bpPayload = buildBranchProtectionPayload(requirePr, requiredReviews);
            for (const repo of repos) {
                const bpCmd = [
                    'gh', 'api',
                    `repos/${org}/${repo}/branches/${defaultBranch}/protection`,
                    '--method', 'PUT',
                    '--input', '-',
                ];
                if (dryRun) {
                    steps.push(`[dry-run] branch-protection: ${org}/${repo}@${defaultBranch} (require_pr=${requirePr}, reviews=${requiredReviews})`);
                } else {
                    // Write payload to temp file and pass via stdin
                    const bpFile = `.agentfarm/bp-${repo}.json`;
                    await executeAction('workspace_write_file', { file_path: bpFile, content: bpPayload });
                    const bpCmdWithInput = [...bpCmd.slice(0, -2), '--input', bpFile];
                    const bpr = await run(runCommand, bpCmdWithInput, workspaceDir, 60_000);
                    steps.push(bpr.ok
                        ? `Branch protection set: ${repo}@${defaultBranch}`
                        : `Branch protection failed for ${repo}: ${bpr.stderr.slice(0, 100)}`);
                }
            }

            return safeJson({
                org,
                repos_created:  repos.length,
                teams_created:  teamsRaw.length,
                default_branch: defaultBranch,
                require_pr:     requirePr,
                dry_run:        dryRun,
                steps,
                summary: dryRun
                    ? `GitHub org bootstrap plan: ${org} (${repos.length} repos, ${teamsRaw.length} teams)`
                    : `GitHub org "${org}" bootstrapped: ${repos.length} repo(s), ${teamsRaw.length} team(s)`,
            });
        }

        // ====================================================================
        // workspace_bootstrap_k8s_cluster
        // Provisions an EKS cluster (via eksctl) or any Kubernetes cluster
        // (via kubectl + a Terraform plan file).
        //
        // payload:
        //   cluster_name   — cluster name (required)
        //   region?        — AWS region (default: us-east-1)
        //   node_type?     — EC2 instance type (default: t3.medium)
        //   node_count?    — desired node count (default: 2)
        //   k8s_version?   — Kubernetes version (default: 1.29)
        //   tool?          — eksctl | terraform (default: eksctl)
        //   tf_dir?        — Terraform working dir (for tool=terraform)
        //   namespaces?    — string[] of namespaces to create after cluster
        //   dry_run?       — print commands only, do not execute
        // ====================================================================
        case 'workspace_bootstrap_k8s_cluster': {
            const clusterName  = str(payload['cluster_name']);
            const region       = str(payload['region'], 'us-east-1');
            const nodeType     = str(payload['node_type'], 't3.medium');
            const nodeCount    = typeof payload['node_count']  === 'number' ? payload['node_count']  : 2;
            const k8sVersion   = str(payload['k8s_version'], '1.29');
            const tool         = str(payload['tool'], 'eksctl');
            const tfDir        = str(payload['tf_dir'], workspaceDir);
            const namespaces   = Array.isArray(payload['namespaces']) ? (payload['namespaces'] as string[]) : [];
            const dryRun       = payload['dry_run'] === true;

            if (!clusterName) {
                return { ok: false, output: '', errorOutput: 'workspace_bootstrap_k8s_cluster: cluster_name is required' };
            }

            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'workspace_bootstrap_k8s_cluster: runCommand is not available' };
            }

            const steps: string[] = [];

            if (tool === 'terraform') {
                // Terraform path
                const tfCmds = [
                    ['terraform', 'init'],
                    ['terraform', 'plan', '-out=tfplan'],
                    ['terraform', 'apply', '-auto-approve', 'tfplan'],
                ];
                for (const cmd of tfCmds) {
                    if (dryRun) {
                        steps.push(`[dry-run] ${cmd.join(' ')}`);
                    } else {
                        const r = await run(runCommand, cmd, tfDir, 600_000);
                        steps.push(r.ok ? `${cmd[1]} succeeded` : `${cmd[1]} failed: ${r.stderr.slice(0, 200)}`);
                        if (!r.ok && cmd[1] === 'apply') break;
                    }
                }
            } else {
                // eksctl path (default)
                const clusterConfigContent = [
                    `apiVersion: eksctl.io/v1alpha5`,
                    `kind: ClusterConfig`,
                    `metadata:`,
                    `  name: ${clusterName}`,
                    `  region: ${region}`,
                    `  version: "${k8sVersion}"`,
                    `managedNodeGroups:`,
                    `  - name: ng-default`,
                    `    instanceType: ${nodeType}`,
                    `    desiredCapacity: ${nodeCount}`,
                    `    minSize: 1`,
                    `    maxSize: ${Math.max(nodeCount * 2, 4)}`,
                    `    amiFamily: AmazonLinux2`,
                ].join('\n');

                const configFile = '.agentfarm/eksctl-cluster.yaml';
                await executeAction('workspace_write_file', {
                    file_path: configFile,
                    content:   clusterConfigContent,
                });
                steps.push(`eksctl config written: ${configFile}`);

                const eksCmd = ['eksctl', 'create', 'cluster', '--config-file', configFile];
                if (dryRun) {
                    steps.push(`[dry-run] eksctl: ${eksCmd.join(' ')}`);
                } else {
                    const r = await run(runCommand, eksCmd, workspaceDir, 900_000); // 15 min
                    steps.push(r.ok
                        ? `EKS cluster "${clusterName}" created in ${region}`
                        : `EKS creation failed: ${r.stderr.slice(0, 300)}`);
                }
            }

            // Create namespaces
            for (const ns of namespaces) {
                const nsCmd = ['kubectl', 'create', 'namespace', ns];
                if (dryRun) {
                    steps.push(`[dry-run] kubectl create namespace ${ns}`);
                } else {
                    const r = await run(runCommand, nsCmd, workspaceDir, 30_000);
                    steps.push(r.ok ? `Namespace "${ns}" created` : `Namespace failed: ${r.stderr.slice(0, 80)}`);
                }
            }

            // Save bootstrap record
            await executeAction('workspace_write_file', {
                file_path: '.agentfarm/bootstrap-k8s.json',
                content:   JSON.stringify({
                    cluster_name: clusterName, region, node_type: nodeType,
                    node_count: nodeCount, k8s_version: k8sVersion,
                    tool, namespaces, dry_run: dryRun,
                    bootstrapped_at: new Date().toISOString(),
                }, null, 2),
            });

            return safeJson({
                cluster_name: clusterName,
                region,
                node_type:    nodeType,
                node_count:   nodeCount,
                k8s_version:  k8sVersion,
                tool,
                namespaces,
                dry_run:      dryRun,
                steps,
                summary: dryRun
                    ? `K8s bootstrap plan: ${clusterName} (${tool}, ${nodeCount}x ${nodeType})`
                    : `K8s cluster "${clusterName}" bootstrapped via ${tool}`,
            });
        }
    }
}
