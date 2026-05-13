"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";
import MobileStickyCTA from "./MobileStickyCTA";

const APP_PREFIXES = ["/dashboard", "/admin", "/portal"];

export default function MarketingShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isApp = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

    if (isApp) return <>{children}</>;

    return (
        <>
            <Navbar />
            <main className="relative z-[1]">{children}</main>
            <MobileStickyCTA />
            <Footer />
        </>
    );
}
