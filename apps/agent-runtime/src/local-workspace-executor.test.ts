import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workspaceBase = await mkdtemp(join(tmpdir(), 'agent-runtime-local-workspace-'));
process.env.AF_WORKSPACE_BASE = workspaceBase;

const {
    executeLocalWorkspaceAction,
    executeLocalWorkspaceActionWithMemoryMirror,
} = await import('./local-workspace-executor.js');

test('executeLocalWorkspaceActionWithMemoryMirror invokes mirror callback', async () => {
    const mirrored: Array<{ actionType: string; executionStatus: string; taskId: string }> = [];

    const result = await executeLocalWorkspaceActionWithMemoryMirror({
        execution: {
            tenantId: 'tenant-mirror',
            botId: 'bot-mirror',
            taskId: 'task-mirror-1',
            actionType: 'code_edit',
            payload: {
                workspace_key: 'repo-mirror',
                file_path: 'README.md',
                content: 'mirror-hook\n',
            },
        },
        onMemoryMirror: (record: { actionType: string; executionStatus: string; taskId: string }) => {
            mirrored.push({
                actionType: record.actionType,
                executionStatus: record.executionStatus,
                taskId: record.taskId,
            });
        },
    });

    assert.equal(result.ok, true);
    assert.equal(mirrored.length, 1);
    assert.deepEqual(mirrored[0], {
        actionType: 'code_edit',
        executionStatus: 'success',
        taskId: 'task-mirror-1',
    });
});

test('code_edit_patch replaces exact snippet in workspace file', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-patch-1';
    const workspaceKey = 'repo-1';

    const writeResult = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'code_edit',
        payload: {
            workspace_key: workspaceKey,
            file_path: 'src/demo.ts',
            content: 'const value = 1;\n',
        },
    });
    assert.equal(writeResult.ok, true);

    const patchResult = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'code_edit_patch',
        payload: {
            workspace_key: workspaceKey,
            file_path: 'src/demo.ts',
            old_text: 'const value = 1;',
            new_text: 'const value = 2;',
        },
    });
    assert.equal(patchResult.ok, true);

    const readResult = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'code_read',
        payload: {
            workspace_key: workspaceKey,
            file_path: 'src/demo.ts',
        },
    });
    assert.equal(readResult.ok, true);
    assert.equal(readResult.output.includes('const value = 2;'), true);
});

test('autonomous_loop applies fix attempt and passes on retry', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-loop-1';

    const loopResult = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'autonomous_loop',
        payload: {
            workspace_key: 'repo-loop-1',
            max_attempts: 2,
            initial_plan: [
                {
                    description: 'Create file with failing marker',
                    actions: [
                        {
                            action: 'code_edit',
                            file_path: 'status.txt',
                            content: 'fail\n',
                        },
                    ],
                },
            ],
            fix_attempts: [
                {
                    description: 'Patch marker to success value',
                    actions: [
                        {
                            action: 'code_edit_patch',
                            file_path: 'status.txt',
                            old_text: 'fail',
                            new_text: 'ok',
                        },
                    ],
                },
            ],
            test_commands: [
                'node -e process.exit(1)',
                'node -e process.exit(0)',
            ],
        },
    });

    assert.equal(loopResult.ok, true);
    assert.equal(loopResult.output.includes('verify:attempt:1:failed'), true);
    assert.equal(loopResult.output.includes('verify:attempt:2:success'), true);

    const readResult = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'code_read',
        payload: {
            workspace_key: 'repo-loop-1',
            file_path: 'status.txt',
        },
    });

    assert.equal(readResult.ok, true);
    assert.equal(readResult.output.trim(), 'ok');
});

test('create_pr_from_workspace returns pr_title and pr_body as JSON', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-pr-1';
    const workspaceKey = 'repo-pr-1';

    // Create a minimal git repo in the workspace
    const { getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    // Helper to run git commands in the workspace
    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });

    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);

    // Write a file and commit
    const writeResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'code_edit',
        payload: { workspace_key: workspaceKey, file_path: 'hello.ts', content: 'export const x = 1;\n' },
    });
    assert.equal(writeResult.ok, true);

    await runGit(['add', '-A']);
    await runGit(['commit', '-m', 'feat: add hello module', '--author', 'AgentFarm Bot <bot@agentfarm.dev>']);

    const prResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'create_pr_from_workspace',
        payload: {
            workspace_key: workspaceKey,
            base_branch: 'main',
            test_summary: '3 tests passed',
        },
    });

    assert.equal(prResult.ok, true);
    const prData = JSON.parse(prResult.output) as {
        pr_title: string;
        pr_body: string;
        head_branch: string;
        base_branch: string;
    };
    assert.equal(typeof prData.pr_title, 'string');
    assert.ok(prData.pr_title.length > 0);
    assert.ok(prData.pr_body.includes('## Summary'));
    assert.ok(prData.pr_body.includes('## Commits'));
    assert.ok(prData.pr_body.includes('3 tests passed'));
    assert.equal(prData.base_branch, 'main');
    assert.equal(typeof prData.head_branch, 'string');
});

test('code_search_replace replaces matches using regex pattern', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-sr-1';
    const workspaceKey = 'repo-sr-1';

    const writeResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'code_edit',
        payload: {
            workspace_key: workspaceKey,
            file_path: 'src/values.ts',
            content: 'const a = 1;\nconst b = 1;\nconst c = 2;\n',
        },
    });
    assert.equal(writeResult.ok, true);

    const srResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'code_search_replace',
        payload: {
            workspace_key: workspaceKey,
            file_path: 'src/values.ts',
            search_pattern: 'const (\\w+) = 1',
            replacement: 'const $1 = 42',
            flags: 'g',
        },
    });
    assert.equal(srResult.ok, true);
    assert.ok(srResult.output.includes('2 replacement(s) made'));

    const readResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'code_read',
        payload: { workspace_key: workspaceKey, file_path: 'src/values.ts' },
    });
    assert.equal(readResult.ok, true);
    assert.ok(readResult.output.includes('const a = 42'));
    assert.ok(readResult.output.includes('const b = 42'));
    assert.ok(readResult.output.includes('const c = 2'));
});

test('code_search_replace returns error when pattern not found', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-sr-2';
    const workspaceKey = 'repo-sr-2';

    await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'code_edit',
        payload: { workspace_key: workspaceKey, file_path: 'file.ts', content: 'hello world\n' },
    });

    const srResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'code_search_replace',
        payload: {
            workspace_key: workspaceKey,
            file_path: 'file.ts',
            search_pattern: 'xyz_not_found',
            replacement: 'something',
        },
    });
    assert.equal(srResult.ok, false);
    assert.ok(srResult.errorOutput?.includes('Pattern not found'));
});

test('workspace_memory_write and workspace_memory_read persist key-value notes', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-mem-1';
    const workspaceKey = 'repo-mem-1';

    // Write a fact
    const writeResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'workspace_memory_write',
        payload: {
            workspace_key: workspaceKey,
            key: 'test_runner',
            value: 'jest',
        },
    });
    assert.equal(writeResult.ok, true);
    assert.ok(writeResult.output.includes('memory:wrote:test_runner'));

    // Write a second fact
    await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'workspace_memory_write',
        payload: { workspace_key: workspaceKey, key: 'primary_lang', value: 'TypeScript' },
    });

    // Read specific key
    const readOne = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'workspace_memory_read',
        payload: { workspace_key: workspaceKey, key: 'test_runner' },
    });
    assert.equal(readOne.ok, true);
    assert.equal(readOne.output, '"jest"');

    // Read all keys
    const readAll = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'workspace_memory_read',
        payload: { workspace_key: workspaceKey },
    });
    assert.equal(readAll.ok, true);
    const memObj = JSON.parse(readAll.output) as Record<string, unknown>;
    assert.equal(memObj['test_runner'], 'jest');
    assert.equal(memObj['primary_lang'], 'TypeScript');
    assert.equal(typeof memObj['_updated_at'], 'string');
});

test('workspace_memory_read returns empty object when memory file does not exist', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-mem-2';
    const workspaceKey = 'repo-mem-2';

    const readResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'workspace_memory_read',
        payload: { workspace_key: workspaceKey },
    });
    assert.equal(readResult.ok, true);
    assert.equal(readResult.output, '{}');
});

test('workspace_memory_promote_request and decision enforce controlled org-memory promotion', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-mem-promote-1';
    const workspaceKey = 'repo-mem-promote-1';

    await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_write',
        payload: {
            workspace_key: workspaceKey,
            key: 'release_playbook',
            value: {
                summary: 'Run quality gate before release',
                checks: ['typecheck', 'tests', 'smoke'],
            },
        },
    });

    const promoteReq = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_promote_request',
        payload: {
            workspace_key: workspaceKey,
            key: 'release_playbook',
        },
    });
    assert.equal(promoteReq.ok, true);
    const reqBody = JSON.parse(promoteReq.output) as { request_id: string; status: string; review_required: boolean };
    assert.equal(reqBody.status, 'pending');
    assert.equal(reqBody.review_required, true);

    const orgBeforeApproval = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_org_read',
        payload: {
            workspace_key: workspaceKey,
            key: 'release_playbook',
        },
    });
    assert.equal(orgBeforeApproval.ok, true);
    assert.equal(JSON.parse(orgBeforeApproval.output).length, 0);

    const rejectDecision = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_promote_decide',
        payload: {
            workspace_key: workspaceKey,
            request_id: reqBody.request_id,
            decision: 'rejected',
            reason: 'Needs clearer remediation steps.',
        },
    });
    assert.equal(rejectDecision.ok, true);
    const rejectBody = JSON.parse(rejectDecision.output) as { status: string; remediation_guidance: string };
    assert.equal(rejectBody.status, 'rejected');
    assert.ok(rejectBody.remediation_guidance.includes('resubmit'));

    const secondReq = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_promote_request',
        payload: {
            workspace_key: workspaceKey,
            key: 'release_playbook',
        },
    });
    assert.equal(secondReq.ok, true);
    const secondBody = JSON.parse(secondReq.output) as { request_id: string };

    const approveDecision = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_promote_decide',
        payload: {
            workspace_key: workspaceKey,
            request_id: secondBody.request_id,
            decision: 'approved',
            reviewer: 'governance_reviewer_1',
        },
    });
    assert.equal(approveDecision.ok, true);
    const approveBody = JSON.parse(approveDecision.output) as { status: string; reviewed_by: string };
    assert.equal(approveBody.status, 'approved');
    assert.equal(approveBody.reviewed_by, 'governance_reviewer_1');

    const orgAfterApproval = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_org_read',
        payload: {
            workspace_key: workspaceKey,
            key: 'release_playbook',
        },
    });
    assert.equal(orgAfterApproval.ok, true);
    const approvedEntries = JSON.parse(orgAfterApproval.output) as Array<Record<string, unknown>>;
    assert.equal(approvedEntries.length, 1);
    assert.equal(approvedEntries[0]?.['key'], 'release_playbook');
    assert.equal(approvedEntries[0]?.['source_workspace_key'], workspaceKey);
});

