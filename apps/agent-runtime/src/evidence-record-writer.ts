import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { EvidenceRecord, EvidenceRecordWriter } from './evidence-record-contract.js';

const DEFAULT_EVIDENCE_RECORD_PATH = 'data/evidence-records.ndjson';

const readEnv = (env: NodeJS.ProcessEnv, primary: string, fallback: string): string | undefined => {
    return env[primary] ?? env[fallback];
};

export const resolveEvidenceRecordPath = (
    env: NodeJS.ProcessEnv,
    cwd: string = process.cwd(),
): string => {
    const configured = readEnv(env, 'AF_EVIDENCE_RECORD_PATH', 'AGENTFARM_EVIDENCE_RECORD_PATH');
    if (!configured || !configured.trim()) {
        return resolve(cwd, DEFAULT_EVIDENCE_RECORD_PATH);
    }
    return resolve(cwd, configured);
};

export const createFileEvidenceRecordWriter = (targetPath: string): EvidenceRecordWriter => {
    return async (record: EvidenceRecord) => {
        const directory = dirname(targetPath);
        await mkdir(directory, { recursive: true });
        const line = `${JSON.stringify(record)}\n`;
        await appendFile(targetPath, line, { encoding: 'utf8', flag: 'a' });
    };
};
