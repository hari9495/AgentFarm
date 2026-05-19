import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Cookie Policy — AgentFarm",
    description: "How AgentFarm uses cookies and similar tracking technologies.",
};

const sections = [
    {
        heading: "What Are Cookies",
        body: `Cookies are small text files placed on your device when you visit a website. They allow the site to remember your preferences and actions over time. We also use similar technologies such as local storage and session storage for the same purposes described in this policy.`,
    },
    {
        heading: "How We Use Cookies",
        body: `AgentFarm uses cookies to: (1) keep you signed in across page loads (strictly necessary); (2) remember your theme preference (dark or light mode); (3) store your checkout draft so it is not lost on navigation; (4) measure aggregate, anonymous usage patterns to improve the product. We do not use cookies to track you across other websites.`,
    },
    {
        heading: "Types of Cookies We Use",
        body: `Strictly necessary cookies — essential for authentication, session management, and security. These cannot be disabled without breaking the service.\n\nFunctional cookies — remember your preferences (e.g. theme, dismissed banners). You may clear these at any time in your browser settings without losing access to the platform.\n\nAnalytics cookies — we use Vercel Analytics, a privacy-preserving analytics solution. It collects no personally identifiable information and does no cross-site tracking.`,
    },
    {
        heading: "Third-Party Cookies",
        body: `We use Stripe for payment processing. Stripe may set its own cookies when you interact with checkout flows; these are governed by Stripe's Cookie Policy. We do not embed third-party advertising networks or social media tracking pixels.`,
    },
    {
        heading: "Your Choices",
        body: `You may decline non-essential cookies via the cookie consent banner shown on your first visit to agentfarm.ai. You can also clear or block cookies at any time using your browser settings. Note that disabling strictly necessary cookies will prevent you from signing in.`,
    },
    {
        heading: "Cookie Retention",
        body: `Session cookies expire when you close your browser. Persistent cookies (e.g. theme preference, auth refresh token) are retained for up to 30 days. Analytics data is aggregated and retained for up to 12 months.`,
    },
    {
        heading: "Changes to This Policy",
        body: `We may update this Cookie Policy from time to time. We will notify you of material changes via an in-app banner or email. Continued use of the platform after the effective date constitutes acceptance of the updated policy.`,
    },
    {
        heading: "Contact",
        body: `Questions about our use of cookies? Contact us at privacy@agentfarm.ai or write to: AgentFarm Inc., 123 Market Street, Suite 400, San Francisco, CA 94105, USA.`,
    },
];

export default function CookiePolicyPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
            <div className="chip chip-accent mb-4">Legal</div>
            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-[var(--ink)] mb-3">
                Cookie Policy
            </h1>
            <p className="text-[var(--mute)] mb-12">Last updated: March 1, 2026</p>

            <p className="text-lg text-[var(--body-color)] leading-relaxed mb-12">
                This policy explains what cookies are, how AgentFarm uses them, and the choices you have.
            </p>

            <div className="space-y-8">
                {sections.map(({ heading, body }) => (
                    <div key={heading}>
                        <h2 className="text-lg font-semibold text-[var(--ink)] mb-2">{heading}</h2>
                        {body.split("\n\n").map((para, i) => (
                            <p key={i} className="text-[var(--mute)] leading-relaxed mb-3">
                                {para}
                            </p>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