test('workspace_memory_promote_request blocks sensitive content with remediation guidance', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-mem-promote-2';
    const workspaceKey = 'repo-mem-promote-2';

    await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_write',
        payload: {
            workspace_key: workspaceKey,
            key: 'dangerous_pattern',
            value: 'token=secret_value_do_not_share',
        },
    });

    const promoteReq = await executeLocalWorkspaceAction({
        tenantId,
        botId,
        taskId,
        actionType: 'workspace_memory_promote_request',
        payload: {
            workspace_key: workspaceKey,
            key: 'dangerous_pattern',
        },
    });
    assert.equal(promoteReq.ok, false);
    const rejection = JSON.parse(promoteReq.output) as { reason: string; remediation_guidance: string };
    assert.equal(rejection.reason, 'policy_violation_sensitive_data');
    assert.ok(rejection.remediation_guidance.includes('redact'));
});

test('autonomous_loop output includes structured JSON with attempt records', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-loop-structured-1';

    const loopResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'autonomous_loop',
        payload: {
            workspace_key: 'repo-loop-struct-1',
            max_attempts: 1,
            initial_plan: [],
            fix_attempts: [],
            test_commands: ['node -e process.exit(0)'],
        },
    });

    assert.equal(loopResult.ok, true);
    const parsed = JSON.parse(loopResult.output) as { log: string; attempts: Array<{ attempt: number; passed: boolean; test_exit_code: number }> };
    assert.ok(typeof parsed.log === 'string');
    assert.ok(Array.isArray(parsed.attempts));
    assert.equal(parsed.attempts.length, 1);
    assert.equal(parsed.attempts[0]!.attempt, 1);
    assert.equal(parsed.attempts[0]!.passed, true);
    assert.equal(parsed.attempts[0]!.test_exit_code, 0);
});

test('git_branch auto_name generates semantic branch name', async () => {
    const tenantId = 'tenant-local';
    const botId = 'bot-local';
    const taskId = 'task-branch-auto-1';
    const workspaceKey = 'repo-branch-auto-1';

    const { getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });

    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['commit', '--allow-empty', '-m', 'init']);

    const branchResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId,
        actionType: 'git_branch',
        payload: {
            workspace_key: workspaceKey,
            auto_name: true,
            task_type: 'feat',
            task_description: 'Add user authentication module',
        },
    });

    assert.equal(branchResult.ok, true);
    // output includes the generated branch name which starts with feat/
    assert.ok(branchResult.output.includes('feat/') || branchResult.output.includes('add-user-authentication'));
});

// -------------------------------------------------------------------------
// New Tier 1/2 action tests
// -------------------------------------------------------------------------

test('workspace_list_files returns JSON array of workspace file paths', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-wlf';
    const botId = 'bot-wlf';
    const workspaceKey = 'repo-wlf-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await mkdir(join(wsDir, 'src'), { recursive: true });
    await writeFile(join(wsDir, 'package.json'), '{}', 'utf-8');
    await writeFile(join(wsDir, 'src', 'index.ts'), 'export {};', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-wlf',
        actionType: 'workspace_list_files',
        payload: { workspace_key: workspaceKey },
    });

    assert.equal(result.ok, true, result.errorOutput ?? '');
    const files = JSON.parse(result.output) as string[];
    assert.ok(Array.isArray(files));
    assert.ok(files.some((f) => f.includes('package.json')), `package.json not found in: ${JSON.stringify(files)}`);
    assert.ok(files.some((f) => f.includes('index.ts')), `index.ts not found in: ${JSON.stringify(files)}`);
});

test('workspace_grep finds regex matches in workspace files', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-wgrep';
    const botId = 'bot-wgrep';
    const workspaceKey = 'repo-wgrep-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'hello.ts'), 'export const hello = "world";\n// TODO: fix this\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-wgrep',
        actionType: 'workspace_grep',
        payload: { workspace_key: workspaceKey, pattern: 'TODO' },
    });

    assert.equal(result.ok, true, result.errorOutput ?? '');
    const matches = JSON.parse(result.output) as Array<{ file: string; line: number; text: string }>;
    assert.ok(Array.isArray(matches));
    assert.ok(matches.length > 0, `Expected matches for TODO but got: ${result.output}`);
    assert.ok(matches[0]?.text.includes('TODO'));
});

test('workspace_read_file reads content of existing file', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-wrf';
    const botId = 'bot-wrf';
    const workspaceKey = 'repo-wrf-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'hello.ts'), 'export const hello = "world";', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-wrf',
        actionType: 'workspace_read_file',
        payload: { workspace_key: workspaceKey, path: 'hello.ts' },
    });

    assert.equal(result.ok, true, result.errorOutput ?? '');
    const parsed = JSON.parse(result.output) as { success: boolean; path: string; content: string };
    assert.equal(parsed.success, true);
    assert.equal(parsed.path, 'hello.ts');
    assert.ok(parsed.content.includes('hello'));
});

test('workspace_read_file returns error for non-existent file', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-wrf-missing';
    const botId = 'bot-wrf-missing';
    const workspaceKey = 'repo-wrf-missing';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-wrf-missing',
        actionType: 'workspace_read_file',
        payload: { workspace_key: workspaceKey, path: 'does-not-exist.ts' },
    });

    assert.equal(result.ok, false);
    const parsed = JSON.parse(result.output) as { success: boolean; path: string; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.length > 0);
});

test('workspace_read_file returns error if file exceeds 1 MB', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-wrf-large';
    const botId = 'bot-wrf-large';
    const workspaceKey = 'repo-wrf-large';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    // 1 MB + 1 byte
    await writeFile(join(wsDir, 'big.bin'), Buffer.alloc(1_048_577, 0x41), 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-wrf-large',
        actionType: 'workspace_read_file',
        payload: { workspace_key: workspaceKey, path: 'big.bin' },
    });

    assert.equal(result.ok, false);
    const parsed = JSON.parse(result.output) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('1 MB'));
});

test('workspace_read_file blocks path traversal', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-wrf-trav';
    const botId = 'bot-wrf-trav';
    const workspaceKey = 'repo-wrf-trav';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-wrf-trav',
        actionType: 'workspace_read_file',
        payload: { workspace_key: workspaceKey, path: '../../etc/passwd' },
    });

    assert.equal(result.ok, false);
    const parsed = JSON.parse(result.output) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.toLowerCase().includes('traversal') || parsed.error.toLowerCase().includes('escapes'));
});

test('file_move renames a file within the workspace', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, access } = await import('node:fs/promises');

    const tenantId = 'tenant-fmv';
    const botId = 'bot-fmv';
    const workspaceKey = 'repo-fmv-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'old.ts'), 'export {};', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-fmv',
        actionType: 'file_move',
        payload: { workspace_key: workspaceKey, from_path: 'old.ts', to_path: 'new.ts' },
    });

    assert.equal(result.ok, true, result.errorOutput ?? '');
    // new file exists
    await assert.doesNotReject(access(join(wsDir, 'new.ts')));
    // old file gone
    await assert.rejects(access(join(wsDir, 'old.ts')));
});

test('file_delete removes a file from the workspace', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, access } = await import('node:fs/promises');

    const tenantId = 'tenant-fdel';
    const botId = 'bot-fdel';
    const workspaceKey = 'repo-fdel-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'to-delete.ts'), 'export {};', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-fdel',
        actionType: 'file_delete',
        payload: { workspace_key: workspaceKey, file_path: 'to-delete.ts' },
    });

    assert.equal(result.ok, true, result.errorOutput ?? '');
    await assert.rejects(access(join(wsDir, 'to-delete.ts')));
});

test('workspace_scout returns project summary JSON', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-scout';
    const botId = 'bot-scout';
    const workspaceKey = 'repo-scout-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await mkdir(join(wsDir, 'src'), { recursive: true });
    await writeFile(join(wsDir, 'package.json'), JSON.stringify({
        name: 'test-proj',
        version: '1.0.0',
        scripts: { test: 'node --test', build: 'tsc' },
        dependencies: { fastify: '4.0.0' },
    }), 'utf-8');
    await writeFile(join(wsDir, 'README.md'), '# Test Project\nA simple test project.', 'utf-8');
    await writeFile(join(wsDir, 'pnpm-lock.yaml'), '', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-scout',
        actionType: 'workspace_scout',
        payload: { workspace_key: workspaceKey },
    });

    assert.equal(result.ok, true, result.errorOutput ?? '');
    const scout = JSON.parse(result.output) as Record<string, unknown>;
    assert.ok(typeof scout === 'object');
    assert.equal(scout['framework'], 'Fastify', `Expected Fastify, got: ${JSON.stringify(scout)}`);
    assert.equal(scout['package_manager'], 'pnpm');
    assert.ok(typeof scout['readme_excerpt'] === 'string');
    assert.ok((scout['readme_excerpt'] as string).includes('Test Project'));
});

test('git_log returns structured JSON commit history', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');

    const tenantId = 'tenant-glog';
    const botId = 'bot-glog';
    const workspaceKey = 'repo-glog-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });

    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await writeFile(join(wsDir, 'init.txt'), 'init', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'initial commit']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-glog',
        actionType: 'git_log',
        payload: { workspace_key: workspaceKey, limit: 5 },
    });

    assert.equal(result.ok, true, result.errorOutput ?? '');
    const commits = JSON.parse(result.output) as Array<{ subject: string; author_name: string }>;
    assert.ok(Array.isArray(commits));
    assert.ok(commits.length > 0, 'Expected at least one commit');
    assert.equal(commits[0]?.subject, 'initial commit');
});

test('git_stash push and pop roundtrip', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');

    const tenantId = 'tenant-gstash';
    const botId = 'bot-gstash';
    const workspaceKey = 'repo-gstash-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });

    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await writeFile(join(wsDir, 'base.txt'), 'base', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'base commit']);

    // Create an unstaged change
    await writeFile(join(wsDir, 'base.txt'), 'changed', 'utf-8');

    const pushResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-gstash-push',
        actionType: 'git_stash',
        payload: { workspace_key: workspaceKey, action: 'push', message: 'wip-test' },
    });
    assert.equal(pushResult.ok, true, `stash push failed: ${pushResult.errorOutput ?? ''}`);

    const popResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-gstash-pop',
        actionType: 'git_stash',
        payload: { workspace_key: workspaceKey, action: 'pop' },
    });
    assert.equal(popResult.ok, true, `stash pop failed: ${popResult.errorOutput ?? ''}`);
});

