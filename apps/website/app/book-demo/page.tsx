import type { Metadata } from "next";
import { Calendar, Clock, Video, MessageSquare, CheckCircle } from "lucide-react";


export const metadata: Metadata = {
    title: "Book a Discovery Call — AgentFarm",
    description:
        "Schedule a 30-minute call with a AgentFarm engineer to configure your first AI worker.",
};

const TIME_SLOTS = [
    "9:00 AM ET",
    "9:30 AM ET",
    "10:00 AM ET",
    "10:30 AM ET",
    "11:00 AM ET",
    "11:30 AM ET",
    "1:00 PM ET",
    "1:30 PM ET",
    "2:00 PM ET",
    "2:30 PM ET",
    "3:00 PM ET",
    "3:30 PM ET",
    "4:00 PM ET",
    "4:30 PM ET",
];

// Generate the next 10 weekdays from today
function getWeekdays(count: number): Date[] {
    const days: Date[] = [];
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1); // start tomorrow
    while (days.length < count) {
        if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }
    return days;
}

const WEEKDAYS = getWeekdays(10);

const callDetails = [
    { icon: Clock, text: "30 minutes", gradient: "from-blue-500 to-cyan-500" },
    { icon: Video, text: "Google Meet or Zoom (your choice)", gradient: "from-violet-500 to-blue-500" },
    { icon: MessageSquare, text: "Live Q&A with a founding engineer", gradient: "from-emerald-500 to-teal-500" },
    { icon: Calendar, text: "First Robot deployed same session", gradient: "from-orange-500 to-amber-500" },
];

