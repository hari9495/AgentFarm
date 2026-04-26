"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, Rocket } from "lucide-react";

type Props = {
    botSlug: string;
    botName: string;
    plan: string;
    price: string;
};

export default function MarketplaceDeployButton({ botSlug, botName, plan, price }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [queued, setQueued] = useState(false);

    const onDeploy = async () => {
        setLoading(true);
        setError(null);

        try {
            const selectionResponse = await fetch("/api/marketplace/selection", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    starterAgent: botSlug,
                    config: {
                        plan,
                        listedPrice: price,
                        source: "marketplace-detail",
                    },
                }),
            });

            if (!selectionResponse.ok) {
                if (selectionResponse.status === 401) {
                    router.push(`/login?next=/marketplace/${encodeURIComponent(botSlug)}`);
                    return;
                }

                const body = (await selectionResponse.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Could not save marketplace selection.");
            }

            const deployResponse = await fetch("/api/deployments", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    botSlug,
                    botName,
                }),
            });

            const deployBody = (await deployResponse.json().catch(() => null)) as {
                error?: string;
                redirectTo?: string;
            } | null;

            if (!deployResponse.ok) {
                if (deployResponse.status === 401) {
                    router.push(`/login?next=/marketplace/${encodeURIComponent(botSlug)}`);
                    return;
                }

                if (deployResponse.status === 409 && deployBody?.redirectTo) {
                    router.push(deployBody.redirectTo);
                    return;
                }

                throw new Error(deployBody?.error ?? "Deployment request failed.");
            }

            setQueued(true);
        } catch (deployError) {
            setError(deployError instanceof Error ? deployError.message : "Deployment request failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-2">
            <button
                onClick={() => void onDeploy()}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {loading ? "Preparing deploy..." : "Deploy This Agent"}
            </button>

            {queued ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Deployment queued. <Link href="/dashboard" className="font-semibold underline">Open dashboard status</Link>.
                </p>
            ) : null}

            {error ? <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p> : null}
        </div>
    );
}
