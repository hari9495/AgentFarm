import type { Metadata } from "next";
import { docsApiReferenceContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: docsApiReferenceContent.metadata.title,
    description: docsApiReferenceContent.metadata.description,
};

function EndpointCard({
    method,
    path,
    description,
    body,
    response,
}: {
    method: string;
    path: string;
    description: string;
    body?: string;
    response: string;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <span
                    className={`rounded px-2 py-0.5 text-xs font-bold font-mono ${
                        method === "GET"
                            ? "bg-green-100 text-green-700"
                            : method === "POST"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700"
                    }`}
                >
                    {method}
                </span>
                <code className="text-sm font-mono text-slate-700 dark:text-slate-300">{path}</code>
            </div>
            <div className="space-y-3 p-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
                {body ? (
                    <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Request body</p>
                        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs font-mono text-green-400">{body}</pre>
                    </div>
                ) : null}
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Response</p>
                    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs font-mono text-green-400">{response}</pre>
                </div>
            </div>
        </div>
    );
}

export default function ApiReferencePage() {
    return (
        <div>
            <div className="mb-10">
                <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                    {docsApiReferenceContent.hero.badge}
                </span>
                <h1 className="mt-2 mb-3 text-3xl font-extrabold">
                    <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                        {docsApiReferenceContent.hero.title}
                    </span>
                </h1>
                <p className="text-lg leading-relaxed text-slate-500">{docsApiReferenceContent.hero.description}</p>
            </div>

            <div className="space-y-12">
                <section id="auth" className="scroll-mt-24">
                    <h2 className="mb-4 text-xl font-bold text-slate-900">{docsApiReferenceContent.auth.title}</h2>
                    <p className="mb-4 leading-relaxed text-slate-600">{docsApiReferenceContent.auth.description}</p>
                    <div className="rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-300">
                        {docsApiReferenceContent.auth.code.map((line, index) => (
                            <p key={index} className={line.startsWith("#") ? "text-slate-400" : undefined}>
                                {line || "\u00a0"}
                            </p>
                        ))}
                    </div>
                    <p className="mt-3 text-sm text-slate-500">{docsApiReferenceContent.auth.aside}</p>
                </section>

                <section className="border-t border-slate-100 pt-10 dark:border-slate-800">
                    <h2 className="mb-6 text-xl font-bold text-slate-900">
                        <span className="bg-gradient-to-r from-slate-800 to-blue-700 bg-clip-text text-transparent">
                            {docsApiReferenceContent.workersTitle}
                        </span>
                    </h2>
                    <div className="space-y-6">
                        {docsApiReferenceContent.workersEndpoints.map((endpoint) => (
                            <EndpointCard key={`${endpoint.method}${endpoint.path}`} {...endpoint} />
                        ))}
                    </div>
                </section>

                <section className="border-t border-slate-100 pt-10 dark:border-slate-800">
                    <h2 className="mb-6 text-xl font-bold text-slate-900">
                        <span className="bg-gradient-to-r from-slate-800 to-violet-700 bg-clip-text text-transparent">
                            {docsApiReferenceContent.tasksTitle}
                        </span>
                    </h2>
                    <div className="space-y-6">
                        {docsApiReferenceContent.taskEndpoints.map((endpoint) => (
                            <EndpointCard key={`${endpoint.method}${endpoint.path}`} {...endpoint} />
                        ))}
                    </div>
                </section>

                <section id="webhooks" className="scroll-mt-24 border-t border-slate-100 pt-10 dark:border-slate-800">
                    <h2 className="mb-4 text-xl font-bold text-slate-900">
                        <span className="bg-gradient-to-r from-slate-800 to-emerald-700 bg-clip-text text-transparent">
                            {docsApiReferenceContent.webhooks.title}
                        </span>
                    </h2>
                    <p className="mb-4 leading-relaxed text-slate-600">{docsApiReferenceContent.webhooks.description}</p>
                    <div className="rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-300">
                        <p className="text-slate-400"># Example webhook payload</p>
                        <pre className="mt-2 text-green-400">
                            {docsApiReferenceContent.webhooks.code.join("\n")}
                        </pre>
                    </div>
                    <p className="mt-3 text-sm text-slate-500">{docsApiReferenceContent.webhooks.aside}</p>
                </section>
            </div>
        </div>
    );
}
