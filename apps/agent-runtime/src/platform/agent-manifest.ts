/**
 * Agent Manifest — Platform Level
 *
 * Generic types for describing what an agent can do, which capabilities require
 * connectors, and what a customer sees when purchasing or onboarding an agent.
 *
 * Design principles:
 *   - `visibility` controls what appears on the purchase/pricing page.
 *   - `tier` controls which plan level is required.
 *   - Connector requirements are expressed as categories (from connector-registry.ts),
 *     not as specific tool names — customers pick their tool from within the category.
 *   - All agents (recruiter, sales, content, developer …) implement this interface.
 *
 * Pure data + helpers — no external calls.
 */

import type { ConnectorCategory, ConnectorCategoryDefinition } from './connector-registry.js';
import { filterCategories } from './connector-registry.js';

// ---------------------------------------------------------------------------
// Capability tier
// ---------------------------------------------------------------------------

/**
 * Determines whether a capability requires a connector and which plan level
 * it belongs to.
 *
 * core               — works out of the box, no connector needed
 * connector_enhanced — works standalone; significantly better with a connector
 * connector_required — cannot function without at least one connector in a category
 * premium            — requires a premium plan tier (gated in billing)
 * add_on             — optional purchasable module
 */
export type CapabilityTier =
    | 'core'
    | 'connector_enhanced'
    | 'connector_required'
    | 'premium'
    | 'add_on';

// ---------------------------------------------------------------------------
// Capability visibility
// ---------------------------------------------------------------------------

/**
 * Controls what appears on the purchase page and onboarding checklist.
 *
 * visible — shown on the purchase page, feature list, and onboarding
 * hidden  — infrastructure / internal plumbing, not shown to customers
 */
export type CapabilityVisibility = 'visible' | 'hidden';

// ---------------------------------------------------------------------------
// Agent capability
// ---------------------------------------------------------------------------

export interface AgentCapability {
    /** Unique identifier for this capability (kebab-case, stable across versions). */
    id: string;
    /** Maps to the corresponding LocalWorkspaceActionType (e.g. 'workspace_rec_source_candidates'). */
    actionId: string;
    /** Customer-facing capability name shown on the purchase page. */
    name: string;
    /** Plain-English description of what this capability does. */
    description: string;
    /** Determines plan gating and whether a connector is required. */
    tier: CapabilityTier;
    /** Whether to show this capability to customers. */
    visibility: CapabilityVisibility;
    /**
     * Connector categories the agent MUST have to use this capability.
     * At least one provider per listed category must be configured.
     * Empty / undefined = no connector needed.
     */
    requiredConnectorCategories?: ConnectorCategory[];
    /**
     * Connector categories that improve this capability but are not required.
     * Agent will operate in a degraded / heuristic mode without them.
     */
    optionalConnectorCategories?: ConnectorCategory[];
    /** Icon hint for the UI (resolves to a component or asset by name). */
    icon?: string;
    /** Short illustrative example shown on the purchase or onboarding page. */
    exampleUseCase?: string;
}

// ---------------------------------------------------------------------------
// Agent manifest
// ---------------------------------------------------------------------------

export interface AgentManifest {
    /** Stable agent identifier (e.g. 'recruiter', 'sales_agent', 'content_writer'). */
    agentId: string;
    /** Customer-facing display name. */
    agentName: string;
    /** Manifest schema version (semver). */
    version: string;
    /** One-line pitch for the purchase page headline. */
    tagline: string;
    /** Paragraph description shown on the purchase page. */
    description: string;
    /** Full capability list, including hidden infrastructure capabilities. */
    capabilities: AgentCapability[];
    /**
     * Union of all connector categories that are REQUIRED across capabilities.
     * Derived automatically by buildManifest().
     */
    allRequiredConnectorCategories: ConnectorCategory[];
    /**
     * Union of all OPTIONAL connector categories (excluding required ones).
     * Derived automatically by buildManifest().
     */
    allOptionalConnectorCategories: ConnectorCategory[];
}

// ---------------------------------------------------------------------------
// Purchase view — what the customer sees when buying the agent
// ---------------------------------------------------------------------------

