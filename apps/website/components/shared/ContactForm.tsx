"use client";
import { useState } from "react";
import toast from "react-hot-toast";

export default function ContactForm() {
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        const form = e.currentTarget;
        const data = new FormData(form);
        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: data.get("name"),
                    email: data.get("email"),
                    company: data.get("company"),
                    message: data.get("message"),
                }),
            });
            if (!res.ok) throw new Error();
            toast.success("Message sent! We'll reply within 1 business day.");
            form.reset();
        } catch {
            toast.error("Failed to send. Please email us directly at hello@AgentFarm.ai");
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-5">
                <div>
                    <label
                        htmlFor="name"
                        className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                        Name
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        placeholder="Your name"
                        className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                </div>
                <div>
                    <label
                        htmlFor="email"
                        className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                        Email
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        placeholder="you@company.com"
                        className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                </div>
            </div>

            <div>
                <label
                    htmlFor="company"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                    Company <span className="text-slate-400">(optional)</span>
                </label>
                <input
                    type="text"
                    id="company"
                    name="company"
                    placeholder="Company name"
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
            </div>

            <div>
                <label
                    htmlFor="message"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                    Message
                </label>
                <textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    placeholder="Tell us about your team and what you're trying to build..."
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition"
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
                {loading ? "Sending…" : "Send Message"}
            </button>
        </form>
    );
}

