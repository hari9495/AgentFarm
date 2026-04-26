"use client";

import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-store";

export default function CartIcon() {
    const { count, openSidebar } = useCart();

    return (
        <button
            onClick={openSidebar}
            aria-label={`View cart (${count} item${count !== 1 ? "s" : ""})`}
            className="relative p-2 rounded-md text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
            <ShoppingCart className="w-5 h-5" />
            {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                    {count}
                </span>
            )}
        </button>
    );
}

