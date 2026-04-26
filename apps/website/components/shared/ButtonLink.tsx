import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ComponentProps } from "react";

interface ButtonLinkProps extends ComponentProps<typeof Link> {
    variant?: "primary" | "outline" | "ghost";
    size?: "sm" | "md" | "lg";
}

export default function ButtonLink({
    variant = "primary",
    size = "md",
    className,
    children,
    ...props
}: ButtonLinkProps) {
    return (
        <Link
            className={cn(
                "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 shadow-sm",
                variant === "primary" && "bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 text-white hover:brightness-110 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-500/30 active:brightness-95",
                variant === "outline" && "border border-slate-300/90 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white/85 dark:bg-slate-900/70 backdrop-blur hover:bg-white dark:hover:bg-slate-900 hover:-translate-y-0.5 hover:shadow-md",
                variant === "ghost" && "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/75 dark:hover:bg-slate-800/70",
                size === "sm" && "px-3.5 py-1.5 text-sm",
                size === "md" && "px-5 py-2.5 text-sm",
                size === "lg" && "px-7 py-3.5 text-base",
                className
            )}
            {...props}
        >
            {children}
        </Link>
    );
}

