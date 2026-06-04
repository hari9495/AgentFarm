/**
 * MeetingConnectorRouter — auto-selects the best join adapter for a meeting URL.
 *
 * Selection priority per detected platform:
 *
 *   teams   → TeamsJoinAdapter (Graph API)  if TEAMS_* env vars set
 *             else BrowserJoinAdapter (fallback)
 *
 *   zoom    → ZoomJoinAdapter (Zoom SDK)    if ZOOM_* env vars set
 *             else SipJoinAdapter (SIP)      if FREESWITCH_* env vars set
 *             else BrowserJoinAdapter (fallback)
 *
 *   meet    → SipJoinAdapter (SIP dial-in)  if FREESWITCH_* env vars set
 *             else BrowserJoinAdapter (fallback)
 *             (Google Meet has no reliable bot SDK)
 *
 *   webex   → SipJoinAdapter (SIP)          if FREESWITCH_* env vars set
 *             else BrowserJoinAdapter (fallback)
 *
 *   unknown → BrowserJoinAdapter (always available)
 *
 * The router also exposes `detectPlatform()` as a standalone utility so
 * other parts of the codebase can identify the platform without creating
 * adapter instances.
 */

import type { MeetingJoinAdapter } from './adapters/meeting-join-adapter.js';
import { BrowserJoinAdapter } from './adapters/browser-join-adapter.js';
import { TeamsJoinAdapter, createTeamsAdapterFromEnv } from './adapters/teams-join-adapter.js';
import { ZoomJoinAdapter, createZoomAdapterFromEnv } from './adapters/zoom-join-adapter.js';
import { SipJoinAdapter, createSipAdapterFromEnv } from './adapters/sip-join-adapter.js';
import type { MeetingPlatform } from '@agentfarm/shared-types';

export type { MeetingPlatform };

// Re-export adapters so callers only need to import from this module.
export { BrowserJoinAdapter, TeamsJoinAdapter, ZoomJoinAdapter, SipJoinAdapter };

// ── Platform detection ────────────────────────────────────────────────────────

const PLATFORM_PATTERNS: Array<{ pattern: RegExp; platform: MeetingPlatform }> = [
    { pattern: /^https:\/\/meet\.google\.com\//u, platform: 'meet' },
    { pattern: /^https:\/\/teams\.microsoft\.com\//u, platform: 'teams' },
    { pattern: /^https:\/\/teams\.live\.com\//u, platform: 'teams' },
    { pattern: /^https?:\/\/([a-z0-9-]+\.)?zoom\.us\//u, platform: 'zoom' },
    { pattern: /^https?:\/\/([a-z0-9-]+\.)?webex\.com\//u, platform: 'webex' },
];

/**
 * Detects the meeting platform from a URL.
 * Returns `null` for unrecognised URLs (triggers browser fallback).
 */
export function detectPlatform(meetingUrl: string): MeetingPlatform | null {
    for (const { pattern, platform } of PLATFORM_PATTERNS) {
        if (pattern.test(meetingUrl)) return platform;
    }
    return null;
}

// ── Router ────────────────────────────────────────────────────────────────────

export interface MeetingConnectorRouterOptions {
    /** Required for the browser fallback path. */
    desktopAgentUrl?: string | null;
    /** Override the Teams adapter (useful in tests). */
    teamsAdapter?: TeamsJoinAdapter | null;
    /** Override the Zoom adapter (useful in tests). */
    zoomAdapter?: ZoomJoinAdapter | null;
    /** Override the SIP adapter (useful in tests). */
    sipAdapter?: SipJoinAdapter | null;
    /** Override the browser adapter (useful in tests). */
    browserAdapter?: BrowserJoinAdapter | null;
}

export class MeetingConnectorRouter {
    private readonly teams: TeamsJoinAdapter | null;
    private readonly zoom: ZoomJoinAdapter | null;
    private readonly sip: SipJoinAdapter | null;
    private readonly browser: BrowserJoinAdapter | null;

    constructor(options: MeetingConnectorRouterOptions = {}) {
        // Use injected adapters if provided; otherwise build from env vars.
        this.teams = 'teamsAdapter' in options ? (options.teamsAdapter ?? null) : createTeamsAdapterFromEnv();
        this.zoom = 'zoomAdapter' in options ? (options.zoomAdapter ?? null) : createZoomAdapterFromEnv();
        this.sip = 'sipAdapter' in options ? (options.sipAdapter ?? null) : createSipAdapterFromEnv();
        this.browser = options.browserAdapter ??
            (options.desktopAgentUrl
                ? new BrowserJoinAdapter({ desktopAgentUrl: options.desktopAgentUrl })
                : null);
    }

    /**
     * Returns the best available adapter for `meetingUrl`.
     * Never throws — always returns an adapter (may be browser fallback).
     * Returns `null` only when no adapters at all are configured.
     */
    resolve(meetingUrl: string): { adapter: MeetingJoinAdapter; platform: MeetingPlatform | null } | null {
        const platform = detectPlatform(meetingUrl);
        const adapter = this.selectAdapter(platform);
        if (!adapter) return null;
        return { adapter, platform };
    }

    /**
     * Returns the best adapter for an already-identified platform.
     * Used by the screen-share routes which know the platform from the session
     * record without needing to re-parse a URL.
     */
    resolveByPlatform(platform: MeetingPlatform | null): MeetingJoinAdapter | null {
        return this.selectAdapter(platform);
    }

    /** Which adapter would be selected for a given platform (for diagnostics). */
    explain(meetingUrl: string): string {
        const platform = detectPlatform(meetingUrl);
        const adapter = this.selectAdapter(platform);
        if (!adapter) return 'no adapters configured';
        const name = adapter.constructor.name;
        return `platform=${platform ?? 'unknown'} → ${name}`;
    }

    private selectAdapter(platform: MeetingPlatform | null): MeetingJoinAdapter | null {
        switch (platform) {
            case 'teams':
                return this.teams ?? this.browser;
            case 'zoom':
                return this.zoom ?? this.sip ?? this.browser;
            case 'meet':
            case 'webex':
                return this.sip ?? this.browser;
            default:
                // Unknown platform — browser is the universal fallback.
                return this.browser;
        }
    }
}

/** Singleton factory — builds router from env vars. */
export function createConnectorRouterFromEnv(desktopAgentUrl: string | null): MeetingConnectorRouter {
    return new MeetingConnectorRouter({ desktopAgentUrl });
}