test('apply_patch applies a valid unified diff to workspace files', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');

    const tenantId = 'tenant-apatch';
    const botId = 'bot-apatch';
    const workspaceKey = 'repo-apatch-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });

    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await writeFile(join(wsDir, 'hello.txt'), 'hello world\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'init']);

    const patchText = '--- a/hello.txt\n+++ b/hello.txt\n@@ -1 +1 @@\n-hello world\n+hello agentfarm\n';

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-apatch',
        actionType: 'apply_patch',
        payload: { workspace_key: workspaceKey, patch_text: patchText },
    });

    assert.equal(result.ok, true, `apply_patch failed: ${result.errorOutput ?? ''}`);
    const content = await readFile(join(wsDir, 'hello.txt'), 'utf-8');
    assert.equal(content.trim(), 'hello agentfarm');
});

// ===========================================================================
// TIER 3: IDE-LEVEL CAPABILITIES
// ===========================================================================

test('workspace_find_references returns matches for a known symbol', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-refs';
    const botId = 'bot-refs';
    const workspaceKey = 'repo-refs-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(pjoin(wsDir, 'src', 'index.ts'), 'export function myFunc() {}\nmyFunc();\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-refs',
        actionType: 'workspace_find_references',
        payload: { workspace_key: workspaceKey, symbol: 'myFunc' },
    });
    assert.equal(result.ok, true, result.errorOutput);
});

test('workspace_find_references returns error when symbol is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-refs-err',
        actionType: 'workspace_find_references',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /symbol/);
});

test('workspace_rename_symbol errors when old_name or new_name missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-rename-err',
        actionType: 'workspace_rename_symbol',
        payload: { workspace_key: 'repo-x', old_name: 'foo' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /new_name/);
});

test('workspace_rename_symbol renames a symbol across a file', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-rename';
    const botId = 'bot-rename';
    const workspaceKey = 'repo-rename-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(pjoin(wsDir, 'src', 'utils.ts'), 'function oldFn() {}\noldFn();\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-rename',
        actionType: 'workspace_rename_symbol',
        payload: { workspace_key: workspaceKey, old_name: 'oldFn', new_name: 'newFn' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { edited_files: number };
    assert.ok(parsed.edited_files >= 0);
});

test('workspace_extract_function errors when code_block not found in file', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-extract';
    const botId = 'bot-extract';
    const workspaceKey = 'repo-extract-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'code.ts'), 'const x = 1;\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-extract',
        actionType: 'workspace_extract_function',
        payload: { workspace_key: workspaceKey, file_path: 'code.ts', code_block: 'const y = 999;', function_name: 'myExtracted' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /not found/);
});

test('workspace_go_to_definition finds a function definition', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-gotod';
    const botId = 'bot-gotod';
    const workspaceKey = 'repo-gotod-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(pjoin(wsDir, 'src', 'foo.ts'), 'export function myHandler() { return 1; }\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-gotod',
        actionType: 'workspace_go_to_definition',
        payload: { workspace_key: workspaceKey, symbol: 'myHandler' },
    });
    // May succeed (found) or fail (not found) — must not throw
    assert.ok(typeof result.ok === 'boolean');
});

test('workspace_hover_type returns LSP-unavailable error', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-hover',
        actionType: 'workspace_hover_type',
        payload: { workspace_key: 'repo-hover', symbol: 'mySymbol' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /LSP/);
});

test('workspace_code_coverage returns ok when no test runner is available', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-cov';
    const botId = 'bot-cov';
    const workspaceKey = 'repo-cov-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-cov',
        actionType: 'workspace_code_coverage',
        payload: { workspace_key: workspaceKey },
    });
    // Either succeeds with coverage data or fails with error — must not throw
    assert.ok(typeof result.ok === 'boolean');
});

test('workspace_complexity_metrics returns a metrics object', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-cmx';
    const botId = 'bot-cmx';
    const workspaceKey = 'repo-cmx-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-cmx',
        actionType: 'workspace_complexity_metrics',
        payload: { workspace_key: workspaceKey },
    });
    assert.ok(typeof result.ok === 'boolean');
});

test('workspace_security_scan returns findings array', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-sec';
    const botId = 'bot-sec';
    const workspaceKey = 'repo-sec-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    // Intentionally trigger a finding
    await writeFile(pjoin(wsDir, 'src', 'config.ts'), 'const password = "hunter2";\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-sec',
        actionType: 'workspace_security_scan',
        payload: { workspace_key: workspaceKey },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { findings: unknown[] };
    assert.ok(Array.isArray(parsed.findings));
    assert.ok(parsed.findings.length >= 1, 'Expected at least one finding for hardcoded password');
});

test('workspace_analyze_imports runs without throwing', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-imp';
    const botId = 'bot-imp';
    const workspaceKey = 'repo-imp-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-imp',
        actionType: 'workspace_analyze_imports',
        payload: { workspace_key: workspaceKey },
    });
    assert.ok(typeof result.ok === 'boolean');
});

// ===========================================================================
// TIER 4: MULTI-FILE COORDINATION
// ===========================================================================

test('workspace_bulk_refactor errors when pattern is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-bulk-err',
        actionType: 'workspace_bulk_refactor',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /pattern/);
});

test('workspace_bulk_refactor replaces text across multiple files', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-bulk';
    const botId = 'bot-bulk';
    const workspaceKey = 'repo-bulk-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(pjoin(wsDir, 'src', 'a.ts'), 'const FOO = 1;\n', 'utf-8');
    await writeFile(pjoin(wsDir, 'src', 'b.ts'), 'const FOO = 2;\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-bulk',
        actionType: 'workspace_bulk_refactor',
        payload: { workspace_key: workspaceKey, pattern: 'FOO', replacement: 'BAR', file_pattern: '**/*.ts' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { files_modified: number };
    assert.ok(parsed.files_modified >= 1);
});

test('workspace_atomic_edit_set errors when edits array is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-atomic-err',
        actionType: 'workspace_atomic_edit_set',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /edits/);
});

test('workspace_atomic_edit_set writes multiple files atomically', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir, readFile } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-atomic';
    const botId = 'bot-atomic';
    const workspaceKey = 'repo-atomic-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await runGit(['commit', '--allow-empty', '-m', 'init']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-atomic',
        actionType: 'workspace_atomic_edit_set',
        payload: {
            workspace_key: workspaceKey,
            edits: [
                { file: 'file1.ts', content: 'export const a = 1;\n' },
                { file: 'file2.ts', content: 'export const b = 2;\n' },
            ],
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { files_edited: number };
    assert.equal(parsed.files_edited, 2);
    const c1 = await readFile(pjoin(wsDir, 'file1.ts'), 'utf-8');
    assert.equal(c1.trim(), 'export const a = 1;');
});

test('workspace_generate_from_template substitutes template variables', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-tpl';
    const botId = 'bot-tpl';
    const workspaceKey = 'repo-tpl-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'templates'), { recursive: true });
    await mkdir(pjoin(wsDir, 'out'), { recursive: true });
    await writeFile(pjoin(wsDir, 'templates', 'service.ts.tpl'), 'export class {{ClassName}} {}\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-tpl',
        actionType: 'workspace_generate_from_template',
        payload: {
            workspace_key: workspaceKey,
            template_path: 'templates/service.ts.tpl',
            output_path: 'out/MyService.ts',
            variables: { ClassName: 'MyService' },
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const out = await readFile(pjoin(wsDir, 'out', 'MyService.ts'), 'utf-8');
    assert.equal(out.trim(), 'export class MyService {}');
});

test('workspace_summarize_folder returns file count and language list', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-sumf';
    const botId = 'bot-sumf';
    const workspaceKey = 'repo-sumf-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(pjoin(wsDir, 'src', 'index.ts'), 'export {};\n', 'utf-8');
    await writeFile(pjoin(wsDir, 'src', 'utils.ts'), 'export {};\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-sumf',
        actionType: 'workspace_summarize_folder',
        payload: { workspace_key: workspaceKey, folder_path: 'src' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { file_count: number; languages: string[] };
    assert.ok(parsed.file_count >= 2);
    assert.ok(parsed.languages.includes('ts'));
});

test('workspace_dependency_tree returns root and deps list', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-deptree';
    const botId = 'bot-deptree';
    const workspaceKey = 'repo-deptree-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(
        pjoin(wsDir, 'src', 'index.ts'),
        "import { a } from './helpers';\nimport { b } from './utils';\n",
        'utf-8'
    );

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-deptree',
        actionType: 'workspace_dependency_tree',
        payload: { workspace_key: workspaceKey, entry_point: 'src/index.ts' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { root: string; dependencies: string[] };
    assert.equal(parsed.root, 'src/index.ts');
    assert.ok(parsed.dependencies.length >= 2);
});

test('workspace_test_impact_analysis errors when changed_file is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-impact-err',
        actionType: 'workspace_test_impact_analysis',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /changed_file/);
});

test('workspace_test_impact_analysis returns affected test files', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-impact';
    const botId = 'bot-impact';
    const workspaceKey = 'repo-impact-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(pjoin(wsDir, 'src', 'utils.test.ts'), "import './utils';\ntest('x', () => {});\n", 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-impact',
        actionType: 'workspace_test_impact_analysis',
        payload: { workspace_key: workspaceKey, changed_file: 'src/utils.ts' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { tests: string[] };
    assert.ok(Array.isArray(parsed.tests));
});

// ===========================================================================
// TIER 5: EXTERNAL KNOWLEDGE & EXPERIMENTATION
// ===========================================================================

test('workspace_search_docs returns unavailable when external HTTP not accessible', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-docs',
        actionType: 'workspace_search_docs',
        payload: { workspace_key: 'repo-x', query: 'useState hook', framework: 'react' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /HTTP|documentation|external/);
});

test('workspace_search_docs errors when query is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-docs-err',
        actionType: 'workspace_search_docs',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /query/);
});

test('workspace_package_lookup returns package info from package.json', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-pkg';
    const botId = 'bot-pkg';
    const workspaceKey = 'repo-pkg-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'package.json'), JSON.stringify({ dependencies: { typescript: '^5.0.0' } }), 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-pkg',
        actionType: 'workspace_package_lookup',
        payload: { workspace_key: workspaceKey, package_name: 'typescript' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { name: string; installed: string };
    assert.equal(parsed.name, 'typescript');
    assert.ok(parsed.installed !== undefined);
});

test('workspace_ai_code_review returns stub review for a file', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-review';
    const botId = 'bot-review';
    const workspaceKey = 'repo-review-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'app.ts'), 'const x = 1;\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-review',
        actionType: 'workspace_ai_code_review',
        payload: { workspace_key: workspaceKey, file_path: 'app.ts' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { file: string };
    assert.equal(parsed.file, 'app.ts');
});

test('workspace_repl_start returns unavailable error', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-repl',
        actionType: 'workspace_repl_start',
        payload: { workspace_key: 'repo-x', language: 'node' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /REPL|interactive/);
});

