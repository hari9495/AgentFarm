"use client";

import { ShoppingCart, Check } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import type { Bot } from "@/lib/bots";

export default function AddToCartButton({ bot }: { bot: Bot }) {
    const { addBot, removeBot, hasBot } = useCart();
    const inCart = hasBot(bot.slug);

    if (!bot.available) {
        return (
            <button
                disabled
                className="w-full px-4 py-2.5 text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-xl cursor-not-allowed"
            >
                Coming soon
            </button>
        );
    }

    if (inCart) {
        return (
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

    return (
        <button
            onClick={() =>
                addBot({
                    slug: bot.slug,
                    name: bot.name,
                    price: bot.price,
                    priceMonthly: bot.priceMonthly,
                    color: bot.color,
                })
            }
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer"
        >
            <ShoppingCart className="w-4 h-4" />
            Add to Team
        </button>
    );
}

