"use client";

import { ShoppingCart, Check, X } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import type { Bot } from "@/lib/bots";

export default function AddToCartButton({ bot, compact = false }: { bot: Bot; compact?: boolean }) {
    const { addBot, removeBot, hasBot } = useCart();
    const inCart = hasBot(bot.slug);

    if (!bot.available) {
        return compact ? (
            <span className="text-[11px] font-semibold text-[#aeaeb2]">Coming soon</span>
        ) : (
            <button
                disabled
                className="w-full px-4 py-2.5 text-sm font-semibold bg-slate-100 text-slate-400 rounded-xl cursor-not-allowed"
            >
                Coming soon
            </button>
        );
    }

    if (inCart) {
        return compact ? (
            <button
                onClick={() => removeBot(bot.slug)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-white cursor-pointer transition-colors group"
                style={{ background: "#34c759" }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#c4161c")}
                onMouseOut={(e) => (e.currentTarget.style.background = "#34c759")}
            >
                <Check className="w-3 h-3 group-hover:hidden" />
                <X className="w-3 h-3 hidden group-hover:block" />
                <span className="group-hover:hidden">Added</span>
                <span className="hidden group-hover:block">Remove</span>
            </button>
        ) : (
            <button
                onClick={() => removeBot(bot.slug)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-green-600 hover:bg-red-600 text-white rounded-xl transition-colors cursor-pointer group"
            >
                <Check className="w-4 h-4 group-hover:hidden" />
                <span className="group-hover:hidden">Added to team</span>
                <span className="hidden group-hover:inline">Remove</span>
            </button>
        );
    }

    return compact ? (
        <button
            onClick={() => addBot({ slug: bot.slug, name: bot.name, price: bot.price, priceMonthly: bot.priceMonthly, color: bot.color })}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-white cursor-pointer transition-colors"
            style={{ background: "#0066cc" }}
            onMouseOver={(e) => (e.currentTarget.style.background = "#0071e3")}
            onMouseOut={(e) => (e.currentTarget.style.background = "#0066cc")}
        >
            <ShoppingCart className="w-3 h-3" />
            Add
        </button>
    ) : (
        <button
            onClick={() => addBot({ slug: bot.slug, name: bot.name, price: bot.price, priceMonthly: bot.priceMonthly, color: bot.color })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer"
        >
            <ShoppingCart className="w-4 h-4" />
            Add to Team
        </button>
    );
}
