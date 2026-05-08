export type ActionStep = {
    action: string;
    params: Record<string, string>;
    description: string;
    depends_on?: number[];
};

export type ActionPlan = {
    goal: string;
    steps: ActionStep[];
    estimated_steps: number;
};

export type StepResult = {
    step_index: number;
    action: string;
    success: boolean;
    output?: string;
    error?: string;
    duration_ms: number;
};

export type TaskRunResult = {
    success: boolean;
    steps_taken: number;
    final_results: StepResult[];
    replans_used: number;
    goal: string;
};
