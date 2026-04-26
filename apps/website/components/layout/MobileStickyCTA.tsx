"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useFunnelTracking } from "@/lib/use-funnel-tracking";

const HIDE_EXACT = new Set(["/get-started", "/checkout", "/login"]);
const HIDE_PREFIX = ["/docs", "/api"];

function shouldShowForPath(pathname: string) {
  if (HIDE_EXACT.has(pathname)) return false;
  if (HIDE_PREFIX.some((prefix) => pathname.startsWith(prefix))) return false;
  return true;
}

export default function MobileStickyCTA() {
  const pathname = usePathname();
  const { track } = useFunnelTracking();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const handleViewport = () => {
      const delta = window.innerHeight - viewport.height;
      setKeyboardOpen(delta > 180);
    };

    viewport.addEventListener("resize", handleViewport);
    handleViewport();

    return () => viewport.removeEventListener("resize", handleViewport);
  }, []);

  const shouldShow = useMemo(() => {
    return shouldShowForPath(pathname) && !keyboardOpen;
  }, [pathname, keyboardOpen]);

  if (!shouldShow) return null;

  return (
    <>
      <div className="md:hidden h-24" aria-hidden />
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none">
        <div className="pointer-events-auto rounded-2xl border border-sky-200/80 dark:border-sky-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-sky-500/15">
          <Link
            href="/get-started"
            onClick={() => track({ type: "mobile_sticky_cta_click", sourcePath: pathname })}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Launch your first agent</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Get started in under 10 minutes</p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 text-white shadow-md shadow-sky-500/35">
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </div>
    </>
  );
}
