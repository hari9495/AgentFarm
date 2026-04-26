"use client";

import { CartStoreProvider } from "@/lib/cart-store";
import CartSidebar from "./CartSidebar";

export default function CartProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <CartStoreProvider>
            {children}
            <CartSidebar />
        </CartStoreProvider>
    );
}

