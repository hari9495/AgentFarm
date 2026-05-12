// ── SDK error types ───────────────────────────────────────────────────────────

export class AgentFarmError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number | null,
        public readonly errorCode: string | null,
    ) {
        super(message);
        this.name = 'AgentFarmError';
    }
}

export class AgentFarmAuthError extends AgentFarmError {
    constructor(message: string) {
        super(message, 401, 'unauthorized');
        this.name = 'AgentFarmAuthError';
    }
}

export class AgentFarmNotFoundError extends AgentFarmError {
    constructor(message: string) {
        super(message, 404, 'not_found');
        this.name = 'AgentFarmNotFoundError';
    }
}
