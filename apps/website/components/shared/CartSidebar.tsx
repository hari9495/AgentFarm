"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2, ShoppingCart, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import { colorMap } from "@/lib/bots";

export default function CartSidebar() {
    const { items, removeBot, clearCart, total, count, sidebarOpen, closeSidebar } =
        useCart();
    const router = useRouter();

    // Close on Escape key
    useEffect(() => {
        if (!sidebarOpen) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") closeSidebar();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [sidebarOpen, closeSidebar]);

    // Prevent body scroll when open
    useEffect(() => {
        if (sidebarOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [sidebarOpen]);

    if (!sidebarOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={closeSidebar}
                aria-hidden="true"
            />

            {/* Sidebar panel */}
            <aside
                role="dialog"
                aria-modal="true"
                aria-label="Your bot selection"
                className="fixed right-0 top-0 z-50 h-full w-full max-w-sm bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-blue-600" />
                        <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                            Your Team{" "}
                            {count > 0 && (
                                <span className="text-sm font-normal text-slate-400">
                                    ({count} bot{count !== 1 ? "s" : ""})
                                </span>
                            )}
                        </h2>
                    </div>
                    <button
                        onClick={closeSidebar}
                        aria-label="Close cart"
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Bot list */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-16">
                            <ShoppingCart className="w-12 h-12 text-slate-200 dark:text-slate-700 mb-4" />
                            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                                No bots selected yet
                            </p>
                            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                                Browse the marketplace and add bots to your team.
                            </p>
                        </div>
                    ) : (
                        items.map((item) => {
                            const c = colorMap[item.color];
                            return (
                                <div
                                    key={item.slug}
                                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                >
                                    <div
                                        className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}
                                    >
                                        <span className={`text-xs font-bold ${c.icon}`}>
                                            {item.name
                                                .replace("AI ", "")
                                                .split(" ")
                                                .map((w) => w[0])
                                                .slice(0, 2)
                                                .join("")}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-slate-400">{item.price}</p>
                                    </div>
                                    <button
                                        onClick={() => removeBot(item.slug)}
                                        aria-label={`Remove ${item.name}`}
                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors cursor-pointer shrink-0"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                {items.length > 0 && (
                    <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">
                                Estimated monthly
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                                ${total}/mo
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            14-day free trial Â· no credit card required
                        </p>
                        <button
                            onClick={() => {
                                closeSidebar();
                                router.push("/checkout");
                            }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                        >
                            Review & Get Started
                            <ArrowRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={clearCart}
                            className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                        >
                            Clear selection
                        </button>
                    </div>
                )}
            </aside>
        </>
    );
}

