"use client";

import { useCallback } from "react";
import { track as trackAnalytics } from "@vercel/analytics";

export type FunnelEvent =
    | { type: "filter_change"; dept: string; plan: string; sort: string; available: boolean }
    | { type: "search_query"; query: string; results: number }
    | { type: "bot_quick_start_click"; slug: string; name: string }
    | { type: "bot_peek_toggle"; slug: string; name: string; open: boolean }
    | { type: "view_team_click"; count: number }
    | { type: "mobile_sticky_cta_click"; sourcePath: string }
    | { type: "checkout_started"; count: number; total: number };

function emitEvent(event: FunnelEvent) {
    if (typeof window === "undefined") return;

    const { type, ...payload } = event;

    if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.log("[funnel]", type, payload);
    }

    trackAnalytics(type, payload);

    // Optional bridge: if additional analytics SDKs are present, mirror events.
    const gtag = (window as unknown as { gtag?: (command: string, action: string, params?: Record<string, unknown>) => void }).gtag;
    gtag?.("event", type, payload);

    const segment = (window as unknown as { analytics?: { track?: (event: string, props?: Record<string, unknown>) => void } }).analytics;
    segment?.track?.(type, payload);
}

export function useFunnelTracking() {
    const track = useCallback((event: FunnelEvent) => {
        emitEvent(event);
    }, []);

    return { track };
}
