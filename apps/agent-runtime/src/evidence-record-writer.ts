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

        // Fire-and-forget POST to evidence-service
        // EVIDENCE_SERVICE_URL — base URL of the evidence-service (default: http://localhost:3005)
        // EVIDENCE_SERVICE_TOKEN — shared service token sent in x-service-token header
        const evidenceServiceUrl = process.env.EVIDENCE_SERVICE_URL ?? 'http://localhost:3005';
        try {
            void fetch(`${evidenceServiceUrl}/v1/evidence`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-service-token': process.env.EVIDENCE_SERVICE_TOKEN ?? '',
                },
                body: JSON.stringify(record),
            }).catch((err: unknown) => {
                console.error('[evidence-record-writer] evidence-service POST failed:', err);
            });
        } catch (err: unknown) {
            console.error('[evidence-record-writer] evidence-service fire-and-forget setup error:', err);
        }
    };
};
