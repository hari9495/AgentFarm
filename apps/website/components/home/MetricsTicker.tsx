"use client";

const roles = [
    "Engineering",
    "Sales",
    "Marketing",
    "Customer Support",
    "Operations",
    "Finance",
    "Legal",
    "HR",
    "QA & Testing",
    "DevOps",
    "Content",
    "Product",
    "Recruiting",
    "Data Analysis",
    "Customer Success",
    "Project Management",
    "Technical Writing",
    "Full Stack Dev",
];

const allRoles = [...roles, ...roles];

export default function MetricsTicker() {
    return (
        <section className="bg-[var(--canvas)] border-y border-[var(--hairline)] py-4 overflow-hidden">
            <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[var(--canvas)] to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[var(--canvas)] to-transparent z-10 pointer-events-none" />
                <div className="flex animate-marquee w-max gap-0">
                    {allRoles.map((role, i) => (
                        <span key={i} className="shrink-0 whitespace-nowrap flex items-center">
                            <span className="text-sm font-medium text-[var(--mute)] px-4">{role}</span>
                            <span className="w-1 h-1 rounded-full bg-[var(--hairline)] shrink-0" />
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}

