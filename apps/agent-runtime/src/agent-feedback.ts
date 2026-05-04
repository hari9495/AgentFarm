import { randomUUID } from 'crypto';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export type FeedbackRecord = {
    id: string;
    task_id: string;
    skill_id: string;
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    submitted_at: string;
    workspace_id?: string;
};

export type SkillRatingSummary = {
    skill_id: string;
    average_rating: number;
    count: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type FeedbackSubmitInput = {
    task_id: string;
    skill_id: string;
    rating: number;
    comment?: string;
    workspace_id?: string;
};

export class AgentFeedback {
    private readonly records: FeedbackRecord[] = [];
    private readonly storageDir: string;

    constructor(storageDir?: string) {
        this.storageDir = storageDir ?? join(tmpdir(), 'agentfarm-feedback');
    }

    submitFeedback(input: FeedbackSubmitInput): FeedbackRecord {
        const rating = Math.max(1, Math.min(5, Math.round(input.rating))) as 1 | 2 | 3 | 4 | 5;
        const record: FeedbackRecord = {
            id: randomUUID(),
            task_id: input.task_id,
            skill_id: input.skill_id,
            rating,
            comment: input.comment,
            submitted_at: new Date().toISOString(),
            workspace_id: input.workspace_id,
        };
        this.records.push(record);
        void this.persist();
        return record;
    }

    getFeedback(taskId: string): FeedbackRecord[] {
        return this.records.filter((r) => r.task_id === taskId);
    }

    getFeedbackById(id: string): FeedbackRecord | undefined {
        return this.records.find((r) => r.id === id);
    }

    getSkillRating(skillId: string): SkillRatingSummary {
        const matching = this.records.filter((r) => r.skill_id === skillId);
        const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let sum = 0;
        for (const r of matching) {
            distribution[r.rating]++;
            sum += r.rating;
        }
        return {
            skill_id: skillId,
            average_rating: matching.length > 0 ? sum / matching.length : 0,
            count: matching.length,
            distribution,
        };
    }

    getAllSkillRatings(): SkillRatingSummary[] {
        const skillIds = Array.from(new Set(this.records.map((r) => r.skill_id)));
        return skillIds.map((id) => this.getSkillRating(id));
    }

    listAll(limit = 100): FeedbackRecord[] {
        return this.records.slice(-limit).reverse();
    }

    listByWorkspace(workspaceId: string): FeedbackRecord[] {
        return this.records.filter((r) => r.workspace_id === workspaceId);
    }

    private async persist(): Promise<void> {
        try {
            await mkdir(this.storageDir, { recursive: true });
            const file = join(this.storageDir, 'feedback.json');
            await writeFile(file, JSON.stringify(this.records, null, 2), 'utf8');
        } catch {
            // persistence failure is non-fatal
        }
    }

    async load(): Promise<void> {
        try {
            const file = join(this.storageDir, 'feedback.json');
            const raw = await readFile(file, 'utf8');
            const arr = JSON.parse(raw) as FeedbackRecord[];
            this.records.length = 0;
            this.records.push(...arr);
        } catch {
            // no persisted state yet
        }
    }

    // Used in tests
    _reset(): void {
        this.records.length = 0;
    }
}

export const globalFeedback = new AgentFeedback();
