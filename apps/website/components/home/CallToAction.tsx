"use client";

import { motion } from "framer-motion";
import WaitlistForm from "@/components/shared/WaitlistForm";

export default function CallToAction() {
    return (
        <section id="waitlist" className="relative py-24 overflow-hidden">

            <img
                src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1800&q=80"
                alt="Team collaborating around a product planning wall"
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
            />

            <div className="absolute inset-0 bg-slate-900/78" />

            <div
                className="absolute inset-0 opacity-[0.04]"
                style={{ backgroundImage: "radial-gradient(circle, #e2e8f0 1px, transparent 1px)", backgroundSize: "28px 28px" }}
            />

            <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600 rounded-full blur-3xl opacity-10 animate-float" />
            <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-600 rounded-full blur-3xl opacity-10 animate-float-delay" />

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <motion.h2
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45 }}
                    className="text-3xl sm:text-5xl font-extrabold text-white leading-tight"
                >
                    Build a High-Output Team
                    <br className="hidden sm:block" />
                    with Clear AI Role Ownership
                </motion.h2>
                <p className="mt-5 text-lg text-slate-400 max-w-xl mx-auto">
                    Start with the roles you need today, connect your workflow in minutes,
                    and scale only when you see measurable outcomes.
                </p>
                <div className="mt-10 max-w-md mx-auto">
                    <WaitlistForm />
                </div>
                <p className="mt-4 text-xs text-slate-500">
                    No spam. No credit card required. Unsubscribe anytime.
                </p>
                <p className="mt-6 text-sm text-slate-500">
                    Want full onboarding support?{" "}
                    <a href="/get-started" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
                        Apply for early access {"->"}
                    </a>
                </p>
            </div>
        </section>
    );
}

