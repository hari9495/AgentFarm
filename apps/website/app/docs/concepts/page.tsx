import type { Metadata } from "next";
import { docsConceptsContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: docsConceptsContent.metadata.title,
    description: docsConceptsContent.metadata.description,
};

const stageGradients = [
    "from-blue-500 to-cyan-500",
    "from-violet-500 to-blue-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-amber-500",
    "from-pink-500 to-rose-500",
];

export default function ConceptsPage() {
    return (
        <div>
            <div className="mb-10">
                <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                    {docsConceptsContent.hero.badge}
                </span>
                <h1 className="mt-2 mb-3 text-3xl font-extrabold">
                    <span className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                        {docsConceptsContent.hero.titleLead}
                    </span>{" "}
                    <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                        {docsConceptsContent.hero.titleAccent}
                    </span>
                </h1>
                <p className="text-lg leading-relaxed text-slate-500">
                    {docsConceptsContent.hero.description}
                </p>
            </div>

            <div className="space-y-12">
                <section id="tasks" className="scroll-mt-24">
                    <h2 className="mb-4 text-xl font-bold text-slate-900">{docsConceptsContent.taskLifecycleTitle}</h2>
                    <p className="mb-4 leading-relaxed text-slate-600">{docsConceptsContent.taskLifecycleDescription}</p>
                    <div className="space-y-3">
                        {docsConceptsContent.taskStages.map(({ stage, description }, index) => (
                            <div key={stage} className="flex gap-4">
                                <div className="flex flex-col items-center">
                                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${stageGradients[index] ?? stageGradients[0]} text-xs font-bold text-white`}>
                                        {index + 1}
                                    </div>
                                    {index < docsConceptsContent.taskStages.length - 1 ? <div className="mt-1 w-px flex-1 bg-slate-200" /> : null}
                                </div>
                                <div className="pb-4">
                                    <p className="text-sm font-semibold text-slate-900">{stage}</p>
                                    <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="border-t border-slate-100 pt-10 dark:border-slate-800">
                    <h2 className="mb-4 text-xl font-bold text-slate-900">{docsConceptsContent.sandboxTitle}</h2>
                    <p className="mb-4 leading-relaxed text-slate-600">{docsConceptsContent.sandboxDescription}</p>
                    <ul className="space-y-3">
                        {docsConceptsContent.sandboxItems.map((item) => (
                            <li key={item} className="flex gap-3 text-sm text-slate-600">
                                <span className="mt-0.5 shrink-0 font-bold text-emerald-500">+</span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="border-t border-slate-100 pt-10 dark:border-slate-800">
                    <h2 className="mb-4 text-xl font-bold text-slate-900">{docsConceptsContent.memoryTitle}</h2>
                    <p className="mb-4 leading-relaxed text-slate-600">{docsConceptsContent.memoryDescription}</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {docsConceptsContent.memoryTiers.map(({ title, color, items }) => (
                            <div key={title} className={`rounded-xl border p-4 ${color}`}>
                                <p className="mb-3 text-sm font-semibold text-slate-900">{title}</p>
                                <ul className="space-y-1.5">
                                    {items.map((item) => (
                                        <li key={item} className="flex gap-2 text-xs text-slate-600">
                                            <span className="text-slate-400">•</span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="border-t border-slate-100 pt-10 dark:border-slate-800">
                    <h2 className="mb-4 text-xl font-bold text-slate-900">{docsConceptsContent.rulesTitle}</h2>
                    <p className="mb-4 leading-relaxed text-slate-600">{docsConceptsContent.rulesDescription}</p>
                    <div className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-300">
                        {docsConceptsContent.rulesCode.map((line, index) => (
                            <p key={index} className={line.startsWith("#") ? "text-slate-400" : undefined}>
                                {line || "\u00a0"}
                            </p>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
