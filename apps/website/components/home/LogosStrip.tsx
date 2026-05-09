"use client";

const logos = [
    { name: "Vercel", color: "bg-slate-900 text-white", initials: "▲" },
    { name: "Stripe", color: "bg-indigo-100 text-indigo-700", initials: "S" },
    { name: "Linear", color: "bg-violet-100 text-violet-700", initials: "LN" },
    { name: "Loom", color: "bg-purple-100 text-purple-700", initials: "L" },
    { name: "Retool", color: "bg-blue-100 text-blue-700", initials: "RT" },
    { name: "Grafana", color: "bg-orange-100 text-orange-700", initials: "GF" },
    { name: "Render", color: "bg-emerald-100 text-emerald-700", initials: "R" },
    { name: "Supabase", color: "bg-teal-100 text-teal-700", initials: "SB" },
    { name: "Planetscale", color: "bg-sky-100 text-sky-700", initials: "PS" },
    { name: "Fly.io", color: "bg-rose-100 text-rose-700", initials: "FY" },
];

// Duplicate for seamless loop
const allLogos = [...logos, ...logos];

export default function LogosStrip() {
    return (
        <section className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 py-10 overflow-hidden">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 mb-8">
                Trusted by engineering teams at fast-growing companies
            </p>
            <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-slate-50 dark:from-slate-900 to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-slate-50 dark:from-slate-900 to-transparent z-10 pointer-events-none" />

                <div className="flex animate-marquee w-max gap-6">
                    {allLogos.map((logo, i) => (
                        <div
                            key={`${logo.name}-${i}`}
                            className="flex items-center gap-2.5 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow cursor-default"
                            title={logo.name}
                        >
                            <div className={`w-8 h-8 rounded-lg ${logo.color} flex items-center justify-center text-xs font-bold shrink-0`}>
                                {logo.initials}
                            </div>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{logo.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
