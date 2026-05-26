import type { Metadata } from "next";
import { privacyPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: privacyPageContent.metadata.title,
    description: privacyPageContent.metadata.description,
};

export default function PrivacyPage() {
    return (
        <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="chip chip-accent mb-4">Legal</div>
            <h1 className="mb-3 text-4xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                {privacyPageContent.title}
            </h1>
            <p className="mb-12 text-[var(--mute)]">Last updated: {privacyPageContent.updatedAt}</p>

            <p className="mb-12 text-lg leading-relaxed text-[var(--body-color)]">
                {privacyPageContent.intro}
            </p>

            <div className="space-y-8">
                {privacyPageContent.sections.map(({ heading, body }) => (
                    <div key={heading} className="border-b border-[var(--hairline)] pb-8 last:border-0">
                        <h2 className="mb-3 text-lg font-semibold text-[var(--ink)]">{heading}</h2>
                        <p className="leading-relaxed text-[var(--body-color)]">{body}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
