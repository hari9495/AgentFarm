import type { Metadata } from "next";
import { termsPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: termsPageContent.metadata.title,
    description: termsPageContent.metadata.description,
};

export default function TermsPage() {
    return (
        <div style={{ background: "#ffffff" }}>
            <section className="af-tile af-tile-white" style={{ paddingTop: 80, paddingBottom: 80 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-3">Legal</p>
                    <h1 className="font-semibold text-[#1d1d1f] mb-2" style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.1 }}>
                        {termsPageContent.title}
                    </h1>
                    <p className="text-[14px] text-[#aeaeb2] mb-8">Last updated: {termsPageContent.updatedAt}</p>
                    <div style={{ borderTop: "1px solid #e8e8ed" }} className="pt-8">
                        <p className="text-[17px] text-[#424245] mb-10" style={{ lineHeight: 1.7 }}>
                            {termsPageContent.intro}
                        </p>
                        <div className="space-y-8">
                            {termsPageContent.sections.map((section) => (
                                <div key={section.heading}>
                                    <h2 className="font-semibold text-[#1d1d1f] mb-3" style={{ fontSize: "1.1rem", letterSpacing: "-0.015em" }}>
                                        {section.heading}
                                    </h2>
                                    <p className="text-[15px] text-[#424245]" style={{ lineHeight: 1.7 }}>{section.body}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
