import type { Metadata } from "next";
import { Mail, Clock, MapPin } from "lucide-react";
import ContactForm from "@/components/shared/ContactForm";


export const metadata: Metadata = {
    title: "Contact — AgentFarm",
    description:
        "Get in touch with the AgentFarm team. Questions, demos, partnerships — we'd love to hear from you.",
};

const contactItems = [
    {
        icon: Mail,
        label: "Email us",
        lines: ["hello@AgentFarm.ai", "support@AgentFarm.ai"],
        gradient: "from-blue-500 to-cyan-500",
    },
    {
        icon: Clock,
        label: "Response time",
        lines: ["We reply within 1 business day.", "Critical issues: 2–4 hours."],
        gradient: "from-violet-500 to-blue-500",
    },
    {
        icon: MapPin,
        label: "Office",
        lines: ["123 Market Street, Suite 400", "San Francisco, CA 94105"],
        gradient: "from-emerald-500 to-teal-500",
    },
];

export default function ContactPage() {
    return (
        <div className="min-h-screen">
            {/* Hero with photo */}
            <section className="relative overflow-hidden">
                <img
                    src="https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1800&q=80"
                    alt="Friendly team in a bright office"
                    className="w-full h-[300px] sm:h-[360px] object-cover"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07080a]/85 via-[#07080a]/60 to-transparent" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full text-center">
                        <span className="chip chip-accent mb-5">
                            Contact
                        </span>
                        <h1 className="mt-3 text-4xl sm:text-5xl font-semibold text-[var(--ink)] tracking-[-0.03em] mb-4">
                            Get in{" "}
                            <span className="bg-gradient-to-r from-[var(--accent-blue)] to-purple-400 bg-clip-text text-transparent">
                                touch
                            </span>
                        </h1>
                        <p className="text-xl text-[var(--mute)] max-w-xl mx-auto">
                            Questions about AgentFarm? Want a personalised demo? We&apos;d love to
                            hear from you.
                        </p>
                    </div>
                </div>
            </section>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                <div className="grid lg:grid-cols-5 gap-12">
                    {/* Contact info */}
                    <div className="lg:col-span-2 space-y-6">
                        {contactItems.map(({ icon: Icon, label, lines, gradient }) => (
                            <div key={label} className="flex gap-4 group">
                                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                                    <Icon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <p className="font-semibold text-[var(--ink)] mb-1">{label}</p>
                                    {lines.map((l) => (
                                        <p key={l} className="text-sm text-[var(--mute)]">{l}</p>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="p-5 bg-[var(--surface-el)] rounded-2xl border border-[var(--hairline)]">
                            <p className="text-sm font-semibold text-[var(--ink)] mb-2">
                                Want a live demo?
                            </p>
                            <p className="text-sm text-[var(--mute)] leading-relaxed">
                                We offer 30-minute personalised demos for teams of 3+. Mention
                                &quot;demo&quot; in your message and we&apos;ll prioritise scheduling.
                            </p>
                        </div>
                    </div>

                    {/* Form */}
                    <div className="lg:col-span-3 bg-[var(--surface-card)] border border-[var(--hairline)] rounded-2xl p-8">
                        <ContactForm />
                    </div>
                </div>
            </div>
        </div>
    );
}


