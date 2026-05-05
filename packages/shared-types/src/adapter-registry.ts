/**
 * Adapter Registry Types
 *
 * First-class registry for runtimes, connectors, and extensible adapters with capability advertisement.
 */

export type AdapterType = 'connector' | 'runtime' | 'custom';

export type AdapterCapability = {
    name: string;
    description: string;
    parameters: Record<string, { type: string; required: boolean; description: string }>;
    required_permissions?: string[];
};

export type AdapterManifest = {
    adapter_id: string;
    type: AdapterType;
    name: string;
    version: string;
    description: string;
    author?: string;
    capabilities: Record<string, AdapterCapability>;
    permissions_required?: string[];
    health_check_interval_ms?: number;
    timeout_ms?: number;
    tags?: string[];
};

export type AdapterStatus = 'registered' | 'healthy' | 'degraded' | 'unhealthy' | 'deregistered';

export type AdapterInstance = {
    adapter_id: string;
    manifest: AdapterManifest;
    status: AdapterStatus;
    registered_at: number;
    last_health_check?: number;
    consecutive_failures?: number;
    error_message?: string;
    metadata?: Record<string, unknown>;
};

export type CapabilityDiscoveryResult = {
    adapter_id: string;
    name: string;
    capabilities: AdapterCapability[];
    status: AdapterStatus;
    health_score?: number;
};

export type AdapterHealthCheckResult = {
    adapter_id: string;
    status: AdapterStatus;
    latency_ms: number;
    message?: string;
    checked_at: number;
};
