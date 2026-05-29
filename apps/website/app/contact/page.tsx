import type { Metadata } from "next";
import { Mail, Clock, MapPin, ArrowRight } from "lucide-react";
import ContactForm from "@/components/shared/ContactForm";

export const metadata: Metadata = {
    title: "Contact the AgentFarms Team — Demos and Partnerships",
    description: "Get in touch with the AgentFarms team about demos, partnerships, enterprise plans, or questions about governed AI workers. We respond within one business day.",
};

const contactItems = [
    {
        icon: Mail,
        label: "Email us",
        lines: ["hello@agentfarms.in", "support@agentfarms.in"],
    },
    {
        icon: Clock,
        label: "Response time",
        lines: ["Sales: within 4 hours", "Support: within 24 hours"],
    },
    {
        icon: MapPin,
        label: "Based in",
        lines: ["San Francisco, CA", "Remote-first team"],
    },
];

export default function ContactPage() {
    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 64 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">Contact</p>
                    <h1 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}>
                        Get in touch
                    </h1>
                    <p className="mt-5 text-[17px] text-[#424245] max-w-md mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        Questions about the platform, a demo request, or a partnership inquiry — we read everything and respond fast.
                    </p>
                </div>
            </section>

            {/* Contact info + form — parchment */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 0, paddingBottom: 80 }}>
                <div className="af-container">
                    <div className="grid lg:grid-cols-[1fr_1.6fr] gap-12 items-start">

                        {/* Info cards */}
                        <div className="space-y-4">
                            {contactItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.label} className="rounded-[18px] p-5" style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: "rgba(0,102,204,0.08)" }}>
                                                <Icon className="w-4 h-4 text-[#0066cc]" />
                                            </div>
                                            <span className="text-[14px] font-semibold text-[#1d1d1f]">{item.label}</span>
                                        </div>
                                        {item.lines.map((line) => (
                                            <p key={line} className="text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.6 }}>{line}</p>
                                        ))}
                                    </div>
                                );
                            })}

                            <div className="rounded-[18px] p-5" style={{ background: "rgba(0,102,204,0.04)", border: "1px solid rgba(0,102,204,0.2)" }}>
                                <p className="text-[14px] font-semibold text-[#0066cc] mb-1">Want a live demo instead?</p>
                                <p className="text-[13px] text-[#424245] mb-3" style={{ lineHeight: 1.5 }}>
                                    Book a 30-minute session with the team and see a worker in action.
                                </p>
                                <a
                                    href="/book-demo"
                                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0066cc] hover:text-[#0071e3] transition-colors"
                                >
                                    Book a demo <ArrowRight className="w-3.5 h-3.5" />
                                </a>
                            </div>
                        </div>

                        {/* Contact form */}
                        <div className="rounded-[18px] p-7" style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}>
                            <h2 className="font-semibold text-[#1d1d1f] mb-6" style={{ fontSize: "1.2rem", letterSpacing: "-0.018em" }}>
                                Send us a message
                            </h2>
                            <ContactForm />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
