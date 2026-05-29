import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
    return (
        <div style={{ background: "#ffffff" }}>
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 120, paddingBottom: 120 }}>
                <div className="af-container-narrow">
                    <p className="font-semibold text-[#0066cc]" style={{ fontSize: "4rem", letterSpacing: "-0.05em", lineHeight: 1 }}>
                        404
                    </p>
                    <h1
                        className="mt-4 font-semibold text-[#1d1d1f]"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}
                    >
                        Page not found
                    </h1>
                    <p className="mt-4 text-[17px] text-[#6e6e73] max-w-sm mx-auto" style={{ lineHeight: 1.47 }}>
                        The page you&apos;re looking for doesn&apos;t exist or has been moved.
                    </p>
                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/" className="btn-primary">
                            Back to home
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link href="/docs" className="btn-secondary">
                            Documentation
                        </Link>
                    </div>
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                        {[
                            { label: "Marketplace", href: "/marketplace" },
                            { label: "Pricing", href: "/pricing" },
                            { label: "Contact", href: "/contact" },
                            { label: "Status", href: "/status" },
                        ].map((l) => (
                            <Link key={l.href} href={l.href} className="text-[14px] text-[#0066cc] hover:text-[#0071e3] transition-colors">
                                {l.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
