/**
 * Skill Pipeline Composition Types
 *
 * DAG-based skill chaining with conditional branching, error handling, and output mapping.
 */

export type PipelineNodeType = 'skill' | 'condition' | 'merge' | 'terminal';

export type EdgeCondition = {
    type: 'success' | 'failure' | 'output_matches' | 'always';
    pattern?: string | RegExp;
    description?: string;
};

export type CompositionNode = {
    id: string;
    type: PipelineNodeType;
    skill_id?: string;
    inputs?: Record<string, unknown>;
    condition?: EdgeCondition;
    allow_failure?: boolean;
    retry_count?: number;
    output_mapping?: Record<string, string>;
};

export type CompositionEdge = {
    from: string;
    to: string;
    condition: EdgeCondition;
    data_mapping?: Record<string, string>;
};

export type SkillCompositionDAG = {
    composition_id: string;
    name: string;
    description?: string;
    nodes: CompositionNode[];
    edges: CompositionEdge[];
    entry_node_id: string;
    exit_nodes: string[];
    version: number;
};

export type CompositionRunRecord = {
    run_id: string;
    composition_id: string;
    state: 'running' | 'completed' | 'failed' | 'cancelled';
    current_node_id: string;
    node_results: Map<string, Record<string, unknown>>;
    started_at: number;
    completed_at?: number;
    duration_ms?: number;
    error?: string;
};

export type CompositionExecutionResult = {
    run_id: string;
    composition_id: string;
    success: boolean;
    node_outputs: Record<string, Record<string, unknown>>;
    final_output: Record<string, unknown>;
    duration_ms: number;
    path_taken: string[];
    failure_at?: string;
};
