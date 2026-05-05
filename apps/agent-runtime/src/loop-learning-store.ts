/**
 * Autonomous Loop Learning Store
 *
 * Persistent memory of successful skill sequences.
 * Learns from patterns: "For input X, sequence [skill1 → skill2] succeeded 5 times with 90% success rate"
 */

import type { LearnedPattern } from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';

export class LoopLearningStore {
    private patterns = new Map<string, LearnedPattern>();

    /**
     * Find a learned pattern matching the input fingerprint.
     */
    findPattern(inputFingerprint: string): LearnedPattern | undefined {
        return this.patterns.get(inputFingerprint);
    }

    /**
     * Record a successful skill sequence for an input pattern.
     */
    recordSuccess(inputFingerprint: string, sequence: string[]): void {
        const pattern = this.patterns.get(inputFingerprint);

        if (pattern) {
            // Update existing pattern
            pattern.use_count++;
            pattern.last_used = Date.now();
            // Simple success rate: track cumulative successes
            pattern.success_rate = Math.min(1.0, pattern.success_rate + 0.1);
        } else {
            // Create new pattern
            this.patterns.set(inputFingerprint, {
                pattern_id: randomUUID(),
                input_fingerprint: inputFingerprint,
                successful_sequence: sequence,
                success_rate: 0.9,
                use_count: 1,
                last_used: Date.now(),
                created_at: Date.now(),
            });
        }
    }

    /**
     * Record a failed attempt, reducing pattern confidence.
     */
    recordFailure(inputFingerprint: string): void {
        const pattern = this.patterns.get(inputFingerprint);
        if (pattern) {
            pattern.success_rate = Math.max(0, pattern.success_rate - 0.1);
        }
    }

    /**
     * List all learned patterns.
     */
    listPatterns(): LearnedPattern[] {
        return Array.from(this.patterns.values());
    }

    /**
     * Clear patterns older than N days.
     */
    pruneOldPatterns(maxAgeDays = 30): number {
        const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
        let removed = 0;

        for (const [key, pattern] of this.patterns.entries()) {
            if (pattern.created_at < cutoff && pattern.use_count === 0) {
                this.patterns.delete(key);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Get top patterns by success rate.
     */
    getTopPatterns(limit = 10): LearnedPattern[] {
        return Array.from(this.patterns.values())
            .sort((a, b) => b.success_rate - a.success_rate || b.use_count - a.use_count)
            .slice(0, limit);
    }

    /**
     * Clear all patterns.
     */
    clearAll(): void {
        this.patterns.clear();
    }
}

export const globalLearningStore = new LoopLearningStore();
