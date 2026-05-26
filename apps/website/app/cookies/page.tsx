import type { Metadata } from "next";
import { cookiesPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: cookiesPageContent.metadata.title,
    description: cookiesPageContent.metadata.description,
};

export default function CookiePolicyPage() {
    return (
        <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="chip chip-accent mb-4">Legal</div>
            <h1 className="mb-3 text-4xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
                {cookiesPageContent.title}
            </h1>
            <p className="mb-12 text-[var(--mute)]">Last updated: {cookiesPageContent.updatedAt}</p>

            <p className="mb-12 text-lg leading-relaxed text-[var(--body-color)]">
                {cookiesPageContent.intro}
            </p>

            <div className="space-y-8">
                {cookiesPageContent.sections.map(({ heading, body }) => (
                    <div key={heading}>
                        <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">{heading}</h2>
                        <p className="mb-3 leading-relaxed text-[var(--mute)]">{body}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
