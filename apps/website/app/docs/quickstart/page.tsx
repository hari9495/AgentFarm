import type { Metadata } from "next";
import { docsQuickstartContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: docsQuickstartContent.metadata.title,
    description: docsQuickstartContent.metadata.description,
};

const stepGradients = [
    "from-blue-500 to-cyan-500",
    "from-violet-500 to-blue-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-amber-500",
    "from-pink-500 to-rose-500",
];

export default function QuickstartPage() {
    return (
        <div>
            <div className="mb-10">
                <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                    {docsQuickstartContent.hero.badge}
                </span>
                <h1 className="mt-2 mb-3 text-3xl font-extrabold">
                    <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                        {docsQuickstartContent.hero.title}
                    </span>
                </h1>
                <p className="text-lg leading-relaxed text-slate-500">
                    {docsQuickstartContent.hero.description}
                </p>
            </div>

            <div className="space-y-10">
                {docsQuickstartContent.steps.map((step, index) => (
                    <div
                        key={step.n}
                        id={"id" in step ? step.id : undefined}
                        className="flex gap-6 border-b border-slate-100 pb-10 last:border-0 dark:border-slate-800 scroll-mt-24"
                    >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${stepGradients[index] ?? stepGradients[0]} text-sm font-bold text-white`}>
                            {step.n}
                        </div>
                        <div className="flex-1">
                            <h2 className="mb-4 text-xl font-bold text-slate-900">{step.title}</h2>
                            <div className="space-y-3 text-slate-600">
                                {step.paragraphs.map((paragraph) => (
                                    <p key={paragraph} className="leading-relaxed">
                                        {paragraph}
                                    </p>
                                ))}
                            </div>
                            {step.code ? (
                                <div className="mt-4 rounded-lg bg-slate-900 p-4 font-mono text-sm text-green-400">
                                    {step.code.map((line, lineIndex) => (
                                        <p key={`${step.title}-${lineIndex}`} className={line.startsWith("#") ? "text-slate-400" : undefined}>
                                            {line || "\u00a0"}
                                        </p>
                                    ))}
                                </div>
                            ) : null}
                            {"aside" in step && step.aside ? <p className="mt-3 text-sm text-slate-500">{step.aside}</p> : null}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-10 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-blue-50/50 p-6">
                <p className="mb-2 font-semibold text-slate-900">{docsQuickstartContent.nextCard.title}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    {docsQuickstartContent.nextCard.description}
                </p>
            </div>
        </div>
    );
}
