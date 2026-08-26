import type { Metadata } from "next";
import { cookiesPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: cookiesPageContent.metadata.title,
    description: cookiesPageContent.metadata.description,
};

export default function CookiePolicyPage() {
    return (
        <div style={{ background: "#ffffff" }}>
            <section className="af-tile af-tile-white" style={{ paddingTop: 80, paddingBottom: 80 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-3">Legal</p>
                    <h1 className="font-semibold text-[var(--op-ink)] mb-2" style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.1 }}>
                        {cookiesPageContent.title}
                    </h1>
                    <p className="text-[14px] text-[var(--op-muted)] mb-8">Last updated: {cookiesPageContent.updatedAt}</p>
                    <div style={{ borderTop: "1px solid var(--op-line)" }} className="pt-8">
                        <p className="text-[17px] text-[var(--op-ink-soft)] mb-10" style={{ lineHeight: 1.7 }}>
                            {cookiesPageContent.intro}
                        </p>
                        <div className="space-y-8">
                            {cookiesPageContent.sections.map((section) => (
                                <div key={section.heading}>
                                    <h2 className="font-semibold text-[var(--op-ink)] mb-3" style={{ fontSize: "1.1rem", letterSpacing: "-0.015em" }}>
                                        {section.heading}
                                    </h2>
                                    <p className="text-[15px] text-[var(--op-ink-soft)]" style={{ lineHeight: 1.7 }}>{section.body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