test('workspace_repl_execute errors when session_id or code is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-repl-exec-err',
        actionType: 'workspace_repl_execute',
        payload: { workspace_key: 'repo-x', code: 'console.log(1)' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /session_id/);
});

test('workspace_repl_stop returns stopped status', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-repl-stop',
        actionType: 'workspace_repl_stop',
        payload: { workspace_key: 'repo-x', session_id: 'repl-999' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { status: string };
    assert.equal(parsed.status, 'stopped');
});

test('workspace_debug_breakpoint errors when line is missing or zero', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-dbg-err',
        actionType: 'workspace_debug_breakpoint',
        payload: { workspace_key: 'repo-x', file_path: 'src/app.ts' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /line/);
});

test('workspace_debug_breakpoint returns unavailable error', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-dbg',
        actionType: 'workspace_debug_breakpoint',
        payload: { workspace_key: 'repo-x', file_path: 'src/app.ts', line: 42 },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /debugger|debug/);
});

test('workspace_profiler_run (node) profiles a JS target and returns ok', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 't1'; const botId = 'b1'; const workspaceKey = 'repo-prof-js';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    // Trivial JS file that gives the profiler something to measure
    await writeFile(pjoin(wsDir, 'prof-target.js'), 'let x = 0; for (let i = 0; i < 500000; i++) x += i; console.log(x);\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-prof',
        actionType: 'workspace_profiler_run',
        payload: { workspace_key: workspaceKey, target: 'prof-target.js' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { status: string; target: string; profile_output: string };
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.target, 'prof-target.js');
    assert.ok(typeof parsed.profile_output === 'string', 'profile_output should be a string');
});

test('workspace_profiler_run (python) profiles a .py target and returns ok', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');
    const { execSync } = await import('node:child_process');

    // Skip if Python is not available on this machine
    try { execSync('python --version 2>&1'); } catch { return; }

    const tenantId = 't1'; const botId = 'b1'; const workspaceKey = 'repo-prof-py';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    await writeFile(pjoin(wsDir, 'prof-target.py'), 'x = sum(range(500000))\nprint(x)\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-prof-py',
        actionType: 'workspace_profiler_run',
        payload: { workspace_key: workspaceKey, target: 'prof-target.py', language: 'python' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { status: string; target: string; profile_output: string };
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.target, 'prof-target.py');
    assert.ok(typeof parsed.profile_output === 'string');
});

test('workspace_profiler_run returns error when target is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-prof-missing',
        actionType: 'workspace_profiler_run',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /missing target/);
});

// ===========================================================================
// TIER 6: LANGUAGE ADAPTERS
// ===========================================================================

test('workspace_language_adapter_python detects Django from requirements.txt', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-py';
    const botId = 'bot-py';
    const workspaceKey = 'repo-py-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'requirements.txt'), 'django==4.2\npsycopg2\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-py',
        actionType: 'workspace_language_adapter_python',
        payload: { workspace_key: workspaceKey },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { language: string; framework?: string };
    assert.equal(parsed.language, 'Python');
    assert.equal(parsed.framework, 'Django');
});

test('workspace_language_adapter_java detects Maven from pom.xml', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-java';
    const botId = 'bot-java';
    const workspaceKey = 'repo-java-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'pom.xml'), '<project><dependencies><dependency>spring</dependency></dependencies></project>', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-java',
        actionType: 'workspace_language_adapter_java',
        payload: { workspace_key: workspaceKey },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { language: string; buildTool?: string };
    assert.equal(parsed.language, 'Java');
    assert.equal(parsed.buildTool, 'Maven');
});

test('workspace_language_adapter_go detects Gin framework from go.mod', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-go';
    const botId = 'bot-go';
    const workspaceKey = 'repo-go-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'go.mod'), 'module myapp\nrequire github.com/gin-gonic/gin v1.9.0\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-go',
        actionType: 'workspace_language_adapter_go',
        payload: { workspace_key: workspaceKey },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { language: string; framework?: string };
    assert.equal(parsed.language, 'Go');
    assert.equal(parsed.framework, 'Gin');
});

test('workspace_language_adapter_csharp returns C# metadata', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-cs';
    const botId = 'bot-cs';
    const workspaceKey = 'repo-cs-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-cs',
        actionType: 'workspace_language_adapter_csharp',
        payload: { workspace_key: workspaceKey },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { language: string };
    assert.equal(parsed.language, 'C#');
});

// ===========================================================================
// TIER 7: GOVERNANCE & SAFETY
// ===========================================================================

test('workspace_dry_run_with_approval_chain returns changeset preview', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-dryrun';
    const botId = 'bot-dryrun';
    const workspaceKey = 'repo-dryrun-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await runGit(['commit', '--allow-empty', '-m', 'init']);
    await writeFile(pjoin(wsDir, 'new.ts'), 'const x = 1;\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-dryrun',
        actionType: 'workspace_dry_run_with_approval_chain',
        payload: {
            workspace_key: workspaceKey,
            change_description: 'Add new.ts',
            command: 'tsc',
            expected_outcomes: ['new.ts'],
            human_outcome: 'Implemented new.ts and added tests.',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as {
        success: boolean;
        changeset: string;
        shadow_report?: { match_level: string; misses: string[]; risk_notes: string[]; compared: boolean };
    };
    assert.equal(parsed.success, true);
    assert.ok(typeof parsed.changeset === 'string');
    assert.equal(parsed.shadow_report?.compared, true);
    assert.ok(['high', 'partial', 'low', 'unknown'].includes(parsed.shadow_report?.match_level ?? 'unknown'));
    assert.ok(Array.isArray(parsed.shadow_report?.misses));
    assert.ok(Array.isArray(parsed.shadow_report?.risk_notes));
});

test('workspace_change_impact_report returns file and test impact counts', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');

    const tenantId = 'tenant-cimp';
    const botId = 'bot-cimp';
    const workspaceKey = 'repo-cimp-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await runGit(['commit', '--allow-empty', '-m', 'init']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-cimp',
        actionType: 'workspace_change_impact_report',
        payload: {
            workspace_key: workspaceKey,
            changed_files: [
                'apps/api-gateway/src/routes/runtime-tasks.ts',
                'services/evidence-service/src/index.ts',
            ],
            reviewer_feedback: {
                rating: 4.2,
                notes: 'Predicted packages were accurate for this change set.',
                unexpected_failures: 1,
            },
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as {
        files_modified: number;
        tests_impacted: number;
        predicted_impacted_packages: string[];
        recommended_test_set: string[];
        reviewer_feedback: { rating: number | null; notes: string | null; unexpected_failures: number | null };
    };
    assert.ok(typeof parsed.files_modified === 'number');
    assert.ok(typeof parsed.tests_impacted === 'number');
    assert.deepEqual(parsed.predicted_impacted_packages, ['apps/api-gateway', 'services/evidence-service']);
    assert.deepEqual(parsed.recommended_test_set, [
        'pnpm --filter ./apps/api-gateway test',
        'pnpm --filter ./services/evidence-service test',
    ]);
    assert.equal(parsed.reviewer_feedback.rating, 4.2);
    assert.equal(parsed.reviewer_feedback.unexpected_failures, 1);
});

test('workspace_rollback_to_checkpoint errors when checkpoint_ref is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-rollback-err',
        actionType: 'workspace_rollback_to_checkpoint',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /checkpoint_ref/);
});

test('workspace_rollback_to_checkpoint rolls back to HEAD commit', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-rollback';
    const botId = 'bot-rollback';
    const workspaceKey = 'repo-rollback-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await writeFile(pjoin(wsDir, 'base.ts'), 'const base = 1;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'base commit']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-rollback',
        actionType: 'workspace_rollback_to_checkpoint',
        payload: { workspace_key: workspaceKey, checkpoint_ref: 'HEAD' },
    });
    assert.equal(result.ok, true, result.errorOutput);
});

// ===========================================================================
// TIER 8: RELEASE & COLLABORATION INTELLIGENCE
// ===========================================================================

test('workspace_generate_test creates test stubs for exported symbols', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-gentest';
    const botId = 'bot-gentest';
    const workspaceKey = 'repo-gentest-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(pjoin(wsDir, 'src', 'math.ts'), 'export function add(a: number, b: number): number { return a + b; }\nexport function sub(a: number, b: number): number { return a - b; }\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-gentest',
        actionType: 'workspace_generate_test',
        payload: { workspace_key: workspaceKey, file_path: 'src/math.ts' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { generated_file: string; symbols: string[] };
    assert.equal(parsed.generated_file, 'src/math.test.ts');
    assert.ok(parsed.symbols.includes('add'));
    assert.ok(parsed.symbols.includes('sub'));

    const testContent = await readFile(pjoin(wsDir, 'src', 'math.test.ts'), 'utf-8');
    assert.ok(testContent.includes('add'));
    assert.ok(testContent.includes('sub'));
});

test('workspace_generate_test errors when file_path is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-gentest-err',
        actionType: 'workspace_generate_test',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /file_path/);
});

test('workspace_format_code errors when file_path is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-fmt-err',
        actionType: 'workspace_format_code',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /file_path/);
});

test('workspace_format_code runs without throwing (prettier may not be available)', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-fmt';
    const botId = 'bot-fmt';
    const workspaceKey = 'repo-fmt-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'ugly.ts'), 'const x=1;const y=2;\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-fmt',
        actionType: 'workspace_format_code',
        payload: { workspace_key: workspaceKey, file_path: 'ugly.ts' },
    });
    // May fail if prettier isn't installed, but must not throw
    assert.ok(typeof result.ok === 'boolean');
});

test('workspace_version_bump patches version in package.json', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-vbump';
    const botId = 'bot-vbump';
    const workspaceKey = 'repo-vbump-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'package.json'), JSON.stringify({ name: 'my-pkg', version: '1.2.3' }, null, 2), 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-vbump',
        actionType: 'workspace_version_bump',
        payload: { workspace_key: workspaceKey, bump_type: 'patch' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { previous: string; next: string };
    assert.equal(parsed.previous, '1.2.3');
    assert.equal(parsed.next, '1.2.4');

    const updatedPkg = JSON.parse(await readFile(pjoin(wsDir, 'package.json'), 'utf-8')) as { version: string };
    assert.equal(updatedPkg.version, '1.2.4');
});

test('workspace_version_bump minor resets patch to 0', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-vbump2';
    const botId = 'bot-vbump2';
    const workspaceKey = 'repo-vbump-2';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    await writeFile(pjoin(wsDir, 'package.json'), JSON.stringify({ version: '2.5.9' }, null, 2), 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-vbump2',
        actionType: 'workspace_version_bump',
        payload: { workspace_key: workspaceKey, bump_type: 'minor' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { next: string };
    assert.equal(parsed.next, '2.6.0');
});

test('workspace_version_bump errors on invalid bump_type', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-vbump-err',
        actionType: 'workspace_version_bump',
        payload: { workspace_key: 'repo-x', bump_type: 'super' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /patch.*minor.*major/);
});

