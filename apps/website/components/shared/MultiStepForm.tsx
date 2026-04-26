"use client";
import { useState } from "react";
import { CheckCircle, ArrowLeft, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/cn";

type FormData = {
    name: string;
    email: string;
    jobRole: string;
    company: string;
    companySize: string;
    languages: string[];
    frameworks: string[];
    codeHost: string;
    engineeringHeadcount: string;
    painPoints: string[];
    botRoles: string[];
    botCount: string;
    timeline: string;
    budget: string;
    referral: string;
    extraNotes: string;
};

const INITIAL: FormData = {
    name: "",
    email: "",
    jobRole: "",
    company: "",
    companySize: "",
    languages: [],
    frameworks: [],
    codeHost: "",
    engineeringHeadcount: "",
    painPoints: [],
    botRoles: [],
    botCount: "",
    timeline: "",
    budget: "",
    referral: "",
    extraNotes: "",
};

const STEPS = ["About You", "Tech Stack", "Pain Points", "Trial Plan"];
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function CheckboxGroup({
    options,
    selected,
    onChange,
}: {
    options: string[];
    selected: string[];
    onChange: (v: string) => void;
}) {
    return (
        <div className="grid grid-cols-2 gap-2">
            {options.map((opt) => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(opt)}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all cursor-pointer",
                        selected.includes(opt)
                            ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                            : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    )}
                >
                    <span
                        className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
                            selected.includes(opt)
                                ? "bg-blue-600 border-blue-600"
                                : "border-slate-300"
                        )}
                    >
                        {selected.includes(opt) && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                                <path
                                    d="M2 5l2.5 2.5L8 3"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        )}
                    </span>
                    {opt}
                </button>
            ))}
        </div>
    );
}

function RadioGroup({
    options,
    value,
    onChange,
    cols = 2,
}: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
    cols?: 1 | 2 | 3;
}) {
    return (
        <div
            className={cn(
                "grid gap-2",
                cols === 1 && "grid-cols-1",
                cols === 2 && "grid-cols-2",
                cols === 3 && "grid-cols-3"
            )}
        >
            {options.map((opt) => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(opt)}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all cursor-pointer",
                        value === opt
                            ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                            : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    )}
                >
                    <span
                        className={cn(
                            "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                            value === opt ? "border-blue-600" : "border-slate-300"
                        )}
                    >
                        {value === opt && (
                            <span className="w-2 h-2 rounded-full bg-blue-600" />
                        )}
                    </span>
                    {opt}
                </button>
            ))}
        </div>
    );
}

