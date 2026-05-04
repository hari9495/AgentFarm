import type { GoalAction, GoalPlan, GoalPlanStatus, GoalWorldState } from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';

// ── Internal A* types ─────────────────────────────────────────────────────────

interface AStarNode {
    state: GoalWorldState;
    actions: GoalAction[];
    gCost: number;
    hCost: number;
    fCost: number;
}

// ── Pure helper functions ─────────────────────────────────────────────────────

/** Stable string key for a world-state (for closed-set deduplication). */
function stateKey(s: GoalWorldState): string {
    return JSON.stringify(Object.entries(s).sort((a, b) => a[0].localeCompare(b[0])));
}

/** Heuristic: count of unsatisfied target conditions. */
function heuristic(current: GoalWorldState, target: GoalWorldState): number {
    let count = 0;
    for (const [k, v] of Object.entries(target)) {
        if (current[k] !== v) count++;
    }
    return count;
}

/** Returns true when all target conditions are satisfied in current state. */
function goalReached(current: GoalWorldState, target: GoalWorldState): boolean {
    return heuristic(current, target) === 0;
}

/** Returns true when all action preconditions are met in the given state. */
function preconditionsMet(action: GoalAction, state: GoalWorldState): boolean {
    for (const [k, v] of Object.entries(action.preconditions)) {
        if (state[k] !== v) return false;
    }
    return true;
}

/** Applies action effects on top of a state (immutable). */
function applyEffects(action: GoalAction, state: GoalWorldState): GoalWorldState {
    return { ...state, ...action.effects };
}

// ── Core planner ─────────────────────────────────────────────────────────────

export interface PlanResult {
    /** Ordered action sequence, or null if no plan exists. */
    actions: GoalAction[] | null;
    totalCost: number;
}

/**
 * A* GOAP planner.
 *
 * Finds the lowest-cost ordered sequence of actions that transforms
 * `currentState` into `targetState`.  Returns `null` when no plan is reachable
 * within `maxIterations`.
 *
 * Complexity is exponential in the worst case; keep action sets small (< 30)
 * for deterministic latency.
 */
export function planGoal(
    currentState: GoalWorldState,
    targetState: GoalWorldState,
    availableActions: GoalAction[],
    maxIterations = 1_000,
): PlanResult {
    if (goalReached(currentState, targetState)) {
        return { actions: [], totalCost: 0 };
    }

    const openSet: AStarNode[] = [];
    const closedStates = new Set<string>();

    openSet.push({
        state: currentState,
        actions: [],
        gCost: 0,
        hCost: heuristic(currentState, targetState),
        fCost: heuristic(currentState, targetState),
    });

    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;

        // Pick the open node with the lowest fCost.
        openSet.sort((a, b) => a.fCost - b.fCost);
        const current = openSet.shift()!;

        if (goalReached(current.state, targetState)) {
            return { actions: current.actions, totalCost: current.gCost };
        }

        const key = stateKey(current.state);
        if (closedStates.has(key)) continue;
        closedStates.add(key);

        for (const action of availableActions) {
            if (!preconditionsMet(action, current.state)) continue;

            const newState = applyEffects(action, current.state);
            const newKey = stateKey(newState);
            if (closedStates.has(newKey)) continue;

            const gCost = current.gCost + action.cost;
            const hCost = heuristic(newState, targetState);

            openSet.push({
                state: newState,
                actions: [...current.actions, action],
                gCost,
                hCost,
                fCost: gCost + hCost,
            });
        }
    }

    return { actions: null, totalCost: 0 };
}

// ── GoapPlanner class ─────────────────────────────────────────────────────────

export interface GoapPlannerOptions {
    tenantId: string;
    workspaceId: string;
    botId: string;
    availableActions: GoalAction[];
    maxIterations?: number;
}

/**
 * Stateful planner that manages a GoalPlan lifecycle including replanning on
 * action failure.
 */
export class GoapPlanner {
    private readonly tenantId: string;
    private readonly workspaceId: string;
    private readonly botId: string;
    private readonly availableActions: GoalAction[];
    private readonly maxIterations: number;

    constructor(opts: GoapPlannerOptions) {
        this.tenantId = opts.tenantId;
        this.workspaceId = opts.workspaceId;
        this.botId = opts.botId;
        this.availableActions = opts.availableActions;
        this.maxIterations = opts.maxIterations ?? 1_000;
    }

    /**
     * Creates a new GoalPlan by running the A* search from `currentState` toward
     * `targetState`.  Status is 'failed' when no plan exists.
     */
    createPlan(
        goalDescription: string,
        currentState: GoalWorldState,
        targetState: GoalWorldState,
    ): GoalPlan {
        const { actions, totalCost } = planGoal(
            currentState,
            targetState,
            this.availableActions,
            this.maxIterations,
        );

        const now = new Date().toISOString();
        const status: GoalPlanStatus = actions === null ? 'failed' : 'executing';

        return {
            id: randomUUID(),
            contractVersion: '1.0.0',
            tenantId: this.tenantId,
            workspaceId: this.workspaceId,
            botId: this.botId,
            goalDescription,
            currentState,
            targetState,
            actions: actions ?? [],
            totalCost,
            status,
            currentActionIndex: 0,
            replanCount: 0,
            correlationId: randomUUID(),
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Marks the current action as failed and replans from the new world state.
     * The `newCurrentState` should reflect any partial effects already applied.
     */
    replan(existingPlan: GoalPlan, newCurrentState: GoalWorldState): GoalPlan {
        const failedAction = existingPlan.actions[existingPlan.currentActionIndex];
        const { actions, totalCost } = planGoal(
            newCurrentState,
            existingPlan.targetState,
            this.availableActions,
            this.maxIterations,
        );

        const now = new Date().toISOString();
        const status: GoalPlanStatus = actions === null ? 'failed' : 'replanning';

        return {
            ...existingPlan,
            currentState: newCurrentState,
            actions: actions ?? [],
            totalCost,
            status,
            currentActionIndex: 0,
            replanCount: existingPlan.replanCount + 1,
            failedActionId: failedAction?.id,
            updatedAt: now,
        };
    }

    /**
     * Advances the plan to the next action.  Returns the updated plan with status
     * 'completed' when all actions have been executed.
     */
    advanceAction(plan: GoalPlan): GoalPlan {
        const next = plan.currentActionIndex + 1;
        const completed = next >= plan.actions.length;
        return {
            ...plan,
            currentActionIndex: next,
            status: completed ? 'completed' : 'executing',
            updatedAt: new Date().toISOString(),
        };
    }
}