test('workspace_changelog_generate produces CHANGELOG from git log', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-clog';
    const botId = 'bot-clog';
    const workspaceKey = 'repo-clog-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await writeFile(pjoin(wsDir, 'file1.ts'), 'const a = 1;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'feat: add file1']);
    await writeFile(pjoin(wsDir, 'file2.ts'), 'const b = 2;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'fix: add file2']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-clog',
        actionType: 'workspace_changelog_generate',
        payload: { workspace_key: workspaceKey, since: 'HEAD~1', output_file: 'CHANGELOG.md' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { entries: number; output_file: string };
    assert.ok(parsed.entries >= 1);
    assert.equal(parsed.output_file, 'CHANGELOG.md');

    const changelog = await readFile(pjoin(wsDir, 'CHANGELOG.md'), 'utf-8');
    assert.ok(changelog.includes('feat:') || changelog.includes('fix:'));
});

test('workspace_git_blame returns structured blame for a committed file', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-blame';
    const botId = 'bot-blame';
    const workspaceKey = 'repo-blame-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await writeFile(pjoin(wsDir, 'code.ts'), 'const hello = "world";\nconst foo = 42;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'add code.ts']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-blame',
        actionType: 'workspace_git_blame',
        payload: { workspace_key: workspaceKey, file_path: 'code.ts' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    type BlameRecord = { commit: string; author: string; line: number };
    const records = JSON.parse(result.output) as BlameRecord[];
    assert.ok(Array.isArray(records));
    assert.ok(records.length >= 2);
    assert.ok(records[0]?.author === 'AgentFarm Bot', `expected author 'AgentFarm Bot', got '${records[0]?.author}'`);
});

test('workspace_git_blame errors when file_path is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-blame-err',
        actionType: 'workspace_git_blame',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /file_path/);
});

test('workspace_outline_symbols lists exported symbols in a TypeScript file', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-outline';
    const botId = 'bot-outline';
    const workspaceKey = 'repo-outline-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(pjoin(wsDir, 'src'), { recursive: true });
    await writeFile(pjoin(wsDir, 'src', 'utils.ts'), [
        'export function helperA() {}',
        'export class ServiceB {}',
        'export const CONFIG = { key: "val" };',
        'export type MyType = string | number;',
        'function privateHelper() {}',
    ].join('\n') + '\n', 'utf-8');

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-outline',
        actionType: 'workspace_outline_symbols',
        payload: { workspace_key: workspaceKey, file_path: 'src/utils.ts' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    type SymbolOutline = { name: string; kind: string; exported: boolean };
    const parsed = JSON.parse(result.output) as { file: string; symbols: SymbolOutline[] };
    assert.equal(parsed.file, 'src/utils.ts');
    const names = parsed.symbols.map(s => s.name);
    assert.ok(names.includes('helperA'), `Expected helperA in ${JSON.stringify(names)}`);
    assert.ok(names.includes('ServiceB'), `Expected ServiceB in ${JSON.stringify(names)}`);
    assert.ok(names.includes('CONFIG'), `Expected CONFIG in ${JSON.stringify(names)}`);
    assert.ok(names.includes('MyType'), `Expected MyType in ${JSON.stringify(names)}`);
    // privateHelper is not exported but should still appear in the outline
    assert.ok(names.includes('privateHelper'), `Expected privateHelper in ${JSON.stringify(names)}`);
});

test('workspace_outline_symbols errors when file_path is missing', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 't1', botId: 'b1', taskId: 'task-outline-err',
        actionType: 'workspace_outline_symbols',
        payload: { workspace_key: 'repo-x' },
    });
    assert.equal(result.ok, false);
    assert.match(result.errorOutput ?? '', /file_path/);
});

// ===========================================================================
// TIER 9: PILOT ROADMAP PRODUCTIVITY ACTIONS
// ===========================================================================

test('workspace_create_pr returns assembled PR metadata from git state', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-create-pr';
    const botId = 'bot-create-pr';
    const workspaceKey = 'repo-create-pr-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['checkout', '-b', 'main']);
    await writeFile(pjoin(wsDir, 'file.ts'), 'export const v = 1;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'feat: initial commit']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-create-pr',
        actionType: 'workspace_create_pr',
        payload: { workspace_key: workspaceKey, base_branch: 'main' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { title: string; head_branch: string; base_branch: string };
    assert.ok(parsed.title.length > 0);
    assert.equal(parsed.base_branch, 'main');
    assert.equal(parsed.head_branch, 'main');
});

test('workspace_run_ci_checks executes command sequence', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');

    const tenantId = 'tenant-ci';
    const botId = 'bot-ci';
    const workspaceKey = 'repo-ci-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-ci',
        actionType: 'workspace_run_ci_checks',
        payload: {
            workspace_key: workspaceKey,
            command: 'node -e process.exit(0)',
            additional_commands: ['node -e process.exit(0)'],
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { checks: Array<{ ok: boolean }> };
    assert.equal(parsed.checks.length, 2);
    assert.equal(parsed.checks.every((entry) => entry.ok), true);
});

test('workspace_fix_test_failures applies patches and improves test result', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const tenantId = 'tenant-fix';
    const botId = 'bot-fix';
    const workspaceKey = 'repo-fix-1';

    const writeResult = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-fix-write',
        actionType: 'code_edit',
        payload: { workspace_key: workspaceKey, file_path: 'status.txt', content: 'fail\n' },
    });
    assert.equal(writeResult.ok, true);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-fix',
        actionType: 'workspace_fix_test_failures',
        payload: {
            workspace_key: workspaceKey,
            test_command: 'node -e process.exit(require("node:fs").readFileSync("status.txt","utf8").trim()==="ok"?0:1)',
            patches: [
                { file_path: 'status.txt', old_text: 'fail', new_text: 'ok' },
            ],
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { improved: boolean; after_exit_code: number };
    assert.equal(parsed.improved, true);
    assert.equal(parsed.after_exit_code, 0);
});

test('workspace_security_fix_suggest identifies risky patterns', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    await executeLocalWorkspaceAction({
        tenantId: 'tenant-sec', botId: 'bot-sec', taskId: 'task-sec-write',
        actionType: 'code_edit',
        payload: {
            workspace_key: 'repo-sec-1',
            file_path: 'src/risky.ts',
            content: 'const x = eval(input);\nelem.innerHTML = userContent;\n',
        },
    });

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-sec', botId: 'bot-sec', taskId: 'task-sec',
        actionType: 'workspace_security_fix_suggest',
        payload: { workspace_key: 'repo-sec-1', file_path: 'src/risky.ts' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { suggestions: Array<{ pattern: string }> };
    assert.ok(parsed.suggestions.length >= 2);
});

test('workspace_pr_review_prepare returns changed files and checklist', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-prprep';
    const botId = 'bot-prprep';
    const workspaceKey = 'repo-prprep-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await writeFile(pjoin(wsDir, 'a.ts'), 'const a = 1;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'feat: base']);
    await writeFile(pjoin(wsDir, 'a.ts'), 'const a = 1; // TODO remove\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'fix: add todo']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-prprep',
        actionType: 'workspace_pr_review_prepare',
        payload: { workspace_key: workspaceKey, base_branch: 'HEAD~1' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { file_count: number; reviewer_checklist: string[] };
    assert.ok(parsed.file_count >= 1);
    assert.ok(parsed.reviewer_checklist.length >= 3);
});

test('workspace_dependency_upgrade_plan reads package.json and creates plan', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    await executeLocalWorkspaceAction({
        tenantId: 'tenant-up', botId: 'bot-up', taskId: 'task-up-write',
        actionType: 'code_edit',
        payload: {
            workspace_key: 'repo-up-1',
            file_path: 'package.json',
            content: JSON.stringify({ dependencies: { react: '^18.2.0' }, devDependencies: { typescript: '^5.4.0' } }, null, 2),
        },
    });

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-up', botId: 'bot-up', taskId: 'task-up',
        actionType: 'workspace_dependency_upgrade_plan',
        payload: { workspace_key: 'repo-up-1' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { package_count: number; upgrades: Array<{ package: string }> };
    assert.equal(parsed.package_count, 2);
    assert.ok(parsed.upgrades.some((entry) => entry.package === 'react'));
});

