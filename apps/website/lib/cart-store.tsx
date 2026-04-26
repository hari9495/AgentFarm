"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { Bot } from "@/lib/bots";

export type CartItem = {
    slug: string;
    name: string;
    price: string;
    priceMonthly: number;
    color: Bot["color"];
};

type CartContextType = {
    items: CartItem[];
    addBot: (bot: CartItem) => void;
    removeBot: (slug: string) => void;
    hasBot: (slug: string) => boolean;
    clearCart: () => void;
    total: number;
    count: number;
    sidebarOpen: boolean;
    openSidebar: () => void;
    closeSidebar: () => void;
};

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = "agentfarm-cart";

export function CartStoreProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<CartItem[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const loaded = useRef(false);

    // Hydrate from localStorage once on mount
    useEffect(() => {
        if (loaded.current) return;
        loaded.current = true;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setItems(parsed);
            }
        } catch {
            // ignore corrupt data
        }
    }, []);

    // Persist to localStorage on change
    useEffect(() => {
        if (!loaded.current) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {
            // ignore quota errors
        }
    }, [items]);

    const addBot = useCallback((bot: CartItem) => {
        setItems((prev) => {
            if (prev.some((i) => i.slug === bot.slug)) return prev;
            return [...prev, bot];
        });
        setSidebarOpen(true);
    }, []);

    const removeBot = useCallback((slug: string) => {
        setItems((prev) => prev.filter((i) => i.slug !== slug));
    }, []);

    const hasBot = useCallback(
        (slug: string) => items.some((i) => i.slug === slug),
        [items]
    );

    const clearCart = useCallback(() => {
        setItems([]);
    }, []);

    const total = useMemo(
        () => items.reduce((sum, i) => sum + i.priceMonthly, 0),
        [items]
    );

    const openSidebar = useCallback(() => setSidebarOpen(true), []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    const value = useMemo<CartContextType>(
        () => ({
            items,
            addBot,
            removeBot,
            hasBot,
            clearCart,
            total,
            count: items.length,
            sidebarOpen,
            openSidebar,
            closeSidebar,
        }),
        [
            items,
            addBot,
            removeBot,
            hasBot,
            clearCart,
            total,
            sidebarOpen,
            openSidebar,
            closeSidebar,
        ]
    );

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error("useCart must be used inside CartStoreProvider");
    return ctx;
}