export default function BookDemoPage() {
    return (
        <div className="min-h-screen">
            {/* Gradient top bar */}
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="grid lg:grid-cols-5 gap-16 items-start">
                    {/* Left panel (2/5) */}
                    <div className="lg:col-span-2 lg:sticky lg:top-24">
                        <div className="chip chip-accent mb-6">
                            Step 2 of the onboarding flow
                        </div>
                        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] leading-tight mb-4">
                            30-min{" "}
                            <span className="bg-gradient-to-r from-[var(--accent-blue)] to-purple-400 bg-clip-text text-transparent">Discovery Call</span>
                        </h1>
                        <p className="text-[var(--mute)] leading-relaxed mb-8">
                            A AgentFarm engineer will walk you through your stack, confirm your
                            bot roles, and have your first Robot opening PRs within the hour.
                        </p>

                        <div className="space-y-3 mb-8">
                            {callDetails.map(({ icon: Icon, text, gradient }) => (
                                <div key={text} className="flex items-center gap-3 text-sm text-[var(--body-color)]">
                                    <div className={`w-9 h-9 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center shrink-0`}>
                                        <Icon className="w-4 h-4 text-white" />
                                    </div>
                                    {text}
                                </div>
                            ))}
                        </div>

                        <div className="p-5 bg-[var(--surface-el)] border border-[var(--hairline)] rounded-2xl">
                            <p className="text-xs font-semibold text-[var(--ash)] uppercase tracking-wider mb-3">
                                What we&apos;ll cover
                            </p>
                            <ul className="space-y-2">
                                {[
                                    "Review your stack & pain points",
                                    "Pick 1 bot role to start with",
                                    "Connect to your GitHub / GitLab",
                                    "Watch the first task get executed live",
                                    "Answer any integration questions",
                                ].map((item) => (
                                    <li key={item} className="flex items-start gap-2 text-sm text-[var(--body-color)]">
                                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Team photo */}
                        <div className="rounded-2xl overflow-hidden mt-6">
                            <img
                                src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=700&q=80"
                                alt="AgentFarm founding team on a video call"
                                className="w-full h-40 object-cover"
                                loading="lazy"
                            />
                        </div>
                    </div>

                    {/* Right panel (3/5) — booking widget */}
                    <div className="lg:col-span-3">
                        <BookingWidget weekdays={WEEKDAYS} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Client-side booking widget extracted as a server-renderable shell
// (actual interactivity via inline script — avoids "use client" on the page)
function BookingWidget({ weekdays }: { weekdays: Date[] }) {
    const fmt = (d: Date) =>
        d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    return (
        <div className="bg-[var(--surface-card)] border border-[var(--hairline)] rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-[var(--hairline)]">
                <h2 className="font-semibold text-[var(--ink)]">Select a date &amp; time</h2>
                <p className="text-xs text-[var(--ash)] mt-1">All times shown in Eastern Time (ET)</p>
            </div>

            {/* Day picker */}
            <div className="p-6 border-b border-[var(--hairline)]">
                <p className="text-xs font-semibold text-[var(--ash)] uppercase tracking-wider mb-3">
                    Available dates
                </p>
                <div className="grid grid-cols-5 gap-2">
                    {weekdays.map((d, i) => (
                        <label key={i} className="cursor-pointer">
                            <input type="radio" name="day" value={i} className="sr-only peer" defaultChecked={i === 0} />
                            <div className="text-center p-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface-el)] peer-checked:border-[var(--accent-blue)] peer-checked:bg-[var(--accent-blue)]/10 hover:border-[var(--ash)] transition-colors">
                                <p className="text-xs text-[var(--ash)]">
                                    {d.toLocaleDateString("en-US", { weekday: "short" })}
                                </p>
                                <p className="text-sm font-semibold text-[var(--ink)] mt-0.5">
                                    {d.getDate()}
                                </p>
                                <p className="text-xs text-[var(--ash)]">
                                    {d.toLocaleDateString("en-US", { month: "short" })}
                                </p>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {/* Time slot picker */}
            <div className="p-6 border-b border-[var(--hairline)]">
                <p className="text-xs font-semibold text-[var(--ash)] uppercase tracking-wider mb-3">
                    Available times
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {TIME_SLOTS.map((slot) => (
                        <label key={slot} className="cursor-pointer">
                            <input type="radio" name="time" value={slot} className="sr-only peer" />
                            <div className="text-center px-2 py-2.5 rounded-lg border border-[var(--hairline)] bg-[var(--surface-el)] text-sm text-[var(--mute)] peer-checked:border-[var(--accent-blue)] peer-checked:bg-[var(--accent-blue)]/10 peer-checked:text-[var(--accent-blue)] peer-checked:font-medium hover:border-[var(--ash)] transition-colors">
                                {slot}
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {/* Contact form */}
            <form
                action="/api/contact"
                method="POST"
                className="p-6 space-y-4"
            >
                <p className="text-xs font-semibold text-[var(--ash)] uppercase tracking-wider">
                    Your details
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--body-color)] mb-1.5">
                            Full name
                        </label>
                        <input
                            type="text"
                            name="name"
                            required
                            placeholder="Alex Rivera"
                            className="w-full px-3 py-2.5 text-sm border border-[var(--hairline)] rounded-lg bg-[var(--surface-el)] text-[var(--ink)] placeholder:text-[var(--ash)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] transition"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--body-color)] mb-1.5">
                            Work email
                        </label>
                        <input
                            type="email"
                            name="email"
                            required
                            placeholder="alex@company.com"
                            className="w-full px-3 py-2.5 text-sm border border-[var(--hairline)] rounded-lg bg-[var(--surface-el)] text-[var(--ink)] placeholder:text-[var(--ash)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] transition"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-[var(--body-color)] mb-1.5">
                        Anything to prepare? <span className="text-[var(--ash)] font-normal">(optional)</span>
                    </label>
                    <textarea
                        name="message"
                        rows={2}
                        placeholder="e.g. We use a monorepo with TypeScript and deploy on AWS…"
                        className="w-full px-3 py-2.5 text-sm border border-[var(--hairline)] rounded-lg bg-[var(--surface-el)] text-[var(--ink)] placeholder:text-[var(--ash)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] resize-none transition"
                    />
                </div>
                <button
                    type="submit"
                    className="w-full py-3 text-sm font-semibold bg-[var(--accent-blue)] text-[#07080a] rounded-lg hover:bg-[#8dd7ff] transition-colors cursor-pointer"
                >
                    Confirm Booking ?
                </button>
                <p className="text-xs text-[var(--ash)] text-center">
                    You&apos;ll receive a calendar invite with the meeting link immediately.
                </p>
            </form>

            {/* Dates displayed as aria labels for screen readers */}
            <div className="sr-only">
                {weekdays.map((d, i) => (
                    <span key={i}>{fmt(d)}</span>
                ))}
            </div>
        </div>
    );
}



