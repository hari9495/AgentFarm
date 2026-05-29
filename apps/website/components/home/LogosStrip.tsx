const logos = [
    "Vercel", "Stripe", "Notion", "Linear", "Figma", "GitHub",
    "Slack", "Jira", "Salesforce", "HubSpot", "Zendesk", "Intercom",
];

export default function LogosStrip() {
    return (
        <section
            className="af-tile af-tile-parchment"
            style={{ paddingTop: 48, paddingBottom: 48 }}
            aria-label="Trusted by teams at"
        >
            <div className="af-container-wide">
                <p className="text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6e6e73] mb-8">
                    Trusted by fast-moving teams
                </p>
                <div className="relative overflow-hidden">
                    <div className="flex gap-12 animate-marquee" aria-hidden>
                        {[...logos, ...logos].map((logo, i) => (
                            <span
                                key={`${logo}-${i}`}
                                className="shrink-0 text-[15px] font-semibold text-[#aeaeb2] select-none"
                                style={{ letterSpacing: "-0.01em" }}
                            >
                                {logo}
                            </span>
                        ))}
                    </div>
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-20" style={{ background: "linear-gradient(to right, #f5f5f7, transparent)" }} />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-20" style={{ background: "linear-gradient(to left, #f5f5f7, transparent)" }} />
                </div>
            </div>
        </section>
    );
}
