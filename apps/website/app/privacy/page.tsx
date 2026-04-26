import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy — AgentFarm",
    description:
        "How AgentFarm collects, uses, and protects your personal information.",
};

const sections = [
    {
        heading: "Information We Collect",
        body: `We collect information you provide directly: your email address when you join the waitlist or create an account, payment information processed by Stripe (we never store card numbers), and optional profile details. We also collect usage data such as features accessed, tasks run, and robot activity logs to improve our service.`,
    },
    {
        heading: "How We Use Your Information",
        body: `We use your information to provide and improve AgentFarm, send product updates and newsletters (unsubscribe at any time), respond to support requests, prevent fraud and abuse, and comply with legal obligations. We do not sell personal data to third parties.`,
    },
    {
        heading: "Data Storage & Security",
        body: `Data is stored on AWS infrastructure in the US and EU. We encrypt all data in transit (TLS 1.3) and at rest (AES-256). Access to production data is restricted to authorised engineers and is fully logged. We undergo regular security reviews and are working toward SOC 2 Type II certification.`,
    },
    {
        heading: "Cookies & Tracking",
        body: `We use strictly necessary cookies for authentication and session management. We use Vercel Analytics — a privacy-preserving analytics solution with no cross-site tracking — to understand aggregate usage patterns. You may decline non-essential cookies via the cookie consent banner shown on your first visit.`,
    },
    {
        heading: "Third-Party Services",
        body: `AgentFarm integrates with GitHub, Slack, Jira, and Linear at your direction. We access only the permission scopes you explicitly grant. We use Stripe for payments, Resend for transactional email, and Vercel for hosting. Each provider has their own privacy policy governing their handling of data.`,
    },
    {
        heading: "Your Rights",
        body: `Depending on your location, you may have rights to access, correct, or delete your personal data, or to object to certain processing. To exercise these rights, email privacy@AgentFarm.ai. EU/EEA users have rights under GDPR; California residents have rights under CCPA. We will respond to verified requests within 30 days.`,
    },
    {
        heading: "Data Retention",
        body: `We retain account data for the duration of your subscription plus 90 days after cancellation. Task logs and robot job outputs are retained for 30 days by default (configurable per workspace). After account deletion, anonymised aggregate statistics may be retained indefinitely.`,
    },
    {
        heading: "Children's Privacy",
        body: `AgentFarm is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal data, please contact privacy@AgentFarm.ai.`,
    },
    {
        heading: "Changes to This Policy",
        body: `We may update this policy from time to time. We will notify you of significant changes via email or in-product notice at least 14 days before the change takes effect. The "last updated" date at the top of this page reflects the most recent revision.`,
    },
    {
        heading: "Contact Us",
        body: `Questions about this policy or your data? Email privacy@AgentFarm.ai or write to: AgentFarm Inc., 123 Market Street, Suite 400, San Francisco, CA 94105, USA.`,
    },
];

export default function PrivacyPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full mb-4">
                Legal
            </div>
            <h1 className="text-4xl font-extrabold mb-3">
                <span className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">Privacy Policy</span>
            </h1>
            <p className="text-slate-500 mb-12">Last updated: March 1, 2026</p>

            <p className="text-lg text-slate-600 leading-relaxed mb-12">
                AgentFarm Inc. (&quot;AgentFarm&quot;, &quot;we&quot;, &quot;us&quot;) is
                committed to protecting your privacy. This policy explains what data we
                collect, why we collect it, and how you can control it.
            </p>

            <div className="space-y-8">
                {sections.map(({ heading, body }) => (
                    <div
                        key={heading}
                        className="pb-8 border-b border-slate-100 last:border-0"
                    >
                        <h2 className="text-lg font-semibold text-slate-900 mb-3">
                            {heading}
                        </h2>
                        <p className="text-slate-600 leading-relaxed">{body}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}


