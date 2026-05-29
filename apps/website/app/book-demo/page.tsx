"use client";

import { useState } from "react";
import { Calendar, Clock, Video, CheckCircle2, ArrowRight } from "lucide-react";

export default function BookDemoPage() {
    const [submitted, setSubmitted] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });

    const timeSlots = ["9:00 AM ET", "10:00 AM ET", "11:00 AM ET", "1:00 PM ET", "2:00 PM ET", "3:00 PM ET", "4:00 PM ET"];
    const [selectedTime, setSelectedTime] = useState("");

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitted(true);
    }

    const whatToExpect = [
        "See a live worker complete a real task end-to-end",
        "Ask questions about approval gates and evidence capture",
        "Get help scoping the right starting workflow for your team",
        "Understand pricing and rollout options",
    ];

    if (submitted) {
        return (
            <div style={{ background: "#ffffff" }}>
                <section className="af-tile af-tile-white text-center" style={{ paddingTop: 120, paddingBottom: 120 }}>
                    <div className="af-container-narrow">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(0,102,204,0.1)" }}>
                            <CheckCircle2 className="w-7 h-7 text-[#0066cc]" />
                        </div>
                        <h1 className="font-semibold text-[#1d1d1f] mb-4" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.028em" }}>
                            You&apos;re confirmed
                        </h1>
                        <p className="text-[17px] text-[#6e6e73] max-w-md mx-auto" style={{ lineHeight: 1.47 }}>
                            We&apos;ve received your request and will send a calendar invite to <strong>{form.email}</strong> within a few minutes.
                        </p>
                        <p className="mt-4 text-[15px] text-[#aeaeb2]">
                            Need to reschedule? Reply to the confirmation email.
                        </p>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div style={{ background: "#ffffff" }}>

            {/* Hero */}
            <section className="af-tile af-tile-white" style={{ paddingTop: 80, paddingBottom: 64 }}>
                <div className="af-container-narrow text-center">
                    <p className="af-eyebrow mb-4">Book a Demo</p>
                    <h1 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}>
                        See a governed AI worker in action
                    </h1>
                    <p className="mt-5 text-[17px] text-[#424245] max-w-md mx-auto" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        30 minutes with the AgentFarm team. We&apos;ll show a live worker, answer your governance questions, and help scope the right starting workflow.
                    </p>
                </div>
            </section>

            {/* Form + sidebar — parchment */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 0, paddingBottom: 80 }}>
                <div className="af-container">
                    <div className="grid lg:grid-cols-[1fr_1.5fr] gap-12 items-start">

                        {/* What to expect */}
                        <div>
                            <div className="rounded-[18px] p-6 mb-4" style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Video className="w-5 h-5 text-[#0066cc]" />
                                    <span className="font-semibold text-[15px] text-[#1d1d1f]">What to expect</span>
                                </div>
                                <ul className="space-y-2.5">
                                    {whatToExpect.map((item) => (
                                        <li key={item} className="flex items-start gap-2">
                                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#0066cc]" />
                                            <span className="text-[14px] text-[#424245]" style={{ lineHeight: 1.5 }}>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="rounded-[18px] p-5 flex items-center gap-3" style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}>
                                <Clock className="w-5 h-5 text-[#6e6e73] shrink-0" />
                                <div>
                                    <p className="text-[14px] font-semibold text-[#1d1d1f]">30 minutes, video call</p>
                                    <p className="text-[13px] text-[#6e6e73]">Google Meet or Zoom — your choice</p>
                                </div>
                            </div>
                        </div>

                        {/* Booking form */}
                        <div className="rounded-[18px] p-7" style={{ background: "#ffffff", border: "1px solid #d2d2d7" }}>
                            <h2 className="font-semibold text-[#1d1d1f] mb-6" style={{ fontSize: "1.2rem", letterSpacing: "-0.018em" }}>
                                Schedule your session
                            </h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[13px] font-semibold text-[#1d1d1f] mb-1.5">Full name</label>
                                        <input
                                            type="text"
                                            required
                                            value={form.name}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                            className="w-full rounded-[11px] px-4 py-2.5 text-[15px] text-[#1d1d1f] outline-none transition-colors"
                                            style={{ border: "1px solid #d2d2d7", background: "#f5f5f7" }}
                                            onFocus={(e) => (e.currentTarget.style.borderColor = "#0066cc")}
                                            onBlur={(e) => (e.currentTarget.style.borderColor = "#d2d2d7")}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-semibold text-[#1d1d1f] mb-1.5">Work email</label>
                                        <input
                                            type="email"
                                            required
                                            value={form.email}
                                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                                            className="w-full rounded-[11px] px-4 py-2.5 text-[15px] text-[#1d1d1f] outline-none transition-colors"
                                            style={{ border: "1px solid #d2d2d7", background: "#f5f5f7" }}
                                            onFocus={(e) => (e.currentTarget.style.borderColor = "#0066cc")}
                                            onBlur={(e) => (e.currentTarget.style.borderColor = "#d2d2d7")}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-semibold text-[#1d1d1f] mb-1.5">Company</label>
                                    <input
                                        type="text"
                                        value={form.company}
                                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                                        className="w-full rounded-[11px] px-4 py-2.5 text-[15px] text-[#1d1d1f] outline-none transition-colors"
                                        style={{ border: "1px solid #d2d2d7", background: "#f5f5f7" }}
                                        onFocus={(e) => (e.currentTarget.style.borderColor = "#0066cc")}
                                        onBlur={(e) => (e.currentTarget.style.borderColor = "#d2d2d7")}
                                    />
                                </div>

                                {/* Time slot selector */}
                                <div>
                                    <label className="block text-[13px] font-semibold text-[#1d1d1f] mb-2">
                                        <Calendar className="inline w-3.5 h-3.5 mr-1" />
                                        Preferred time (ET)
                                    </label>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {timeSlots.map((slot) => (
                                            <button
                                                key={slot}
                                                type="button"
                                                onClick={() => setSelectedTime(slot)}
                                                className="rounded-full py-2 text-[13px] font-medium transition-colors cursor-pointer"
                                                style={{
                                                    border: selectedTime === slot ? "1px solid #0066cc" : "1px solid #d2d2d7",
                                                    background: selectedTime === slot ? "rgba(0,102,204,0.08)" : "#f5f5f7",
                                                    color: selectedTime === slot ? "#0066cc" : "#6e6e73",
                                                }}
                                            >
                                                {slot}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[13px] font-semibold text-[#1d1d1f] mb-1.5">What would you like to explore? (optional)</label>
                                    <textarea
                                        rows={3}
                                        value={form.message}
                                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                                        className="w-full rounded-[11px] px-4 py-2.5 text-[15px] text-[#1d1d1f] outline-none transition-colors resize-none"
                                        style={{ border: "1px solid #d2d2d7", background: "#f5f5f7" }}
                                        onFocus={(e) => (e.currentTarget.style.borderColor = "#0066cc")}
                                        onBlur={(e) => (e.currentTarget.style.borderColor = "#d2d2d7")}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="w-full rounded-full py-3 text-[17px] font-medium text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
                                    style={{ background: "#0066cc" }}
                                    onMouseOver={(e) => (e.currentTarget.style.background = "#0071e3")}
                                    onMouseOut={(e) => (e.currentTarget.style.background = "#0066cc")}
                                >
                                    Book my session
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                                <p className="text-center text-[12px] text-[#aeaeb2]">
                                    We&apos;ll confirm with a calendar invite within minutes.
                                </p>
                            </form>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
