"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop() {
    const [visible, setVisible] = useState(false);
    const pathname = usePathname();
    // Editorial (Ink & Petrol) product surfaces use petrol; marketing stays blue.
    const editorial = pathname?.startsWith("/dashboard") || pathname?.startsWith("/portal");

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 400);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    if (!visible) return null;

    return (
        <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={`fixed bottom-6 right-6 z-40 w-10 h-10 text-white shadow-lg flex items-center justify-center transition-colors cursor-pointer ${
                editorial
                    ? "bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[3px]"
                    : "bg-blue-600 hover:bg-blue-700 rounded-full"
            }`}
            aria-label="Scroll to top"
        >
            <ArrowUp className="w-4 h-4" />
        </button>
    );
}

