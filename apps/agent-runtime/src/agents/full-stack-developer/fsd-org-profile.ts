// ============================================================================
// FSD ORG PROFILE
// Organisation context: team ownership, tech mandates, frozen modules,
// vendor contracts, budget constraints.
//
// Injected into every LLM system prompt so the agent never touches a module
// owned by another team without flagging it, and respects org constraints.
//
// Pure functions — no side-effects.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamEntry {
    /** Canonical team name (e.g. "Team Payments"). */
    name:          string;
    /** GitHub usernames or email prefixes of team members. */
    members:       string[];
    /** File/directory globs this team owns (from CODEOWNERS or manual config). */
    owns:          string[];
    /** Paths currently being migrated — agent should not auto-edit these. */
    migrating:     string[];
    /** Slack channel for reaching the team. */
    slackChannel?: string;
    /** Jira/Linear project key. */
    projectKey?:   string;
}

export interface OrgProfile {
    /** Org or company name. */
    orgName:         string;
    teams:           TeamEntry[];
    /** Hard technology mandates, e.g. "no new PHP", "all storage in AWS". */
    techMandates:    string[];
    /** Modules/paths that are completely frozen — no edits without explicit approval. */
    frozenPaths:     string[];
    /** Vendor contracts and lock-in context, e.g. "Datadog enterprise until 2026". */
    vendorContracts: string[];
    /** Monthly cloud spend cap or other budget constraints. */
    budgetNote:      string;
    /** Free-form notes about org culture / political context. */
    politicalNotes:  string[];
    lastSyncedAt:    string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createEmptyOrgProfile(orgName = 'My Organisation'): OrgProfile {
    return {
        orgName,
        teams:           [],
        techMandates:    [],
        frozenPaths:     [],
        vendorContracts: [],
        budgetNote:      '',
        politicalNotes:  [],
        lastSyncedAt:    new Date().toISOString(),
    };
}

/**
 * Given a file path, returns the team that owns it (CODEOWNERS-style glob match).
 * Pure function — uses simple prefix/suffix matching, not full glob.
 */
export function findOwningTeam(filePath: string, profile: OrgProfile): TeamEntry | null {
    for (const team of profile.teams) {
        for (const pattern of team.owns) {
            const p = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
            if (filePath.includes(p.replace(/^\//, ''))) return team;
        }
    }
    return null;
}

/**
 * Returns true if a path is in a team's migrating list — agent should not auto-edit.
 */
export function isPathMigrating(filePath: string, profile: OrgProfile): boolean {
    for (const team of profile.teams) {
        for (const path of team.migrating) {
            if (filePath.includes(path.replace(/^\//, ''))) return true;
        }
    }
    return false;
}

/**
 * Returns true if a path is in the globally frozen list.
 */
export function isPathFrozen(filePath: string, profile: OrgProfile): boolean {
    return profile.frozenPaths.some((p) => filePath.includes(p.replace(/^\//, '')));
}

// ---------------------------------------------------------------------------
// LLM format helper
// ---------------------------------------------------------------------------

/**
 * Renders OrgProfile as a compact block injected into LLM system prompts.
 * Pure function.
 */
export function formatOrgProfileForLlm(profile: OrgProfile): string {
    if (!profile.orgName && profile.teams.length === 0) return '';

    const lines: string[] = ['[ORG CONTEXT]'];
    lines.push(`Org: ${profile.orgName}`);

    if (profile.teams.length > 0) {
        lines.push('Teams & ownership:');
        for (const team of profile.teams) {
            const owns = team.owns.slice(0, 4).join(', ');
            const migr = team.migrating.length > 0 ? ` | MIGRATING: ${team.migrating.slice(0,2).join(', ')}` : '';
            lines.push(`  • ${team.name}: owns [${owns}]${migr}`);
        }
    }

    if (profile.frozenPaths.length > 0)
        lines.push(`Frozen (do not edit without approval): ${profile.frozenPaths.join(', ')}`);

    if (profile.techMandates.length > 0)
        lines.push(`Tech mandates: ${profile.techMandates.join(' | ')}`);

    if (profile.vendorContracts.length > 0)
        lines.push(`Vendor lock-in: ${profile.vendorContracts.join(' | ')}`);

    if (profile.budgetNote)
        lines.push(`Budget: ${profile.budgetNote}`);

    if (profile.politicalNotes.length > 0)
        lines.push(`Notes: ${profile.politicalNotes.slice(0, 3).join(' | ')}`);

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// LLM prompt builders
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt to synthesise an OrgProfile from raw org data.
 * Pure function.
 */
export function buildOrgContextSyncPrompt(params: {
    codeownersContent: string;
    githubTeams:       string;
    jiraProjects:      string;
    linearTeams:       string;
    existingProfile?:  OrgProfile;
}): string {
    return [
        `You are a senior engineering manager building an org context profile from raw data.`,
        ``,
        `CODEOWNERS file:`,
        '```',
        params.codeownersContent.slice(0, 3000),
        '```',
        ``,
        `GitHub teams:`,
        params.githubTeams.slice(0, 1000),
        ``,
        `Jira / Linear projects:`,
        params.jiraProjects.slice(0, 1000),
        params.linearTeams.slice(0, 500),
        ``,
        ...(params.existingProfile ? [
            `Existing org profile (update, don't replace):`,
            JSON.stringify(params.existingProfile, null, 2).slice(0, 1000),
        ] : []),
        ``,
        `Synthesise an OrgProfile. Return a JSON object with:`,
        `  orgName         — string`,
        `  teams           — array of { name, members: string[], owns: string[], migrating: string[], slackChannel?, projectKey? }`,
        `  techMandates    — string[] (infer from CODEOWNERS comments or project descriptions)`,
        `  frozenPaths     — string[] (paths marked DO NOT TOUCH or similar)`,
        `  vendorContracts — string[] (any vendor/tool references)`,
        `  budgetNote      — string (empty if unknown)`,
        `  politicalNotes  — string[] (infer cautiously — only from explicit comments)`,
        ``,
        `No markdown fences, no prose — only the JSON object.`,
    ].join('\n');
}

/**
 * Parses LLM output into OrgProfile. Falls back to empty profile on error.
 * Pure function.
 */
export function parseOrgProfileFromLlm(raw: string, orgName: string): OrgProfile {
    const fallback = createEmptyOrgProfile(orgName);
    const cleaned  = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start    = cleaned.indexOf('{');
    const end      = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return fallback;
    try {
        const p = JSON.parse(cleaned.slice(start, end + 1)) as Partial<OrgProfile>;
        return {
            orgName:         typeof p.orgName         === 'string'  ? p.orgName         : orgName,
            teams:           Array.isArray(p.teams)                  ? p.teams as TeamEntry[] : [],
            techMandates:    Array.isArray(p.techMandates)           ? p.techMandates as string[] : [],
            frozenPaths:     Array.isArray(p.frozenPaths)            ? p.frozenPaths as string[]  : [],
            vendorContracts: Array.isArray(p.vendorContracts)        ? p.vendorContracts as string[] : [],
            budgetNote:      typeof p.budgetNote      === 'string'   ? p.budgetNote      : '',
            politicalNotes:  Array.isArray(p.politicalNotes)         ? p.politicalNotes as string[] : [],
            lastSyncedAt:    new Date().toISOString(),
        };
    } catch { return fallback; }
}
