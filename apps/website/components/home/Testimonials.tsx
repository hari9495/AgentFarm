"use client";

import { motion } from "motion/react";
import { Quote, Star } from "lucide-react";
import { homeMarketingContent } from "@/lib/marketing-content";

const ease = [0.22, 1, 0.36, 1] as const;

function TestimonialCard({ testimonial, delay }: { testimonial: (typeof homeMarketingContent.testimonials.items)[number]; delay: number }) {
    return (
        <motion.article
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.46, delay, ease }}
            className="flex flex-col gap-4 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-6"
        >
            <Quote className="h-5 w-5 text-[var(--ash)]" />
            <p className="w-fit rounded-full border border-[#57c1ff]/20 bg-[#57c1ff]/10 px-2.5 py-1 text-xs font-semibold text-[var(--accent-blue)]">
                {testimonial.metric}
            </p>
            <div className="flex gap-0.5">
                {Array.from({ length: testimonial.stars }).map((_, index) => (
                    <Star key={index} className="h-3.5 w-3.5 fill-[#ffc533] text-[#ffc533]" />
                ))}
            </div>
            <p className="flex-1 text-sm leading-relaxed text-[var(--body-color)]">
                &ldquo;{testimonial.quote}&rdquo;
            </p>
            <div className="flex items-center gap-3 border-t border-[var(--hairline)] pt-4">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white ${testimonial.color}`}>
                    {testimonial.initials}
                </div>
                <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{testimonial.name}</p>
                    <p className="text-xs text-[var(--ash)]">{testimonial.role}</p>
                </div>
            </div>
        </motion.article>
    );
}

export default function Testimonials() {
    const content = homeMarketingContent.testimonials;
    const columns = [
        content.items.slice(0, 2),
        content.items.slice(2, 4),
        content.items.slice(4),
    ];

    return (
        <section className="border-t border-[var(--hairline)] bg-[var(--surface)] py-24" id="testimonials">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.48, ease }}
                    className="mx-auto mb-14 max-w-2xl text-center"
                >
                    <span className="chip chip-accent mb-4 text-xs">{content.eyebrow}</span>
                    <h2 className="text-[clamp(1.8rem,3.5vw,2.6rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                        {content.title}
                    </h2>
                    <p className="mt-4 leading-relaxed text-[var(--mute)]">{content.description}</p>
                </motion.div>

                <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
                    <div className="flex flex-col gap-5">
                        {columns[0].map((testimonial, index) => <TestimonialCard key={testimonial.name} testimonial={testimonial} delay={index * 0.08} />)}
                    </div>
                    <div className="flex flex-col gap-5 md:mt-8 lg:mt-8">
                        {columns[1].map((testimonial, index) => <TestimonialCard key={testimonial.name} testimonial={testimonial} delay={0.12 + index * 0.08} />)}
                    </div>
                    <div className="flex flex-col gap-5 md:col-span-2 lg:col-span-1">
                        {columns[2].map((testimonial, index) => <TestimonialCard key={testimonial.name} testimonial={testimonial} delay={0.24 + index * 0.08} />)}
                    </div>
                </div>
            </div>
        </section>
    );
}
