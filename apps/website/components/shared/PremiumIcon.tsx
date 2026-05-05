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
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/35 dark:text-sky-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/35 dark:text-violet-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/35 dark:text-rose-300",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/35 dark:text-indigo-300",
    cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/35 dark:text-cyan-300",
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
