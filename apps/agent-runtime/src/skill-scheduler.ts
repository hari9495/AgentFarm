/**
 * Skill Scheduler — Tier I
 *
 * Provides cron-based and interval-based scheduling for skill pipelines
 * and individual skills. Schedules persist across restarts. Each job
 * stores its last run result and next scheduled time.
 *
 * Cron format: "minute hour day-of-month month day-of-week"
 * Examples:
 *   "0 9 * * 1"   — Every Monday at 09:00
 *   "0 * * * *"   — Every hour
 *   "* /15 * * * *" — Every 15 minutes
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleFrequency =
    | { type: 'cron'; expression: string }
    | { type: 'interval_ms'; interval_ms: number }
    | { type: 'once'; run_at: string };

export type ScheduledJobTarget =
    | { kind: 'pipeline'; pipeline_id: string; initial_inputs?: Record<string, unknown> }
    | { kind: 'skill'; skill_id: string; inputs?: Record<string, unknown> };

export type ScheduledJob = {
    id: string;
    name: string;
    target: ScheduledJobTarget;
    frequency: ScheduleFrequency;
    active: boolean;
    created_at: string;
    last_run_at?: string;
    next_run_at: string;
    last_run_ok?: boolean;
    last_run_summary?: string;
    run_count: number;
    dry_run: boolean;
    tags: string[];
};

export type JobRunRecord = {
    job_id: string;
    run_id: string;
    started_at: string;
    duration_ms: number;
    ok: boolean;
    summary: string;
};

// ---------------------------------------------------------------------------
// Cron helpers (minimal in-process evaluator — no external deps)
// ---------------------------------------------------------------------------

function parseCronField(field: string, min: number, max: number): Set<number> {
    const result = new Set<number>();
    for (const part of field.split(',')) {
        if (part === '*') {
            for (let i = min; i <= max; i++) result.add(i);
        } else if (part.startsWith('*/')) {
            const step = parseInt(part.slice(2), 10);
            if (!isNaN(step) && step > 0) {
                for (let i = min; i <= max; i += step) result.add(i);
            }
        } else if (part.includes('-')) {
            const [from, to] = part.split('-').map(Number);
            if (from !== undefined && to !== undefined && !isNaN(from) && !isNaN(to)) {
                for (let i = from; i <= to; i++) result.add(i);
            }
        } else {
            const n = parseInt(part, 10);
            if (!isNaN(n) && n >= min && n <= max) result.add(n);
        }
    }
    return result;
}

export function cronMatches(expression: string, date: Date): boolean {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const [minuteF, hourF, domF, monthF, dowF] = parts;

    const minutes = parseCronField(minuteF!, 0, 59);
    const hours = parseCronField(hourF!, 0, 23);
    const doms = parseCronField(domF!, 1, 31);
    const months = parseCronField(monthF!, 1, 12);
    const dows = parseCronField(dowF!, 0, 6);

    return (
        minutes.has(date.getUTCMinutes()) &&
        hours.has(date.getUTCHours()) &&
        doms.has(date.getUTCDate()) &&
        months.has(date.getUTCMonth() + 1) &&
        dows.has(date.getUTCDay())
    );
}

export function nextCronOccurrence(expression: string, after: Date = new Date()): Date {
    // Step through minutes until we find a match (up to 1 year out)
    const candidate = new Date(after.getTime() + 60_000); // start 1 minute ahead
    candidate.setUTCSeconds(0, 0);
    const limit = new Date(after.getTime() + 366 * 24 * 60 * 60_000);
    while (candidate <= limit) {
        if (cronMatches(expression, candidate)) return new Date(candidate);
        candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    }
    return new Date(after.getTime() + 366 * 24 * 60 * 60_000);
}

