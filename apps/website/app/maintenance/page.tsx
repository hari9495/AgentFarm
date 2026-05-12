import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Maintenance — AgentFarm",
    description: "AgentFarm is briefly down for maintenance.",
};

/**
 * Shown when NEXT_PUBLIC_MAINTENANCE_MODE=true is set.
 * Middleware redirects all non-health traffic here.
 */
export default function MaintenancePage() {
    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
            <div className="max-w-md w-full text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-6">
                    <svg
                        className="w-8 h-8 text-slate-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17L4.655 7.518a2.625 2.625 0 013.712-3.712l6.853 6.853"
                        />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-3">
                    Down for maintenance
                </h1>
                <p className="text-slate-600 mb-2">
                    We&apos;re making some improvements. We&apos;ll be back shortly.
                </p>
                <p className="text-sm text-slate-400">
                    If you need urgent help, email{" "}
                    <a
                        href="mailto:support@agentfarm.ai"
                        className="underline hover:text-slate-600"
                    >
                        support@agentfarm.ai
                    </a>
                </p>
            </div>
        </div>
    );
}