export default function MultiStepForm() {
    const [step, setStep] = useState(0);
    const [data, setData] = useState<FormData>(INITIAL);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

    function set<K extends keyof FormData>(field: K, value: FormData[K]) {
        setData((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    }

    function toggle(
        field: "languages" | "frameworks" | "painPoints" | "botRoles",
        value: string
    ) {
        setData((prev) => {
            const arr = prev[field];
            return {
                ...prev,
                [field]: arr.includes(value)
                    ? arr.filter((v) => v !== value)
                    : [...arr, value],
            };
        });
    }

    function validateStep(): boolean {
        const errs: Partial<Record<keyof FormData, string>> = {};
        if (step === 0) {
            if (!data.name.trim()) errs.name = "Required";
            if (!data.email.trim() || !EMAIL_RE.test(data.email))
                errs.email = "Valid work email required";
            if (!data.company.trim()) errs.company = "Required";
            if (!data.companySize) errs.companySize = "Please select one";
        }
        if (step === 1) {
            if (!data.codeHost) errs.codeHost = "Please select one";
            if (!data.engineeringHeadcount)
                errs.engineeringHeadcount = "Please select one";
        }
        if (step === 2) {
            if (data.painPoints.length === 0) errs.painPoints = "Select at least one";
            if (data.botRoles.length === 0) errs.botRoles = "Select at least one";
            if (!data.botCount) errs.botCount = "Please select one";
        }
        if (step === 3) {
            if (!data.timeline) errs.timeline = "Please select one";
            if (!data.budget) errs.budget = "Please select one";
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }

    function next() {
        if (validateStep()) setStep((s) => s + 1);
    }

    async function submit() {
        if (!validateStep()) return;
        setLoading(true);
        try {
            const res = await fetch("/api/interest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                toast.error((json as { error?: string })?.error ?? "Something went wrong.");
                return;
            }
            setDone(true);
        } catch {
            toast.error("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    if (done) {
        return (
            <div className="text-center py-16 px-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">
                    You&apos;re on the list!
                </h2>
                <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
                    A AgentFarm team member will reach out within 1 business day to walk
                    you through your bot configuration and answer any questions.
                </p>
                <p className="mt-4 text-sm text-slate-400">
                    Check your inbox — we&apos;ll send a confirmation to{" "}
                    <strong className="text-slate-600">{data.email}</strong>
                </p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-lg mx-auto">
            {/* Progress bar */}
            <div className="mb-10">
                <div className="flex justify-between mb-2">
                    {STEPS.map((s, i) => (
                        <span
                            key={s}
                            className={cn(
                                "text-xs font-medium",
                                i === step
                                    ? "text-blue-600"
                                    : i < step
                                        ? "text-slate-500"
                                        : "text-slate-300"
                            )}
                        >
                            {s}
                        </span>
                    ))}
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-300"
                        style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                    />
                </div>
                <p className="text-right text-xs text-slate-400 mt-1">
                    Step {step + 1} of {STEPS.length}
                </p>
            </div>

            {/* -- Step 1: About You -- */}
            {step === 0 && (
                <div className="space-y-5">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-1">
                            Tell us about yourself
                        </h2>
                        <p className="text-sm text-slate-500">
                            We&apos;ll use this to personalise your onboarding call.
                        </p>
                    </div>

                    {(
                        [
                            { label: "Full name", field: "name" as const, type: "text", placeholder: "Alex Rivera" },
                            { label: "Work email", field: "email" as const, type: "email", placeholder: "alex@company.com" },
                            { label: "Company name", field: "company" as const, type: "text", placeholder: "Acme Corp" },
                        ] as const
                    ).map(({ label, field, type, placeholder }) => (
                        <div key={field}>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                {label}
                            </label>
                            <input
                                type={type}
                                value={data[field] as string}
                                onChange={(e) => set(field, e.target.value)}
                                placeholder={placeholder}
                                className={cn(
                                    "w-full px-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition",
                                    errors[field] ? "border-red-400" : "border-slate-200"
                                )}
                            />
                            {errors[field] && (
                                <p className="mt-1 text-xs text-red-500">{errors[field]}</p>
                            )}
                        </div>
                    ))}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Your role{" "}
                            <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <select
                            value={data.jobRole}
                            onChange={(e) => set("jobRole", e.target.value)}
                            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
                        >
                            <option value="">Select your role…</option>
                            {[
                                "CTO",
                                "VP Engineering",
                                "Engineering Manager",
                                "Tech Lead",
                                "Founder",
                                "Senior Developer",
                                "Other",
                            ].map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Company size
                        </label>
                        <RadioGroup
                            options={[
                                "1–10 people",
                                "11–50 people",
                                "51–200 people",
                                "201–500 people",
                                "500+ people",
                            ]}
                            value={data.companySize}
                            onChange={(v) => set("companySize", v)}
                        />
                        {errors.companySize && (
                            <p className="mt-1 text-xs text-red-500">{errors.companySize}</p>
                        )}
                    </div>
                </div>
            )}

            {/* -- Step 2: Tech Stack -- */}
            {step === 1 && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-1">
                            Your tech stack
                        </h2>
                        <p className="text-sm text-slate-500">
                            Helps us configure Robots that know your languages and tools.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Primary languages{" "}
                            <span className="text-slate-400 font-normal">
                                (select all that apply)
                            </span>
                        </label>
                        <CheckboxGroup
                            options={[
                                "TypeScript",
                                "JavaScript",
                                "Python",
                                "Go",
                                "Java",
                                "Ruby",
                                "Rust",
                                "PHP",
                                "C#",
                                "Other",
                            ]}
                            selected={data.languages}
                            onChange={(v) => toggle("languages", v)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Frameworks{" "}
                            <span className="text-slate-400 font-normal">
                                (select all that apply)
                            </span>
                        </label>
                        <CheckboxGroup
                            options={[
                                "React / Next.js",
                                "Node / Express",
                                "FastAPI / Django",
                                "Spring Boot",
                                "Rails",
                                "Laravel",
                                ".NET / C#",
                                "Other",
                            ]}
                            selected={data.frameworks}
                            onChange={(v) => toggle("frameworks", v)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Where is your code hosted?
                        </label>
                        <RadioGroup
                            options={[
                                "GitHub",
                                "GitLab",
                                "Bitbucket",
                                "Azure DevOps",
                                "Self-hosted",
                            ]}
                            value={data.codeHost}
                            onChange={(v) => set("codeHost", v)}
                        />
                        {errors.codeHost && (
                            <p className="mt-1 text-xs text-red-500">{errors.codeHost}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Engineering team size
                        </label>
                        <RadioGroup
                            options={[
                                "1–2 engineers",
                                "3–5 engineers",
                                "6–15 engineers",
                                "16–50 engineers",
                                "50+ engineers",
                            ]}
                            value={data.engineeringHeadcount}
                            onChange={(v) => set("engineeringHeadcount", v)}
                        />
                        {errors.engineeringHeadcount && (
                            <p className="mt-1 text-xs text-red-500">
                                {errors.engineeringHeadcount}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* -- Step 3: Pain Points -- */}
            {step === 2 && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-1">
                            What&apos;s slowing you down?
                        </h2>
                        <p className="text-sm text-slate-500">
                            We&apos;ll configure Robots to target your biggest bottlenecks.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Pain points{" "}
                            <span className="text-slate-400 font-normal">
                                (select all that apply)
                            </span>
                        </label>
                        <CheckboxGroup
                            options={[
                                "Ticket backlog growing",
                                "Slow code reviews",
                                "Low test coverage",
                                "Manual deployments",
                                "Security gaps",
                                "Repetitive boilerplate",
                                "Documentation debt",
                                "Tech debt pile-up",
                            ]}
                            selected={data.painPoints}
                            onChange={(v) => toggle("painPoints", v)}
                        />
                        {errors.painPoints && (
                            <p className="mt-1 text-xs text-red-500">{errors.painPoints}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Which AI workers do you need?{" "}
                            <span className="text-slate-400 font-normal">
                                (select all that apply)
                            </span>
                        </label>
                        <CheckboxGroup
                            options={[
                                "Backend Developer",
                                "Frontend Developer",
                                "QA Engineer",
                                "DevOps Engineer",
                                "Code Reviewer",
                                "Technical Writer",
                            ]}
                            selected={data.botRoles}
                            onChange={(v) => toggle("botRoles", v)}
                        />
                        {errors.botRoles && (
                            <p className="mt-1 text-xs text-red-500">{errors.botRoles}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            How many AI workers to start?
                        </label>
                        <RadioGroup
                            options={["1", "2–3", "4–5", "6–10", "10+"]}
                            value={data.botCount}
                            onChange={(v) => set("botCount", v)}
                            cols={3}
                        />
                        {errors.botCount && (
                            <p className="mt-1 text-xs text-red-500">{errors.botCount}</p>
                        )}
                    </div>
                </div>
            )}

            {/* -- Step 4: Trial Plan -- */}
            {step === 3 && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-1">
                            Let&apos;s plan your trial
                        </h2>
                        <p className="text-sm text-slate-500">
                            Almost there — when can we get started?
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            When do you want to start?
                        </label>
                        <RadioGroup
                            options={[
                                "Right now",
                                "Within 2 weeks",
                                "This quarter",
                                "Just exploring",
                            ]}
                            value={data.timeline}
                            onChange={(v) => set("timeline", v)}
                            cols={1}
                        />
                        {errors.timeline && (
                            <p className="mt-1 text-xs text-red-500">{errors.timeline}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Monthly budget range
                        </label>
                        <RadioGroup
                            options={[
                                "Under $500",
                                "$500 – $1,500",
                                "$1,500 – $3,000",
                                "$3,000 – $5,000",
                                "$5,000+",
                                "Not sure yet",
                            ]}
                            value={data.budget}
                            onChange={(v) => set("budget", v)}
                        />
                        {errors.budget && (
                            <p className="mt-1 text-xs text-red-500">{errors.budget}</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            How did you hear about AgentFarm?{" "}
                            <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={data.referral}
                            onChange={(e) => set("referral", e.target.value)}
                            placeholder="Twitter, a colleague, Google search…"
                            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Anything else?{" "}
                            <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                            value={data.extraNotes}
                            onChange={(e) => set("extraNotes", e.target.value)}
                            rows={3}
                            placeholder="Specific requirements, questions, or context…"
                            className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition"
                        />
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
                {step > 0 ? (
                    <button
                        type="button"
                        onClick={() => setStep((s) => s - 1)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>
                ) : (
                    <div />
                )}

                {step < STEPS.length - 1 ? (
                    <button
                        type="button"
                        onClick={next}
                        className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                        Next
                        <ArrowRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={submit}
                        disabled={loading}
                        className="px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                        {loading ? "Submitting…" : "Request Early Access"}
                    </button>
                )}
            </div>
        </div>
    );
}