test('workspace_release_notes_generate writes release notes file', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-rnotes';
    const botId = 'bot-rnotes';
    const workspaceKey = 'repo-rnotes-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await runGit(['config', 'core.autocrlf', 'false']);
    await writeFile(pjoin(wsDir, 'x.ts'), 'const x = 1;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'feat: add x']);
    await writeFile(pjoin(wsDir, 'x.ts'), 'const x = 2;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'fix: update x']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-rnotes',
        actionType: 'workspace_release_notes_generate',
        payload: { workspace_key: workspaceKey, since: 'HEAD~1', output_file: 'RELEASE_NOTES.md' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const notes = await readFile(pjoin(wsDir, 'RELEASE_NOTES.md'), 'utf-8');
    assert.ok(notes.includes('Release Notes'));
});

test('workspace_incident_patch_pack creates rollback metadata', async () => {
    const { executeLocalWorkspaceAction, getWorkspaceDir } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { spawn } = await import('node:child_process');
    const { join: pjoin } = await import('node:path');

    const tenantId = 'tenant-inc';
    const botId = 'bot-inc';
    const workspaceKey = 'repo-inc-1';
    const wsDir = getWorkspaceDir(tenantId, botId, workspaceKey);
    await mkdir(wsDir, { recursive: true });
    const runGit = (args: string[]): Promise<number> =>
        new Promise((resolve) => {
            const proc = spawn('git', args, { cwd: wsDir, stdio: 'ignore' });
            proc.on('close', resolve);
        });
    await runGit(['init']);
    await runGit(['config', 'user.email', 'bot@agentfarm.dev']);
    await runGit(['config', 'user.name', 'AgentFarm Bot']);
    await writeFile(pjoin(wsDir, 'a.ts'), 'const a = 1;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'feat: first']);
    await writeFile(pjoin(wsDir, 'a.ts'), 'const a = 2;\n', 'utf-8');
    await runGit(['add', '.']);
    await runGit(['commit', '-m', 'fix: hotfix']);

    const result = await executeLocalWorkspaceAction({
        tenantId, botId, taskId: 'task-inc',
        actionType: 'workspace_incident_patch_pack',
        payload: { workspace_key: workspaceKey, ticket: 'INC-42' },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { checkpoint_branch: string; rollback_ref: string };
    assert.ok(parsed.checkpoint_branch.includes('incident/inc-42'));
    assert.ok(parsed.rollback_ref.length >= 8);
});

test('workspace_memory_profile writes and reads profile state', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const writeResult = await executeLocalWorkspaceAction({
        tenantId: 'tenant-prof', botId: 'bot-prof', taskId: 'task-prof-write',
        actionType: 'workspace_memory_profile',
        payload: {
            workspace_key: 'repo-prof-1',
            mode: 'write',
            profile: { conventions: { test_runner: 'node:test', formatter: 'prettier' } },
        },
    });
    assert.equal(writeResult.ok, true, writeResult.errorOutput);

    const readResult = await executeLocalWorkspaceAction({
        tenantId: 'tenant-prof', botId: 'bot-prof', taskId: 'task-prof-read',
        actionType: 'workspace_memory_profile',
        payload: { workspace_key: 'repo-prof-1', mode: 'read' },
    });
    assert.equal(readResult.ok, true, readResult.errorOutput);
    const parsed = JSON.parse(readResult.output) as { conventions: { test_runner: string } };
    assert.equal(parsed.conventions.test_runner, 'node:test');
});

test('workspace_autonomous_plan_execute runs plan and verification command', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-auto', botId: 'bot-auto', taskId: 'task-auto',
        actionType: 'workspace_autonomous_plan_execute',
        payload: {
            workspace_key: 'repo-auto-1',
            plan: [
                {
                    description: 'create marker file',
                    actions: [
                        { action: 'code_edit', file_path: 'ok.txt', content: 'ok\n' },
                    ],
                },
            ],
            verify_command: 'node -e process.exit(0)',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { verify_exit_code: number };
    assert.equal(parsed.verify_exit_code, 0);
});

test('workspace_policy_preflight returns approval route for medium/high actions', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-preflight', botId: 'bot-preflight', taskId: 'task-preflight',
        actionType: 'workspace_policy_preflight',
        payload: {
            workspace_key: 'repo-preflight-1',
            proposed_action: 'workspace_run_ci_checks',
            summary: 'Run CI for changed modules',
            target: 'services/api',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { risk_level: string; route: string };
    assert.equal(parsed.risk_level, 'medium');
    assert.equal(parsed.route, 'approval');
});

// TIER 10: CONNECTOR HARDENING, CODE INTELLIGENCE, OBSERVABILITY

test('workspace_connector_test returns pass for supported connector', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-conn-test',
        actionType: 'workspace_connector_test',
        payload: {
            workspace_key: 'repo-t10-conn',
            connector_type: 'github',
            endpoint_url: 'https://api.github.com',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { connector_type: string; supported: boolean; connectivity: string };
    assert.equal(parsed.connector_type, 'github');
    assert.equal(parsed.supported, true);
    assert.equal(parsed.connectivity, 'pass');
});

test('workspace_connector_test flags unsupported connector', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-conn-unsupported',
        actionType: 'workspace_connector_test',
        payload: {
            workspace_key: 'repo-t10-conn',
            connector_type: 'notarealconnector',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { supported: boolean; warning: string };
    assert.equal(parsed.supported, false);
    assert.ok(parsed.warning.includes('not in the supported set'));
});

test('workspace_pr_auto_assign returns suggested reviewers from CODEOWNERS', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    const wsDir = join(wBase, 'tenant-t10', 'bot-t10', 'repo-t10-assign');
    await mkdir(join(wsDir, '.github'), { recursive: true });
    await writeFile(join(wsDir, '.github', 'CODEOWNERS'), '*.ts @alice @bob\nservices/ @carol\n', 'utf8');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-assign',
        actionType: 'workspace_pr_auto_assign',
        payload: {
            workspace_key: 'repo-t10-assign',
            pr_number: 42,
            changed_files: ['src/index.ts', 'services/api.ts'],
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { suggested_reviewers: string[] };
    assert.ok(parsed.suggested_reviewers.includes('alice') || parsed.suggested_reviewers.includes('carol'));
});

test('workspace_ci_watch runs ci_command and returns structured result', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { mkdir } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    await mkdir(join(wBase, 'tenant-t10', 'bot-t10', 'repo-t10-ci'), { recursive: true });

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-ci-watch',
        actionType: 'workspace_ci_watch',
        payload: {
            workspace_key: 'repo-t10-ci',
            ci_command: 'node --version',
            max_wait_ms: 15000,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { status: string; exit_code: number };
    assert.equal(parsed.status, 'pass');
    assert.equal(parsed.exit_code, 0);
});

test('workspace_explain_code returns structural summary for file', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    const wsDir = join(wBase, 'tenant-t10', 'bot-t10', 'repo-t10-explain');
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'util.ts'), [
        'import { readFileSync } from "fs";',
        'export function loadConfig(path: string) {',
        '  if (!path) return null;',
        '  return JSON.parse(readFileSync(path, "utf8"));',
        '}',
        'export function mergeConfigs(a: object, b: object) {',
        '  return { ...a, ...b };',
        '}',
    ].join('\n'), 'utf8');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-explain',
        actionType: 'workspace_explain_code',
        payload: {
            workspace_key: 'repo-t10-explain',
            file_path: 'util.ts',
            start_line: 1,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { structural_summary: { function_declarations: number; imports: number } };
    assert.ok(parsed.structural_summary.function_declarations >= 2);
    assert.ok(parsed.structural_summary.imports >= 1);
});

test('workspace_add_docstring detects undocumented exports in dry_run', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    const wsDir = join(wBase, 'tenant-t10', 'bot-t10', 'repo-t10-docstring');
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'api.ts'), [
        'export function getUser(id: string) {',
        '  return { id };',
        '}',
        '/** Already documented */',
        'export function listUsers() {',
        '  return [];',
        '}',
    ].join('\n'), 'utf8');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-docstring',
        actionType: 'workspace_add_docstring',
        payload: {
            workspace_key: 'repo-t10-docstring',
            file_path: 'api.ts',
            dry_run: true,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { candidates_found: number; dry_run: boolean };
    assert.ok(parsed.candidates_found >= 1);
    assert.equal(parsed.dry_run, true);
});

test('workspace_refactor_plan generates structured plan with steps', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    const wsDir = join(wBase, 'tenant-t10', 'bot-t10', 'repo-t10-refplan');
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'auth.ts'), 'export function authenticate(token: string) { return true; }\n', 'utf8');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-refplan',
        actionType: 'workspace_refactor_plan',
        payload: {
            workspace_key: 'repo-t10-refplan',
            objective: 'Extract token validation into a separate function',
            target_files: ['auth.ts'],
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { proposed_steps: { step: number }[]; requires_approval: boolean };
    assert.ok(parsed.proposed_steps.length >= 5);
    assert.equal(parsed.requires_approval, true);
});

test('workspace_semantic_search finds matches with context', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    const wsDir = join(wBase, 'tenant-t10', 'bot-t10', 'repo-t10-semsearch');
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'handler.ts'), [
        '// before',
        'export function handleRequest(req: Request) {',
        '  return { ok: true };',
        '}',
        '// after',
    ].join('\n'), 'utf8');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-semsearch',
        actionType: 'workspace_semantic_search',
        payload: {
            workspace_key: 'repo-t10-semsearch',
            query: 'handleRequest',
            max_results: 5,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { total_matches: number; results: { context_before: string }[] };
    assert.ok(parsed.total_matches >= 1);
    assert.ok(parsed.results[0].context_before.length >= 0);
});

test('workspace_diff_preview returns no-write diff summary', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    const wsDir = join(wBase, 'tenant-t10', 'bot-t10', 'repo-t10-diffprev');
    await mkdir(wsDir, { recursive: true });
    await writeFile(join(wsDir, 'config.ts'), 'const x = 1;\n', 'utf8');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-diffprev',
        actionType: 'workspace_diff_preview',
        payload: {
            workspace_key: 'repo-t10-diffprev',
            planned_edits: [
                { file_path: 'config.ts', new_content: 'const x = 2;\nconst y = 3;\n' },
            ],
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { total_files: number; note: string };
    assert.equal(parsed.total_files, 1);
    assert.ok(parsed.note.includes('No files were written'));
});

test('workspace_approval_status returns pending for unknown taskId', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-appr-status',
        actionType: 'workspace_approval_status',
        payload: {
            workspace_key: 'repo-t10-appr',
            task_id: 'task-xyz-unknown',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { status: string; taskId: string };
    assert.equal(parsed.status, 'pending');
    assert.equal(parsed.taskId, 'task-xyz-unknown');
});

test('workspace_audit_export writes evidence bundle json', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    const wsDir = join(wBase, 'tenant-t10', 'bot-t10', 'repo-t10-audit');
    await mkdir(join(wsDir, '.agentfarm'), { recursive: true });
    await writeFile(join(wsDir, '.agentfarm', 'workspace-memory.json'), JSON.stringify({ codingStyle: 'functional' }), 'utf8');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t10', botId: 'bot-t10', taskId: 'task-audit-export',
        actionType: 'workspace_audit_export',
        payload: {
            workspace_key: 'repo-t10-audit',
            output_file: '.agentfarm/audit-export.json',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);

    const written = await readFile(join(wsDir, '.agentfarm', 'audit-export.json'), 'utf8');
    const bundle = JSON.parse(written) as { summary: { workspace_memory_keys: number } };
    assert.ok(bundle.summary.workspace_memory_keys >= 1);
});

// TIER 11: LOCAL DESKTOP AND BROWSER CONTROL

test('workspace_browser_open returns launch plan in dry_run mode', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-browser-open',
        actionType: 'workspace_browser_open',
        payload: {
            workspace_key: 'repo-t11-browser',
            url: 'https://example.com/docs',
            browser: 'default',
            dry_run: true,
        },
    });

    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { dry_run: boolean; args: string[] };
    assert.equal(parsed.dry_run, true);
    assert.equal(parsed.args[0], 'https://example.com/docs');
});

test('workspace_browser_open blocks non-http protocols', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-browser-block',
        actionType: 'workspace_browser_open',
        payload: {
            workspace_key: 'repo-t11-browser',
            url: 'file:///C:/Windows/System32',
            dry_run: true,
        },
    });

    assert.equal(result.ok, false);
    assert.ok((result.errorOutput ?? '').includes('http/https'));
});

test('workspace_app_launch returns launch plan for allowlisted app in dry_run', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-app-launch',
        actionType: 'workspace_app_launch',
        payload: {
            workspace_key: 'repo-t11-app',
            app: 'vscode',
            args: ['.'],
            dry_run: true,
        },
    });

    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as { app: string; dry_run: boolean };
    assert.equal(parsed.app, 'vscode');
    assert.equal(parsed.dry_run, true);
});

