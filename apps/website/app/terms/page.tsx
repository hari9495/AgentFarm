import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Terms of Service — AgentFarm",
    description:
        "AgentFarm Terms of Service. Read our terms before using the platform.",
};

const sections = [
    {
        heading: "1. Acceptance of Terms",
        body: `By accessing or using AgentFarm ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service. These Terms apply to all users, including visitors, registered accounts, and paid subscribers.`,
    },
    {
        heading: "2. Description of Service",
        body: `AgentFarm provides an AI workforce platform that allows engineering teams to deploy AI-powered workers ("Robots") to perform software development tasks including: writing code, creating pull requests, running tests, reviewing code, and managing CI/CD pipelines. The Service integrates with third-party developer tools including GitHub, Slack, Jira, and Linear.`,
    },
    {
        heading: "3. Account Registration",
        body: `To use the Service, you must create an account with an accurate email address. You are responsible for maintaining the confidentiality of your credentials and all activity under your account. You must notify us immediately at security@AgentFarm.ai of any unauthorised access. You must be at least 18 years old to create an account.`,
    },
    {
        heading: "4. Acceptable Use",
        body: `You may not use AgentFarm to: generate or deploy malware or malicious code; conduct attacks or scans on systems you do not own; violate intellectual property rights; generate illegal or harassing content; attempt to bypass rate limits or access controls; reverse-engineer the platform; or resell access without a written reseller agreement.`,
    },
    {
        heading: "5. Payment & Subscriptions",
        body: `Paid plans are billed monthly or annually in advance. Prices are listed in USD. We use Stripe for payment processing. Subscriptions renew automatically unless cancelled before the renewal date. No refunds are issued for unused periods except as required by applicable law. We may change pricing with 30 days' notice to active subscribers.`,
    },
    {
        heading: "6. Data & Privacy",
        body: `Your use of AgentFarm is also governed by our Privacy Policy, incorporated into these Terms by reference. You retain ownership of all code, data, and content your Robots produce on your behalf. AgentFarm does not use your code or outputs to train AI models without your explicit consent.`,
    },
    {
        heading: "7. Intellectual Property",
        body: `AgentFarm and its original content, features, and functionality are owned by AgentFarm Inc. and are protected by international copyright, trademark, and other intellectual property laws. You are granted a limited, non-exclusive, non-transferable licence to use the Service for its intended purpose.`,
    },
    {
        heading: "8. Limitation of Liability",
        body: `To the maximum extent permitted by law, AgentFarm shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits or data. AgentFarm's total liability shall not exceed the amounts you paid us in the 12 months preceding the claim.`,
    },
    {
        heading: "9. Disclaimer of Warranties",
        body: `The Service is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted or error-free, or that AI output will be accurate or fit for any particular purpose. You should review all Robot-generated code before deploying to production.`,
    },
    {
        heading: "10. Termination",
        body: `We may suspend or terminate your account immediately for material breach of these Terms. You may cancel your account at any time from account settings. Upon termination, your right to access the Service ceases and we may delete your data in accordance with our retention policy.`,
    },
    {
        heading: "11. Governing Law",
        body: `These Terms are governed by the laws of the State of California, USA, without regard to conflict of law principles. Any disputes shall be resolved exclusively in the state or federal courts located in San Francisco County, California.`,
    },
    {
        heading: "12. Changes to Terms",
        body: `We reserve the right to modify these Terms at any time. We will provide at least 14 days' notice of material changes via email or in-app notification. Continued use after the effective date constitutes acceptance of the updated Terms.`,
    },
    {
        heading: "13. Contact",
        body: `Questions about these Terms? Contact us at legal@AgentFarm.ai or write to: AgentFarm Inc., 123 Market Street, Suite 400, San Francisco, CA 94105, USA.`,
    },
];

export default function TermsPage() {
    return (
        <div className="site-shell">
            <div className="page-hero">
                <div className="page-hero-inner">
                    <p className="page-eyebrow">Legal</p>
                    <h1 className="page-hero-title">Terms of Service</h1>
                    <p className="page-hero-subtitle">Last updated: March 1, 2026</p>
                </div>
            </div>
            <div className="page-section">
                <div className="page-section-inner max-w-3xl">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full mb-4">
                        Legal
                    </div>
                    <h1 className="text-4xl font-extrabold mb-3">
                        <span className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">Terms of Service</span>
                    </h1>
                    <p className="text-slate-500 mb-12">Last updated: March 1, 2026</p>

                    <p className="text-lg text-slate-600 leading-relaxed mb-12">
                        Please read these Terms carefully before using AgentFarm. They govern
                        your access to and use of our platform.
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
            </div>
        </div>
    );
}


