// ============================================================================
// Cron utilities — minimal 5-field cron parser (no external dependencies)
// Fields: minute  hour  dom  month  dow
// Accepts: * | */n | n | n,m,... | n-m
// ============================================================================

export type CronFields = {
    minute: number[];
    hour: number[];
    dom: number[];
    month: number[];
    dow: number[];
};

const FIELD_RE = /^(\*|(\*\/\d+)|\d+(,\d+)*|(\d+-\d+))$/;

function range(min: number, max: number): number[] {
    const out: number[] = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
}

function expandField(field: string, min: number, max: number): number[] {
    if (!FIELD_RE.test(field)) {
        throw new Error(`Invalid cron field: "${field}"`);
    }

    if (field === '*') {
        return range(min, max);
    }

    if (field.startsWith('*/')) {
        const step = parseInt(field.slice(2), 10);
        if (isNaN(step) || step <= 0) {
            throw new Error(`Invalid step in cron field: "${field}"`);
        }
        return range(min, max).filter((n) => (n - min) % step === 0);
    }

    if (field.includes('-')) {
        const parts = field.split('-');
        const a = parseInt(parts[0]!, 10);
        const b = parseInt(parts[1]!, 10);
        if (isNaN(a) || isNaN(b) || a > b || a < min || b > max) {
            throw new Error(`Invalid range in cron field: "${field}" (valid ${min}-${max})`);
        }
        return range(a, b);
    }

    if (field.includes(',')) {
        return field.split(',').map((f) => {
            const n = parseInt(f, 10);
            if (isNaN(n) || n < min || n > max) {
                throw new Error(`Out of range in cron field: "${f}" (valid ${min}-${max})`);
            }
            return n;
        });
    }

    // Single number
    const n = parseInt(field, 10);
    if (isNaN(n) || n < min || n > max) {
        throw new Error(`Out of range in cron field: "${field}" (valid ${min}-${max})`);
    }
    return [n];
}

/**
 * Parse a standard 5-field cron expression.
 * Throws a descriptive Error if the expression is invalid.
 */
export function parseCron(expr: string): CronFields {
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) {
        throw new Error(
            `Invalid cron expression: expected 5 fields, got ${fields.length}: "${expr}"`,
        );
    }
    return {
        minute: expandField(fields[0]!, 0, 59),
        hour: expandField(fields[1]!, 0, 23),
        dom: expandField(fields[2]!, 1, 31),
        month: expandField(fields[3]!, 1, 12),
        dow: expandField(fields[4]!, 0, 7),
    };
}

/**
 * Return the next Date on or after `after` that matches the cron expression.
 * Walks forward minute-by-minute up to 366 days; throws if no match found.
 */
export function getNextRun(expr: string, after: Date): Date {
    const fields = parseCron(expr);
    const MAX_MINUTES = 366 * 24 * 60;

    // Ceil to minute boundary: if after has sub-minute precision, advance to next minute
    const candidate = new Date(after);
    candidate.setSeconds(0);
    candidate.setMilliseconds(0);
    if (candidate.getTime() < after.getTime()) {
        candidate.setMinutes(candidate.getMinutes() + 1);
    }

    for (let i = 0; i < MAX_MINUTES; i++) {
        const min = candidate.getUTCMinutes();
        const hour = candidate.getUTCHours();
        const dom = candidate.getUTCDate();
        const month = candidate.getUTCMonth() + 1; // 1-12
        const dow = candidate.getUTCDay();        // 0 = Sunday

        // dow=7 is an alias for Sunday (0)
        const dowMatch =
            fields.dow.includes(dow) || (fields.dow.includes(7) && dow === 0);

        if (
            fields.minute.includes(min) &&
            fields.hour.includes(hour) &&
            fields.dom.includes(dom) &&
            fields.month.includes(month) &&
            dowMatch
        ) {
            return new Date(candidate);
        }

        candidate.setMinutes(candidate.getMinutes() + 1);
    }

    throw new Error(
        `No matching time found within 366 days for cron expression: "${expr}"`,
    );
}

/**
 * Returns true if the job is due to run at `now`.
 * A job with nextRunAt = null is always considered due (first run).
 */
export function isDue(
    job: { cronExpr: string; nextRunAt: Date | null },
    now: Date,
): boolean {
    return job.nextRunAt === null || job.nextRunAt <= now;
}
