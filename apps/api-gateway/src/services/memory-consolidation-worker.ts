/**
 * memory-consolidation-worker.ts
 *
 * FluxMem Phase 1 — Lesson Consolidation.
 *
 * Periodically sweeps AgentLongTermMemory and merges scattered per-rejection
 * lessons (e.g. ba:lesson:scope:ws-1:uuid-A, ba:lesson:scope:ws-1:uuid-B…)
 * into a single authoritative consolidated entry per (agent, category, workspace).
 *
 * This keeps RAG context blocks tight: instead of injecting 30 noisy individual
 * lessons, each agent's prompt receives at most one consolidated entry per
 * category — ranked by confidence, deduped, and carrying a combined observedCount.
 *
 * Environment variables:
 *   MEMORY_CONSOLIDATION_INTERVAL_MS  — sweep cadence (default: 21 600 000 = 6 h)
 */

import { consolidateLessons } from '@agentfarm/memory-service';
import { prisma } from '../lib/db.js';

const SWEEP_INTERVAL_MS = (): number =>
    parseInt(process.env['MEMORY_CONSOLIDATION_INTERVAL_MS'] ?? '21600000', 10) || 21_600_000;

const log = {
    info: (msg: string) => console.log(`[memory-consolidation-worker] ${msg}`),
    error: (msg: string, err?: unknown) => console.error(`[memory-consolidation-worker] ${msg}`, err),
};

let workerTimer: NodeJS.Timeout | null = null;
let workerStopping = false;
let inFlightSweep = false;

async function runSweep(): Promise<void> {
    const result = await consolidateLessons(prisma);
    log.info(
        `sweep complete — scanned ${result.groupsScanned} group(s), ` +
        `consolidated ${result.groupsConsolidated}, wrote ${result.patternsWritten} pattern(s)`,
    );
}

function scheduleNext(delayMs: number): void {
    if (workerStopping) return;

    workerTimer = setTimeout(async () => {
        if (workerStopping) return;

        if (inFlightSweep) {
            scheduleNext(SWEEP_INTERVAL_MS());
            return;
        }

        inFlightSweep = true;
        try {
            await runSweep();
            scheduleNext(SWEEP_INTERVAL_MS());
        } catch (err) {
            log.error('sweep failed', err);
            scheduleNext(SWEEP_INTERVAL_MS());
        } finally {
            inFlightSweep = false;
        }
    }, delayMs);
}

export function startMemoryConsolidationWorker(): void {
    if (workerTimer) {
        log.info('already running');
        return;
    }
    workerStopping = false;
    scheduleNext(30_000); // first sweep 30 s after startup to let the DB settle
    log.info('started');
}

export function stopMemoryConsolidationWorker(): void {
    workerStopping = true;
    if (workerTimer) {
        clearTimeout(workerTimer);
        workerTimer = null;
    }
    log.info('stopped');
}
