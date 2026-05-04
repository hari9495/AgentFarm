import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';

export type SkillEntitlementRecord = {
    workspace_id: string;
    bot_id: string;
    skill_ids: string[];
    updated_at: string;
};

type SkillEntitlementState = {
    version: 1;
    entitlements: SkillEntitlementRecord[];
};

const DEFAULT_ENTITLEMENTS_DIR = join(tmpdir(), 'agentfarm-dashboard-state');

const getEntitlementsPath = (): string => {
    const configured = process.env['AF_DASHBOARD_STATE_DIR'] ?? process.env['AGENTFARM_DASHBOARD_STATE_DIR'];
    const stateDir = resolve(configured?.trim() || DEFAULT_ENTITLEMENTS_DIR);
    return join(stateDir, 'marketplace-entitlements.json');
};

const normalizeSkillIds = (skillIds: string[]): string[] => {
    return Array.from(new Set(skillIds.map((entry) => entry.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
};

const readState = (): SkillEntitlementState => {
    const statePath = getEntitlementsPath();
    if (!existsSync(statePath)) {
        return { version: 1, entitlements: [] };
    }

    try {
        const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<SkillEntitlementState>;
        const entitlements = Array.isArray(parsed.entitlements) ? parsed.entitlements : [];
        return {
            version: 1,
            entitlements: entitlements
                .filter((entry) => entry && typeof entry === 'object')
                .map((entry) => ({
                    workspace_id: typeof entry.workspace_id === 'string' ? entry.workspace_id.trim() : '',
                    bot_id: typeof entry.bot_id === 'string' ? entry.bot_id.trim() : '',
                    skill_ids: Array.isArray(entry.skill_ids)
                        ? normalizeSkillIds(entry.skill_ids.filter((skillId): skillId is string => typeof skillId === 'string'))
                        : [],
                    updated_at: typeof entry.updated_at === 'string' ? entry.updated_at : new Date(0).toISOString(),
                }))
                .filter((entry) => entry.workspace_id.length > 0 && entry.bot_id.length > 0),
        };
    } catch {
        return { version: 1, entitlements: [] };
    }
};

const writeState = (state: SkillEntitlementState): void => {
    const statePath = getEntitlementsPath();
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2));
};

export const listSkillEntitlements = (): SkillEntitlementRecord[] => {
    return readState().entitlements;
};

export const getSkillEntitlements = (workspaceId: string, botId: string): SkillEntitlementRecord => {
    const workspaceKey = workspaceId.trim();
    const botKey = botId.trim();
    const state = readState();
    const existing = state.entitlements.find((entry) => entry.workspace_id === workspaceKey && entry.bot_id === botKey);
    if (existing) {
        return existing;
    }

    return {
        workspace_id: workspaceKey,
        bot_id: botKey,
        skill_ids: [],
        updated_at: new Date(0).toISOString(),
    };
};

export const upsertSkillEntitlements = (workspaceId: string, botId: string, skillIds: string[]): SkillEntitlementRecord => {
    const workspaceKey = workspaceId.trim();
    const botKey = botId.trim();
    const normalized = normalizeSkillIds(skillIds);

    const state = readState();
    const nextRecord: SkillEntitlementRecord = {
        workspace_id: workspaceKey,
        bot_id: botKey,
        skill_ids: normalized,
        updated_at: new Date().toISOString(),
    };

    const existingIndex = state.entitlements.findIndex((entry) => entry.workspace_id === workspaceKey && entry.bot_id === botKey);
    if (existingIndex >= 0) {
        state.entitlements[existingIndex] = nextRecord;
    } else {
        state.entitlements.push(nextRecord);
    }

    writeState({
        version: 1,
        entitlements: state.entitlements,
    });

    return nextRecord;
};
