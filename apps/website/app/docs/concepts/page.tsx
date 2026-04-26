import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How Robots Work - AgentFarm Docs",
  description:
    "Understand AgentFarm's task lifecycle, Robot sandboxing, and memory model.",
};

export default function ConceptsPage() {
  return (
    <div>
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full mb-4">
          Core Concepts
        </span>
        <h1 className="mt-2 text-3xl font-extrabold mb-3">
          <span className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">How Robots</span>{" "}
          <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Work</span>
        </h1>
        <p className="text-slate-500 text-lg leading-relaxed">
          A mental model for understanding AgentFarm&apos;s task lifecycle,
          execution environment, and safety guarantees.
        </p>
      </div>

      <div className="space-y-12">
        {/* Task Lifecycle */}
        <section id="tasks" className="scroll-mt-24">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Task Lifecycle
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Every interaction with a Robot follows the same five-stage
            lifecycle:
          </p>
          <div className="space-y-3">
            {[
              {
                stage: "Receive",
                description:
                  "A task is assigned via the dashboard, Slack, or API. The Robot acknowledges receipt within seconds.",
              },
              {
                stage: "Plan",
                description:
                  "The Robot reads the relevant codebase context, creates a task plan, and checks it against your workspace rules.",
              },
              {
                stage: "Execute",
                description:
                  "Code is written in an isolated container. The Robot runs your test suite and lints incrementally.",
              },
              {
                stage: "Review",
                description:
                  "A pull request is opened on a new branch. The Robot self-reviews against common error patterns before marking it ready.",
              },
              {
                stage: "Iterate",
                description:
                  "If reviewers leave comments, the Robot reads them, makes the requested changes, and pushes an update commit.",
              },
            ].map(({ stage, description }, i) => {
              const stageGradients = [
                "from-blue-500 to-cyan-500",
                "from-violet-500 to-blue-500",
                "from-emerald-500 to-teal-500",
                "from-orange-500 to-amber-500",
                "from-pink-500 to-rose-500",
              ];
              return (
                <div key={stage} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${stageGradients[i] ?? "from-blue-500 to-cyan-500"} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                      {i + 1}
                    </div>
                    {i < 4 && (
                      <div className="w-px flex-1 bg-slate-200 mt-1" />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className="font-semibold text-slate-900 text-sm">
                      {stage}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">
                      {description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Sandboxing */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-10">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Execution Sandbox
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Each task runs in a fully isolated, ephemeral container:
          </p>
          <ul className="space-y-3">
            {[
              "Dedicated container per task - no shared process state between Robots.",
              "No outbound internet access except to your explicitly approved integrations (GitHub, Slack, etc.).",
              "Container is destroyed immediately after the PR is opened - no persistent state.",
              "Your source code is cloned fresh for each task and deleted on container teardown.",
              "Execution is time-bounded: tasks exceeding 30 minutes are paused and flagged for human review.",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-sm text-slate-600">
                <span className="text-emerald-500 mt-0.5 shrink-0 font-bold">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Memory Model */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-10">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Robot Memory
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Robots maintain three memory tiers:
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                title: "Workspace Context",
                color: "border-blue-200 bg-blue-50",
                items: [
                  "Full codebase read access",
                  "Repo conventions learned on first run",
                  "Persisted across all tasks",
                ],
              },
              {
                title: "Task Context",
                color: "border-purple-200 bg-purple-50",
                items: [
                  "Files modified in this task",
                  "Test results and lint output",
                  "Cleared on task completion",
                ],
              },
              {
                title: "Conversation History",
                color: "border-green-200 bg-green-50",
                items: [
                  "PR review comments",
                  "Slack thread context",
                  "Retained for 30 days",
                ],
              },
            ].map(({ title, color, items }) => (
              <div
                key={title}
                className={`p-4 rounded-xl border ${color}`}
              >
                <p className="font-semibold text-slate-900 text-sm mb-3">
                  {title}
                </p>
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li key={item} className="text-xs text-slate-600 flex gap-2">
                      <span className="text-slate-400">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Workspace Rules */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-10">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Workspace Rules
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            You can define workspace-level rules that govern all Robot
            behaviour. Add a{" "}
            <code className="bg-slate-100 dark:bg-slate-800 dark:text-blue-400 px-1.5 py-0.5 rounded text-sm font-mono text-blue-700">
              .AgentFarm/rules.md
            </code>{" "}
            file in your repository root:
          </p>
          <div className="bg-slate-900 text-slate-300 rounded-lg p-4 font-mono text-sm overflow-x-auto">
            <p className="text-slate-400"># .AgentFarm/rules.md</p>
            <br />
            <p>## Code style</p>
            <p>- Use named exports, never default exports</p>
            <p>- Max function length: 40 lines</p>
            <p>- All async functions must have error handling</p>
            <br />
            <p>## Testing</p>
            <p>- Min 80% coverage on new files</p>
            <p>- Use vitest, not jest</p>
            <br />
            <p>## Off-limits</p>
            <p>- Never modify files in /legacy/</p>
            <p>- Never push to main directly</p>
          </div>
        </section>
      </div>
    </div>
  );
}


