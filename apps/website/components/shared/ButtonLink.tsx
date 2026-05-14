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
                "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]/50 focus-visible:ring-offset-2",
                variant === "primary" && "bg-[var(--accent-blue)] text-[#07080a] hover:bg-[#8dd7ff] active:scale-[0.98] shadow-sm",
                variant === "outline" && "border border-[var(--hairline)] text-[var(--ink)] bg-[var(--surface-card)] hover:bg-[var(--surface-el)] hover:-translate-y-0.5 hover:shadow-sm",
                variant === "ghost" && "text-[var(--mute)] hover:text-[var(--ink)] hover:bg-[var(--surface-el)]",
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