test('workspace_meeting_join enforces meeting host allowlist', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const blocked = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-block',
        actionType: 'workspace_meeting_join',
        payload: {
            workspace_key: 'repo-t11-meeting',
            meeting_url: 'https://evil.example.org/room/123',
            mode: 'browser',
            dry_run: true,
        },
    });
    assert.equal(blocked.ok, false);
    assert.ok((blocked.errorOutput ?? '').includes('allowlist'));

    const allowed = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-allow',
        actionType: 'workspace_meeting_join',
        payload: {
            workspace_key: 'repo-t11-meeting',
            meeting_url: 'https://teams.microsoft.com/l/meetup-join/abc',
            mode: 'browser',
            browser: 'default',
            dry_run: true,
        },
    });
    assert.equal(allowed.ok, true, allowed.errorOutput);
    const parsed = JSON.parse(allowed.output) as { dry_run: boolean; mode: string };
    assert.equal(parsed.dry_run, true);
    assert.equal(parsed.mode, 'browser');
});

test('workspace_app_launch respects AF_LOCAL_ALLOWED_APPS', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    process.env.AF_LOCAL_ALLOWED_APPS = 'vscode';
    try {
        const blocked = await executeLocalWorkspaceAction({
            tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-app-launch-block',
            actionType: 'workspace_app_launch',
            payload: {
                workspace_key: 'repo-t11-app-env',
                app: 'notepad',
                dry_run: true,
            },
        });
        assert.equal(blocked.ok, false);
        assert.ok((blocked.errorOutput ?? '').includes('not allowlisted'));

        const allowed = await executeLocalWorkspaceAction({
            tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-app-launch-allow',
            actionType: 'workspace_app_launch',
            payload: {
                workspace_key: 'repo-t11-app-env',
                app: 'vscode',
                dry_run: true,
            },
        });
        assert.equal(allowed.ok, true, allowed.errorOutput);
    } finally {
        delete process.env.AF_LOCAL_ALLOWED_APPS;
    }
});

test('workspace_meeting_join respects AF_LOCAL_ALLOWED_MEETING_HOSTS', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    process.env.AF_LOCAL_ALLOWED_MEETING_HOSTS = 'contoso.com';
    try {
        const blocked = await executeLocalWorkspaceAction({
            tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-host-block',
            actionType: 'workspace_meeting_join',
            payload: {
                workspace_key: 'repo-t11-meeting-env',
                meeting_url: 'https://teams.microsoft.com/l/meetup-join/abc',
                mode: 'browser',
                dry_run: true,
            },
        });
        assert.equal(blocked.ok, false);
        assert.ok((blocked.errorOutput ?? '').includes('allowlist'));

        const allowed = await executeLocalWorkspaceAction({
            tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-host-allow',
            actionType: 'workspace_meeting_join',
            payload: {
                workspace_key: 'repo-t11-meeting-env',
                meeting_url: 'https://meet.contoso.com/room/123',
                mode: 'browser',
                dry_run: true,
            },
        });
        assert.equal(allowed.ok, true, allowed.errorOutput);
    } finally {
        delete process.env.AF_LOCAL_ALLOWED_MEETING_HOSTS;
    }
});

test('workspace_meeting_speak returns invocation plan in dry_run mode', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-speak-dry-run',
        actionType: 'workspace_meeting_speak',
        payload: {
            workspace_key: 'repo-t11-meeting-speak',
            mode: 'statement',
            text: 'Thanks everyone, quick incident status update.',
            dry_run: true,
        },
    });

    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as {
        dry_run: boolean;
        mode: string;
        segments: string[];
    };
    assert.equal(parsed.dry_run, true);
    assert.equal(parsed.mode, 'statement');
    assert.equal(parsed.segments[0], 'Thanks everyone, quick incident status update.');
});

test('workspace_meeting_speak builds interview script when mode is interview', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-interview-dry-run',
        actionType: 'workspace_meeting_speak',
        payload: {
            workspace_key: 'repo-t11-meeting-interview',
            mode: 'interview',
            candidate_name: 'Asha',
            interview_role: 'Senior Backend Engineer',
            questions: [
                'Describe a time you handled a failed deployment.',
                'How do you design observability for distributed services?',
            ],
            dry_run: true,
        },
    });

    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as {
        interview_mode: boolean;
        segments: string[];
    };
    assert.equal(parsed.interview_mode, true);
    assert.ok(parsed.segments.some((segment) => segment.includes('Question 1.')));
    assert.ok(parsed.segments.some((segment) => segment.includes('Question 2.')));
});

test('workspace_meeting_speak requires text, script, or interview questions', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-speak-empty',
        actionType: 'workspace_meeting_speak',
        payload: {
            workspace_key: 'repo-t11-meeting-empty',
            mode: 'statement',
            dry_run: true,
        },
    });

    assert.equal(result.ok, false);
    assert.ok((result.errorOutput ?? '').includes('Provide payload.text'));
});

test('workspace_meeting_interview_live analyzes transcript and proposes follow-up', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-interview-live',
        actionType: 'workspace_meeting_interview_live',
        payload: {
            workspace_key: 'repo-t11-meeting-live',
            session_id: 'session-1',
            current_question: 'Tell me how you handled a production outage.',
            transcript_text: 'I led incident response, rolled back safely, validated with tests, and reduced p95 latency by 30 percent.',
            focus_areas: ['incident-response'],
            dry_run: true,
        },
    });

    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as {
        interview_mode: boolean;
        transcript_source: string;
        follow_up_question: string;
        analysis: { score: number };
        next_action: string;
    };
    assert.equal(parsed.interview_mode, true);
    assert.equal(parsed.transcript_source, 'payload');
    assert.equal(typeof parsed.follow_up_question, 'string');
    assert.equal(parsed.next_action, 'workspace_meeting_speak');
    assert.ok(parsed.analysis.score >= 0);
});

test('workspace_meeting_interview_live emits partial transcript events from transcript_chunks', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-interview-streaming',
        actionType: 'workspace_meeting_interview_live',
        payload: {
            workspace_key: 'repo-t11-meeting-live-stream',
            session_id: 'session-stream',
            current_question: 'How would you design this service for scale?',
            role_track: 'system_design',
            transcript_chunks: [
                'I would start with API requirements and throughput expectations.',
                'Then add caching, queue-based async processing, and observability metrics.',
            ],
            dry_run: true,
        },
    });

    assert.equal(result.ok, true, result.errorOutput);
    const parsed = JSON.parse(result.output) as {
        transcript_events: Array<{ event: string; text: string }>;
        partial_transcript_events: Array<{ event: string }>;
        rubric: { role_track: string; overall_score: number };
    };
    assert.equal(parsed.transcript_events.length, 2);
    assert.equal(parsed.partial_transcript_events.length, 2);
    assert.equal(parsed.transcript_events[0]?.event, 'partial');
    assert.equal(parsed.rubric.role_track, 'system_design');
    assert.ok(parsed.rubric.overall_score >= 0);
});

test('workspace_meeting_interview_live returns final recommendation summary when finalize=true', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const firstTurn = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-interview-finalize-1',
        actionType: 'workspace_meeting_interview_live',
        payload: {
            workspace_key: 'repo-t11-meeting-finalize',
            session_id: 'session-finalize',
            role_track: 'backend',
            current_question: 'Tell me how you improved backend reliability.',
            transcript_text: 'I added retries and rollback checks and validated with tests after deployment.',
        },
    });
    assert.equal(firstTurn.ok, true, firstTurn.errorOutput);

    const secondTurn = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-interview-finalize-2',
        actionType: 'workspace_meeting_interview_live',
        payload: {
            workspace_key: 'repo-t11-meeting-finalize',
            session_id: 'session-finalize',
            role_track: 'backend',
            current_question: 'How did you measure impact?',
            transcript_text: 'We reduced p95 latency by 20 percent and tracked alert volume reduction on dashboards.',
            finalize: true,
        },
    });
    assert.equal(secondTurn.ok, true, secondTurn.errorOutput);

    const parsed = JSON.parse(secondTurn.output) as {
        final_recommendation: null | {
            session_id: string;
            role_track: string;
            total_turns: number;
            final_recommendation: string;
        };
    };

    assert.ok(parsed.final_recommendation);
    assert.equal(parsed.final_recommendation?.session_id, 'session-finalize');
    assert.equal(parsed.final_recommendation?.role_track, 'backend');
    assert.equal(parsed.final_recommendation?.total_turns, 2);
});

test('workspace_meeting_interview_live requires current_question', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-meeting-interview-missing-question',
        actionType: 'workspace_meeting_interview_live',
        payload: {
            workspace_key: 'repo-t11-meeting-live',
            transcript_text: 'Candidate answer',
            dry_run: true,
        },
    });

    assert.equal(result.ok, false);
    assert.ok((result.errorOutput ?? '').includes('payload.current_question is required'));
});

test('workspace_audit_export includes desktop action approval metadata', async () => {
    const { executeLocalWorkspaceAction } = await import('./local-workspace-executor.js');
    const { writeFile, mkdir, readFile } = await import('node:fs/promises');

    const wBase = process.env.AF_WORKSPACE_BASE!;
    const wsDir = join(wBase, 'tenant-t11', 'bot-t11', 'repo-t11-audit-approvals');
    await mkdir(join(wsDir, '.agentfarm'), { recursive: true });
    await writeFile(join(wsDir, '.agentfarm', 'approval-log.json'), JSON.stringify([
        {
            taskId: 'task-join-1',
            actionType: 'workspace_meeting_join',
            status: 'approved',
            actor: 'manager1',
            timestamp: '2026-04-30T10:00:00.000Z',
            reason: 'Customer escalation bridge call',
            riskLevel: 'high',
        },
        {
            taskId: 'task-edit-2',
            actionType: 'code_edit',
            status: 'approved',
            actor: 'manager2',
            timestamp: '2026-04-30T10:05:00.000Z',
        },
    ], null, 2), 'utf8');

    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t11', botId: 'bot-t11', taskId: 'task-audit-approvals',
        actionType: 'workspace_audit_export',
        payload: {
            workspace_key: 'repo-t11-audit-approvals',
            output_file: '.agentfarm/audit-export.json',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);

    const written = await readFile(join(wsDir, '.agentfarm', 'audit-export.json'), 'utf8');
    const bundle = JSON.parse(written) as {
        desktop_action_approvals: Array<{ action_type: string; approved_by: string | null; reason: string | null }>;
        summary: { desktop_action_approval_records: number };
    };
    assert.equal(bundle.summary.desktop_action_approval_records, 1);
    assert.equal(bundle.desktop_action_approvals[0]?.action_type, 'workspace_meeting_join');
    assert.equal(bundle.desktop_action_approvals[0]?.approved_by, 'manager1');
    assert.ok((bundle.desktop_action_approvals[0]?.reason ?? '').includes('bridge call'));
});

// ---------------------------------------------------------------------------
// Tier 12: workspace_subagent_spawn
// ---------------------------------------------------------------------------

