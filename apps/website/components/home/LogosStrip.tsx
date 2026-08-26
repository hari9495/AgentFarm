/**
 * Operations Console redesign — "works with your stack".
 * These aren't vanity logos: they're the connectors the agents actually act
 * through, so the strip is framed honestly and set in mono (the evidence voice).
 */

const connectors = [
    "GitHub", "Jira", "Slack", "Gmail", "Outlook", "Greenhouse",
    "Salesforce", "HubSpot", "Linear", "Teams", "WordPress", "Zoom",
];

export default function LogosStrip() {
    return (
        <section
            aria-label="Works with your stack"
            style={{ background: "var(--op-paper)", borderTop: "1px solid var(--op-line)", borderBottom: "1px solid var(--op-line)" }}
        >
            <div className="mx-auto max-w-[1200px] px-6 py-10">
                <p
                    className="mb-7 text-center text-[12px] uppercase tracking-[0.16em]"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}
                >
                    acts through the tools you already run
                </p>
                <div className="relative overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)" }}>
                    <div className="flex w-max gap-10 animate-marquee">
                        {[...connectors, ...connectors].map((name, i) => (
                            <span
                                key={`${name}-${i}`}
                                className="shrink-0 select-none text-[15px]"
                                style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)", letterSpacing: "-0.01em" }}
                            >
                                {name}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