function computeNextRunAt(frequency: ScheduleFrequency): string {
    const now = new Date();
    if (frequency.type === 'cron') {
        return nextCronOccurrence(frequency.expression, now).toISOString();
    }
    if (frequency.type === 'interval_ms') {
        return new Date(now.getTime() + frequency.interval_ms).toISOString();
    }
    // once
    return frequency.run_at;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const SCHEDULER_DIR = join(tmpdir(), 'agentfarm-skill-scheduler');
const JOBS_FILE = join(SCHEDULER_DIR, 'jobs.json');
const HISTORY_FILE = join(SCHEDULER_DIR, 'history.json');

// ---------------------------------------------------------------------------
// SkillScheduler
// ---------------------------------------------------------------------------

export class SkillScheduler {
    private jobs: Map<string, ScheduledJob> = new Map();
    private history: JobRunRecord[] = [];
    private tickTimer: ReturnType<typeof setInterval> | null = null;
    private runCallback?: (target: ScheduledJobTarget, dryRun: boolean) => Promise<{ ok: boolean; summary: string }>;

    // ── Callback ───────────────────────────────────────────────────────────

    onRun(callback: (target: ScheduledJobTarget, dryRun: boolean) => Promise<{ ok: boolean; summary: string }>): void {
        this.runCallback = callback;
    }

    setRunCallback(cb: (target: ScheduledJobTarget, dryRun: boolean) => Promise<{ ok: boolean; summary: string }>): void {
        this.runCallback = cb;
    }

    // ── Job management ─────────────────────────────────────────────────────

    async createJob(input: {
        name: string;
        target: ScheduledJobTarget;
        frequency: ScheduleFrequency;
        dry_run?: boolean;
        tags?: string[];
    }): Promise<ScheduledJob> {
        const job: ScheduledJob = {
            id: randomUUID(),
            name: input.name,
            target: input.target,
            frequency: input.frequency,
            active: true,
            created_at: new Date().toISOString(),
            next_run_at: computeNextRunAt(input.frequency),
            run_count: 0,
            dry_run: input.dry_run ?? false,
            tags: input.tags ?? [],
        };
        this.jobs.set(job.id, job);
        await this.persistJobs();
        return job;
    }

    async pauseJob(id: string): Promise<boolean> {
        const job = this.jobs.get(id);
        if (!job) return false;
        job.active = false;
        await this.persistJobs();
        return true;
    }

    async resumeJob(id: string): Promise<boolean> {
        const job = this.jobs.get(id);
        if (!job) return false;
        job.active = true;
        job.next_run_at = computeNextRunAt(job.frequency);
        await this.persistJobs();
        return true;
    }

    async deleteJob(id: string): Promise<boolean> {
        const existed = this.jobs.has(id);
        this.jobs.delete(id);
        if (existed) await this.persistJobs();
        return existed;
    }

    listJobs(): ScheduledJob[] {
        return Array.from(this.jobs.values());
    }

    getJob(id: string): ScheduledJob | undefined {
        return this.jobs.get(id);
    }

    // ── Tick (called by start()) ───────────────────────────────────────────

    async tick(now: Date = new Date()): Promise<{ fired: string[] }> {
        const fired: string[] = [];

        for (const job of this.jobs.values()) {
            if (!job.active) continue;
            if (new Date(job.next_run_at) > now) continue;

            fired.push(job.id);
            const runId = randomUUID();
            const startedAt = Date.now();

            let ok = true;
            let summary = 'dry-run skipped';

            if (this.runCallback) {
                try {
                    const result = await this.runCallback(job.target, job.dry_run);
                    ok = result.ok;
                    summary = result.summary;
                } catch (err) {
                    ok = false;
                    summary = err instanceof Error ? err.message : String(err);
                }
            }

            const record: JobRunRecord = {
                job_id: job.id,
                run_id: runId,
                started_at: new Date().toISOString(),
                duration_ms: Date.now() - startedAt,
                ok,
                summary,
            };

            this.history.unshift(record);
            if (this.history.length > 500) this.history = this.history.slice(0, 500);

            job.run_count++;
            job.last_run_at = record.started_at;
            job.last_run_ok = ok;
            job.last_run_summary = summary;

            // Advance schedule
            if (job.frequency.type === 'once') {
                job.active = false;
            } else {
                job.next_run_at = computeNextRunAt(job.frequency);
            }
        }

        if (fired.length > 0) {
            await this.persistJobs();
            await this.persistHistory();
        }

        return { fired };
    }

    // ── Background ticking ─────────────────────────────────────────────────

    start(intervalMs = 60_000): void {
        if (this.tickTimer) return;
        this.tickTimer = setInterval(() => {
            this.tick().catch(() => { });
        }, intervalMs);
    }

    stop(): void {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }
    }

    // ── History ────────────────────────────────────────────────────────────

    getHistory(limit = 50): JobRunRecord[] {
        return this.history.slice(0, limit);
    }

    getJobHistory(jobId: string, limit = 20): JobRunRecord[] {
        return this.history.filter((r) => r.job_id === jobId).slice(0, limit);
    }

    // ── Persistence ────────────────────────────────────────────────────────

    private async persistJobs(): Promise<void> {
        await mkdir(SCHEDULER_DIR, { recursive: true });
        await writeFile(JOBS_FILE, JSON.stringify(Array.from(this.jobs.entries()), null, 2), 'utf8');
    }

    async loadJobs(): Promise<void> {
        try {
            const raw = await readFile(JOBS_FILE, 'utf8');
            const entries = JSON.parse(raw) as [string, ScheduledJob][];
            this.jobs = new Map(entries);
        } catch {
            // No persisted state
        }
    }

    private async persistHistory(): Promise<void> {
        await mkdir(SCHEDULER_DIR, { recursive: true });
        await writeFile(HISTORY_FILE, JSON.stringify(this.history.slice(0, 100), null, 2), 'utf8');
    }

    async loadHistory(): Promise<void> {
        try {
            const raw = await readFile(HISTORY_FILE, 'utf8');
            this.history = JSON.parse(raw) as JobRunRecord[];
        } catch {
            // No persisted state
        }
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const globalScheduler = new SkillScheduler();