test('workspace_subagent_spawn returns dry_run plan with agentfarm engine', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-subagent-dryrun',
        actionType: 'workspace_subagent_spawn',
        payload: {
            prompt: 'Fix the failing unit test in auth.ts',
            target_files: ['src/auth.ts'],
            dry_run: true,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const plan = JSON.parse(result.output) as {
        dry_run: boolean;
        engine: string;
        prompt: string;
        target_files: string[];
        test_command: string;
    };
    assert.equal(plan.dry_run, true);
    assert.equal(plan.engine, 'agentfarm-autonomous');
    assert.ok(plan.prompt.includes('auth.ts'), 'prompt should be preserved');
    assert.deepStrictEqual(plan.target_files, ['src/auth.ts']);
    assert.ok(typeof plan.test_command === 'string' && plan.test_command.length > 0, 'test_command should be auto-detected');
});

test('workspace_subagent_spawn dry_run respects explicit test_command and max_attempts', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-subagent-options',
        actionType: 'workspace_subagent_spawn',
        payload: {
            prompt: 'Add error handling to payment service',
            test_command: 'pnpm test --filter payments',
            max_attempts: 5,
            dry_run: true,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const plan = JSON.parse(result.output) as { test_command: string; max_attempts: number };
    assert.equal(plan.test_command, 'pnpm test --filter payments');
    assert.equal(plan.max_attempts, 5);
});

test('workspace_subagent_spawn dry_run infers initial and fix plans when none are provided', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-subagent-autoplan',
        actionType: 'workspace_subagent_spawn',
        payload: {
            prompt: 'Analyze the failing approval queue tests and repair the regression',
            target_files: ['src/runtime-server.ts', 'src/runtime-server.test.ts'],
            dry_run: true,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const plan = JSON.parse(result.output) as {
        initial_plan_steps: number;
        fix_attempt_steps: number;
        build_command: string | null;
    };
    assert.ok(plan.initial_plan_steps > 0, 'initial plan should be inferred');
    assert.ok(plan.fix_attempt_steps > 0, 'fix attempts should be inferred');
    assert.ok('build_command' in plan, 'dry-run output should include build_command even when no build is detected');
});

test('workspace_subagent_spawn dry_run auto-selects azure deployment specialist profile', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-subagent-azure',
        actionType: 'workspace_subagent_spawn',
        payload: {
            prompt: 'Deploy this service to Azure Container Apps with azd and Key Vault configuration',
            dry_run: true,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const plan = JSON.parse(result.output) as {
        specialist_profile: string;
        workflow: string;
        imported_sources: Array<{ name: string }>;
    };
    assert.equal(plan.specialist_profile, 'azure_deployment');
    assert.equal(plan.workflow, 'azure_deployment');
    assert.ok(plan.imported_sources.some((source) => source.name === 'Azure CLI'));
});

test('workspace_subagent_spawn dry_run accepts explicit specialist_profile and plan steps', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-subagent-profile',
        actionType: 'workspace_subagent_spawn',
        payload: {
            prompt: 'Review pull request readiness',
            specialist_profile: 'github_pr_review',
            initial_plan: [
                {
                    description: 'run targeted tests',
                    actions: [{ action: 'run_tests', command: 'pnpm test --filter runtime' }],
                },
            ],
            fix_attempts: [
                {
                    description: 're-run targeted tests',
                    actions: [{ action: 'run_tests', command: 'pnpm test --filter runtime' }],
                },
            ],
            dry_run: true,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const plan = JSON.parse(result.output) as {
        specialist_profile: string;
        initial_plan_steps: number;
        fix_attempt_steps: number;
    };
    assert.equal(plan.specialist_profile, 'github_pr_review');
    assert.equal(plan.initial_plan_steps, 1);
    assert.equal(plan.fix_attempt_steps, 1);
});

test('workspace_subagent_spawn ignores unknown agent param (no external CLI)', async () => {
    // The new implementation does not use agent param at all (no external CLI).
    // Any agent value in payload should be silently ignored; dry_run should still work.
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-subagent-ignoreparam',
        actionType: 'workspace_subagent_spawn',
        payload: {
            agent: 'malicious-binary',
            prompt: 'do something',
            dry_run: true,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const plan = JSON.parse(result.output) as { engine: string };
    assert.equal(plan.engine, 'agentfarm-autonomous', 'should always use AgentFarm engine');
});

test('workspace_subagent_spawn requires prompt', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-subagent-noprompt',
        actionType: 'workspace_subagent_spawn',
        payload: { dry_run: true },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errorOutput?.includes('prompt'), 'error should mention prompt');
});

// ---------------------------------------------------------------------------
// Tier 12: workspace_github_issue_triage
// ---------------------------------------------------------------------------

test('workspace_github_issue_triage classifies issues without fetching GitHub when payload is complete', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-issue-triage',
        actionType: 'workspace_github_issue_triage',
        payload: {
            issue_number: 73,
            issue_title: 'Dashboard throws 500 when loading tenant overview',
            issue_body: 'Regression after the last deploy. Multiple customers are blocked from viewing dashboard metrics.',
            labels: ['bug', 'customer-reported'],
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const triage = JSON.parse(result.output) as {
        issue_number: string;
        specialist_profile: string;
        issue_type: string;
        priority: string;
        suggested_labels: string[];
    };
    assert.equal(triage.issue_number, '73');
    assert.equal(triage.specialist_profile, 'github_issue_triage');
    assert.equal(triage.issue_type, 'bug');
    assert.ok(['P0', 'P1', 'P2', 'P3', 'P4'].includes(triage.priority));
    assert.ok(triage.suggested_labels.includes('bug'));
});

// ---------------------------------------------------------------------------
// Tier 12: workspace_github_pr_status
// ---------------------------------------------------------------------------

test('workspace_github_pr_status requires pr_number', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-pr-noid',
        actionType: 'workspace_github_pr_status',
        payload: {},
    });
    assert.equal(result.ok, false);
    assert.ok(result.errorOutput?.includes('pr_number'), 'error should mention pr_number');
});

test('workspace_github_pr_status rejects non-positive pr_number', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-pr-zero',
        actionType: 'workspace_github_pr_status',
        payload: { pr_number: 0 },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errorOutput?.includes('pr_number'));
});

// ---------------------------------------------------------------------------
// Tier 12: workspace_github_issue_fix
// ---------------------------------------------------------------------------

test('workspace_github_issue_fix dry_run returns issue prompt plan', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-issue-fix-dry',
        actionType: 'workspace_github_issue_fix',
        payload: {
            issue_number: 42,
            repo: 'myorg/myrepo',
            issue_title: 'Auth callback fails for invited users',
            issue_body: 'Steps to reproduce: invite a new user, accept the invite, then callback returns 500.',
            dry_run: true,
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const plan = JSON.parse(result.output) as {
        dry_run: boolean;
        issue_number: string;
        prompt: string;
        specialist_profile: string;
        imported_sources: Array<{ name: string }>;
    };
    assert.equal(plan.dry_run, true);
    assert.equal(plan.issue_number, '42');
    assert.equal(plan.specialist_profile, 'github_issue_fix');
    assert.ok(plan.prompt.includes('42'), 'prompt should reference issue number');
    assert.ok(plan.imported_sources.some((source) => source.name === 'gh-issues'));
});

test('workspace_github_issue_fix requires issue_number', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-issue-noid',
        actionType: 'workspace_github_issue_fix',
        payload: { dry_run: true },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errorOutput?.includes('issue_number'), 'error should mention issue_number');
});

// ---------------------------------------------------------------------------
// Tier 12: workspace_azure_deploy_plan
// ---------------------------------------------------------------------------

test('workspace_azure_deploy_plan returns a first-class deployment planner response', async () => {
    const result = await executeLocalWorkspaceAction({
        tenantId: 'tenant-t12',
        botId: 'bot-t12',
        taskId: 'task-azure-deploy-plan',
        actionType: 'workspace_azure_deploy_plan',
        payload: {
            objective: 'Deploy the runtime service to Azure with environment-aware validation',
            environment: 'staging',
            subscription: 'sub-123',
            resource_group: 'rg-agentfarm-staging',
            location: 'eastus2',
            service_name: 'agentfarm-runtime',
        },
    });
    assert.equal(result.ok, true, result.errorOutput);
    const plan = JSON.parse(result.output) as {
        specialist_profile: string;
        deployment_strategy: string;
        preflight_commands: string[];
        deploy_commands: string[];
        recommended_next_action: string;
    };
    assert.equal(plan.specialist_profile, 'azure_deployment');
    assert.ok(plan.preflight_commands.length > 0);
    assert.ok(plan.deploy_commands.length > 0);
    assert.equal(plan.recommended_next_action, 'workspace_subagent_spawn');
    assert.ok(['azd', 'bicep', 'static_web_app', 'container_apps', 'app_service'].includes(plan.deployment_strategy));
});

// ---------------------------------------------------------------------------
// Tier 12: workspace_slack_notify
// ---------------------------------------------------------------------------

test('workspace_slack_notify requires SLACK_BOT_TOKEN env var', async () => {
    const saved = process.env['SLACK_BOT_TOKEN'];
    try {
        delete process.env['SLACK_BOT_TOKEN'];
        const result = await executeLocalWorkspaceAction({
            tenantId: 'tenant-t12',
            botId: 'bot-t12',
            taskId: 'task-slack-notoken',
            actionType: 'workspace_slack_notify',
            payload: { channel: 'C123456', message: 'hello' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('connectorActionExecuteClient'), 'error should mention connectorActionExecuteClient');
    } finally {
        if (saved !== undefined) {
            process.env['SLACK_BOT_TOKEN'] = saved;
        }
    }
});

test('workspace_slack_notify requires channel', async () => {
    const saved = process.env['SLACK_BOT_TOKEN'];
    try {
        process.env['SLACK_BOT_TOKEN'] = 'xoxb-test-token';
        const result = await executeLocalWorkspaceAction({
            tenantId: 'tenant-t12',
            botId: 'bot-t12',
            taskId: 'task-slack-nochannel',
            actionType: 'workspace_slack_notify',
            payload: { message: 'hello' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('channel'), 'error should mention channel');
    } finally {
        if (saved !== undefined) {
            process.env['SLACK_BOT_TOKEN'] = saved;
        } else {
            delete process.env['SLACK_BOT_TOKEN'];
        }
    }
});

test('workspace_slack_notify requires message', async () => {
    const saved = process.env['SLACK_BOT_TOKEN'];
    try {
        process.env['SLACK_BOT_TOKEN'] = 'xoxb-test-token';
        const result = await executeLocalWorkspaceAction({
            tenantId: 'tenant-t12',
            botId: 'bot-t12',
            taskId: 'task-slack-nomessage',
            actionType: 'workspace_slack_notify',
            payload: { channel: 'C123456' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('message'), 'error should mention message');
    } finally {
        if (saved !== undefined) {
            process.env['SLACK_BOT_TOKEN'] = saved;
        } else {
            delete process.env['SLACK_BOT_TOKEN'];
        }
    }
});
