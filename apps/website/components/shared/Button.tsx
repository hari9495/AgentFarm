import { cn } from "@/lib/cn";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "outline" | "ghost";
    size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
                    variant === "primary" && "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
                    variant === "outline" && "border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100",
                    variant === "ghost" && "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
                    size === "sm" && "px-3.5 py-1.5 text-sm",
                    size === "md" && "px-5 py-2.5 text-sm",
                    size === "lg" && "px-7 py-3.5 text-base",
                    className
                )}
                {...props}
            >
                {children}
            </button>
        );
    }
);

Button.displayName = "Button";
export default Button;