export interface PurchaseView {
    agentId: string;
    agentName: string;
    tagline: string;
    description: string;
    /** Capabilities that work immediately with no setup. */
    coreCapabilities: AgentCapability[];
    /** Capabilities that work standalone but improve with a connector. */
    connectorEnhancedCapabilities: AgentCapability[];
    /** Capabilities that require at least one connector to function. */
    connectorRequiredCapabilities: AgentCapability[];
    /** Category definitions for connectors that are required. */
    requiredConnectors: ConnectorCategoryDefinition[];
    /** Category definitions for connectors that are optional. */
    optionalConnectors: ConnectorCategoryDefinition[];
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardingStep {
    /** Unique step identifier. */
    stepId: string;
    /** Step title shown in the UI. */
    title: string;
    /** Explanation of why this step matters. */
    description: string;
    /** Determines which panel in the dashboard handles this step. */
    type: 'connector_setup' | 'document_upload' | 'data_collection' | 'human_review';
    /** If false the customer can skip this step. */
    required: boolean;
    /** Present when type is 'connector_setup' — which category to configure. */
    connectorCategory?: ConnectorCategory;
    /** Present when type is 'document_upload' — expected document type keys. */
    documentTypes?: string[];
    /** Present when type is 'data_collection' — topic identifier. */
    dataCollectionTopic?: string;
}

export interface OnboardingChecklist {
    agentId: string;
    totalSteps: number;
    requiredSteps: OnboardingStep[];
    optionalSteps: OnboardingStep[];
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Build the customer-facing purchase view from a manifest.
 * Filters out hidden capabilities and resolves connector category definitions.
 */
export function buildPurchaseView(manifest: AgentManifest): PurchaseView {
    const visible = manifest.capabilities.filter(c => c.visibility === 'visible');
    return {
        agentId: manifest.agentId,
        agentName: manifest.agentName,
        tagline: manifest.tagline,
        description: manifest.description,
        coreCapabilities: visible.filter(c => c.tier === 'core'),
        connectorEnhancedCapabilities: visible.filter(c => c.tier === 'connector_enhanced'),
        connectorRequiredCapabilities: visible.filter(c => c.tier === 'connector_required'),
        requiredConnectors: filterCategories(manifest.allRequiredConnectorCategories),
        optionalConnectors: filterCategories(manifest.allOptionalConnectorCategories),
    };
}

/**
 * Build the onboarding checklist from a manifest.
 * Generates a connector setup step per category, then appends any extra steps
 * (e.g. document uploads or data-collection forms) passed by the caller.
 */
export function buildOnboardingChecklist(
    manifest: AgentManifest,
    extraSteps?: OnboardingStep[],
): OnboardingChecklist {
    const connectorSteps: OnboardingStep[] = [
        ...manifest.allRequiredConnectorCategories.map((cat): OnboardingStep => ({
            stepId: `connector_${cat}`,
            title: `Connect your ${humaniseCategory(cat)} tool`,
            description: `Set up a ${humaniseCategory(cat)} integration to enable the related capabilities.`,
            type: 'connector_setup',
            required: true,
            connectorCategory: cat,
        })),
        ...manifest.allOptionalConnectorCategories.map((cat): OnboardingStep => ({
            stepId: `connector_${cat}_optional`,
            title: `(Optional) Connect a ${humaniseCategory(cat)} tool`,
            description: `Connecting a ${humaniseCategory(cat)} tool enhances what the agent can do.`,
            type: 'connector_setup',
            required: false,
            connectorCategory: cat,
        })),
    ];

    const all = [...connectorSteps, ...(extraSteps ?? [])];
    return {
        agentId: manifest.agentId,
        totalSteps: all.length,
        requiredSteps: all.filter(s => s.required),
        optionalSteps: all.filter(s => !s.required),
    };
}

/**
 * Derive the union of all required connector categories from a capability list.
 * Preserves order of first appearance.
 */
export function deriveRequiredCategories(capabilities: AgentCapability[]): ConnectorCategory[] {
    const seen = new Set<ConnectorCategory>();
    for (const cap of capabilities) {
        for (const cat of (cap.requiredConnectorCategories ?? [])) {
            seen.add(cat);
        }
    }
    return Array.from(seen);
}

/**
 * Derive the union of all optional connector categories, excluding any that are
 * already required (to prevent duplication in onboarding).
 */
export function deriveOptionalCategories(
    capabilities: AgentCapability[],
    requiredCategories: ConnectorCategory[],
): ConnectorCategory[] {
    const seen = new Set<ConnectorCategory>();
    const required = new Set(requiredCategories);
    for (const cap of capabilities) {
        for (const cat of (cap.optionalConnectorCategories ?? [])) {
            if (!required.has(cat)) seen.add(cat);
        }
    }
    return Array.from(seen);
}

/**
 * Build a complete AgentManifest with automatically derived connector category lists.
 * Use this instead of constructing AgentManifest directly.
 */
export function buildManifest(
    base: Omit<AgentManifest, 'allRequiredConnectorCategories' | 'allOptionalConnectorCategories'>,
): AgentManifest {
    const required = deriveRequiredCategories(base.capabilities);
    return {
        ...base,
        allRequiredConnectorCategories: required,
        allOptionalConnectorCategories: deriveOptionalCategories(base.capabilities, required),
    };
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function humaniseCategory(cat: ConnectorCategory): string {
    return cat.replace(/_/g, ' ');
}
