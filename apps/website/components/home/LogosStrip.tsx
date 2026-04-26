"use client";

const logos = [
  { name: "YC Startup", color: "bg-orange-100 text-orange-700", initials: "YC" },
  { name: "Series A Co.", color: "bg-green-100 text-green-700", initials: "SA" },
  { name: "TechCorp", color: "bg-blue-100 text-blue-700", initials: "TC" },
  { name: "BuildFast", color: "bg-purple-100 text-purple-700", initials: "BF" },
  { name: "DevOps Inc.", color: "bg-rose-100 text-rose-700", initials: "DI" },
  { name: "ShipIt", color: "bg-cyan-100 text-cyan-700", initials: "SI" },
  { name: "CloudNative", color: "bg-indigo-100 text-indigo-700", initials: "CN" },
  { name: "StartupX", color: "bg-amber-100 text-amber-700", initials: "SX" },
  { name: "LaunchPad", color: "bg-teal-100 text-teal-700", initials: "LP" },
  { name: "SprintHQ", color: "bg-pink-100 text-pink-700", initials: "SH" },
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
        {/* Fade edges */}
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

