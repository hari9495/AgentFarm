import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ActionResultRecord, ActionResultWriter } from './action-result-contract.js';

const DEFAULT_ACTION_RESULT_PATH = 'data/action-results.ndjson';

const readEnv = (env: NodeJS.ProcessEnv, primary: string, fallback: string): string | undefined => {
    return env[primary] ?? env[fallback];
};

export const resolveActionResultPath = (
    env: NodeJS.ProcessEnv,
    cwd: string = process.cwd(),
): string => {
    const configured = readEnv(env, 'AF_ACTION_RESULT_LOG_PATH', 'AGENTFARM_ACTION_RESULT_LOG_PATH');
    if (!configured || !configured.trim()) {
        return resolve(cwd, DEFAULT_ACTION_RESULT_PATH);
    }
    return resolve(cwd, configured);
};

export const createFileActionResultWriter = (targetPath: string): ActionResultWriter => {
    return async (record: ActionResultRecord) => {
        const directory = dirname(targetPath);
        await mkdir(directory, { recursive: true });
        const line = `${JSON.stringify(record)}\n`;
        await appendFile(targetPath, line, { encoding: 'utf8', flag: 'a' });
    };
};
