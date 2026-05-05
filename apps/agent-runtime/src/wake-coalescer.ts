/**
 * WakeCoalescer
 *
 * Deduplicates concurrent wake-up triggers within a configurable time window.
 * Multiple trigger calls within the window are coalesced into a single execution.
 *
 * Usage:
 *   globalWakeCoalescer.trigger('assignment', () => processQueue());
 */

export type WakeTriggerType = 'timer' | 'assignment' | 'on_demand' | 'automation';

export type WakeCoalescerStats = {
    total_triggers: number;
    coalesced_count: number;
    executions_count: number;
    last_trigger_at: number | null;
    last_execution_at: number | null;
    pending: boolean;
};

type CoalesceEntry = {
    triggerType: WakeTriggerType;
    callback: () => void | Promise<void>;
    scheduledAt: number;
    timerHandle: ReturnType<typeof setTimeout>;
};

export class WakeCoalescer {
    private readonly windowMs: number;
    private pending: CoalesceEntry | null = null;
    private totalTriggers = 0;
    private coalescedCount = 0;
    private executionsCount = 0;
    private lastTriggerAt: number | null = null;
    private lastExecutionAt: number | null = null;

    constructor(windowMs = 500) {
        if (windowMs <= 0) throw new RangeError('windowMs must be positive');
        this.windowMs = windowMs;
    }

    /**
     * Register a wake trigger. If a trigger is already pending within the current window,
     * the existing timer is kept and a new coalesce counter is incremented.
     * If no trigger is pending, a new timer is scheduled.
     *
     * @param triggerType  The reason for this wake
     * @param callback     The function to execute after the coalesce window elapses
     * @returns            'scheduled' | 'coalesced'
     */
    trigger(triggerType: WakeTriggerType, callback: () => void | Promise<void>): 'scheduled' | 'coalesced' {
        this.totalTriggers++;
        this.lastTriggerAt = Date.now();

        if (this.pending !== null) {
            // Already waiting — absorb this trigger into the existing window
            this.coalescedCount++;
            // Update the callback to the latest one so the most recent intent wins
            this.pending.callback = callback;
            this.pending.triggerType = triggerType;
            return 'coalesced';
        }

        // No pending execution — schedule a new one
        const timerHandle = setTimeout(() => {
            const entry = this.pending;
            this.pending = null;
            if (!entry) return;
            this.executionsCount++;
            this.lastExecutionAt = Date.now();
            void entry.callback();
        }, this.windowMs);

        this.pending = {
            triggerType,
            callback,
            scheduledAt: Date.now(),
            timerHandle,
        };

        return 'scheduled';
    }

    /**
     * Cancel any pending coalesced execution.
     * Returns true if a pending execution was cancelled, false if nothing was pending.
     */
    cancel(): boolean {
        if (this.pending === null) return false;
        clearTimeout(this.pending.timerHandle);
        this.pending = null;
        return true;
    }

    /**
     * Force immediate execution of any pending coalesced callback, bypassing the window.
     * Returns false if nothing was pending.
     */
    flush(): boolean {
        if (this.pending === null) return false;
        clearTimeout(this.pending.timerHandle);
        const entry = this.pending;
        this.pending = null;
        this.executionsCount++;
        this.lastExecutionAt = Date.now();
        void entry.callback();
        return true;
    }

    getStats(): WakeCoalescerStats {
        return {
            total_triggers: this.totalTriggers,
            coalesced_count: this.coalescedCount,
            executions_count: this.executionsCount,
            last_trigger_at: this.lastTriggerAt,
            last_execution_at: this.lastExecutionAt,
            pending: this.pending !== null,
        };
    }

    /** Reset all counters and cancel any pending execution. */
    reset(): void {
        this.cancel();
        this.totalTriggers = 0;
        this.coalescedCount = 0;
        this.executionsCount = 0;
        this.lastTriggerAt = null;
        this.lastExecutionAt = null;
    }
}

export const globalWakeCoalescer = new WakeCoalescer(500);
