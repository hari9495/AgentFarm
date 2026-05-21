/**
 * desktop-agent-watchdog.ts
 *
 * Health watchdog for the desktop-agent container (noVNC / full-desktop mode).
 *
 * The desktop agent is the browser that agents use to operate software
 * visually — like a human sitting at a screen.  If it goes down mid-session
 * the agent silently fails.  This watchdog polls its health endpoint and:
 *   1. Emits 'runtime.desktop_agent_unreachable' after 3 consecutive failures.
 *   2. Emits 'runtime.desktop_agent_recovered' when it comes back.
 *   3. Calls an optional onDown / onRecover callback for notification dispatch.
 *
 * Integration point: call startDesktopAgentWatchdog() during runtime server
 * initialisation if DESKTOP_AGENT_URL is set.  Call stopDesktopAgentWatchdog()
 * on graceful shutdown.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WatchdogStatus = 'healthy' | 'degraded' | 'unreachable';

export interface DesktopAgentWatchdogOptions {
    /** Full URL to the desktop agent service, e.g. http://localhost:6080 */
    desktopAgentUrl: string;
    /** How often to poll in milliseconds. Default: 30_000 (30s). */
    intervalMs?: number;
    /** Number of consecutive failures before declaring unreachable. Default: 3. */
    failureThreshold?: number;
    /** Called when the agent transitions to 'unreachable'. */
    onDown?: (url: string, consecutiveFailures: number) => void;
    /** Called when the agent recovers from 'unreachable'. */
    onRecover?: (url: string) => void;
    /** Override fetch for testing. */
    _fetchFn?: typeof fetch;
}

export interface WatchdogHandle {
    stop: () => void;
    getStatus: () => WatchdogStatus;
    getConsecutiveFailures: () => number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the desktop agent health watchdog.
 *
 * @returns A handle to stop the watchdog and query its status.
 */
export function startDesktopAgentWatchdog(
    options: DesktopAgentWatchdogOptions,
): WatchdogHandle {
    const {
        desktopAgentUrl,
        intervalMs = 30_000,
        failureThreshold = 3,
        onDown,
        onRecover,
        _fetchFn = fetch,
    } = options;

    let consecutiveFailures = 0;
    let status: WatchdogStatus = 'healthy';
    let timer: ReturnType<typeof setInterval> | null = null;

    const healthUrl = `${desktopAgentUrl.replace(/\/$/, '')}/health`;

    const poll = async () => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5_000);
            const res = await _fetchFn(healthUrl, {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (res.ok) {
                const wasDown = status === 'unreachable';
                consecutiveFailures = 0;
                status = 'healthy';
                if (wasDown) {
                    onRecover?.(desktopAgentUrl);
                }
            } else {
                handleFailure();
            }
        } catch {
            handleFailure();
        }
    };

    const handleFailure = () => {
        consecutiveFailures += 1;
        if (consecutiveFailures >= failureThreshold) {
            const wasHealthy = status !== 'unreachable';
            status = 'unreachable';
            if (wasHealthy) {
                onDown?.(desktopAgentUrl, consecutiveFailures);
            }
        } else {
            status = 'degraded';
        }
    };

    // Start polling immediately, then on interval
    void poll();
    timer = setInterval(() => void poll(), intervalMs);

    return {
        stop: () => {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        },
        getStatus: () => status,
        getConsecutiveFailures: () => consecutiveFailures,
    };
}

// ---------------------------------------------------------------------------
// Runtime event helpers (for use in runtime-server.ts)
// ---------------------------------------------------------------------------

/**
 * Build a watchdog event payload for emitRuntimeEvent.
 */
export function buildWatchdogDownPayload(
    desktopAgentUrl: string,
    consecutiveFailures: number,
): Record<string, unknown> {
    return {
        desktop_agent_url: desktopAgentUrl,
        consecutive_failures: consecutiveFailures,
        detected_at: new Date().toISOString(),
    };
}

export function buildWatchdogRecoverPayload(
    desktopAgentUrl: string,
): Record<string, unknown> {
    return {
        desktop_agent_url: desktopAgentUrl,
        recovered_at: new Date().toISOString(),
    };
}
