import React from "react";
import type { LucideIcon } from "lucide-react";

type PremiumIconTone =
    | "sky"
    | "violet"
    | "emerald"
    | "amber"
    | "rose"
    | "slate"
    | "indigo"
    | "cyan";

const toneMap: Record<PremiumIconTone, string> = {
    sky: "bg-blue-100 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300",
    violet: "bg-blue-100 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/35 dark:text-rose-300",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    indigo: "bg-blue-100 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300",
    cyan: "bg-blue-100 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300",
};

export default function PremiumIcon({
    icon: Icon,
    tone = "sky",
    containerClassName = "h-9 w-9 rounded-xl",
    iconClassName = "h-4.5 w-4.5",
}: {
    icon: LucideIcon;
    tone?: PremiumIconTone;
    containerClassName?: string;
    iconClassName?: string;
}) {
    return (
        <span
            className={`inline-flex items-center justify-center border border-slate-200/80 dark:border-slate-700/70 shadow-sm ${toneMap[tone]} ${containerClassName}`}
        >
            <Icon className={iconClassName} />
        </span>
    );
}
