import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quickstart - AgentFarm Docs",
  description: "Deploy your first AgentFarm AI worker in under 10 minutes.",
};

const steps = [
  {
    n: "01",
    title: "Create your account",
    content: (
      <>
        <p>
          Sign up at{" "}
          <code className="bg-slate-100 dark:bg-slate-800 dark:text-blue-400 px-1.5 py-0.5 rounded text-sm font-mono text-blue-700">
            app.AgentFarm.ai
          </code>{" "}
          with your work email. No credit card required for the 14-day trial.
        </p>
        <p className="mt-3">
          Select your team size and primary use case during onboarding. This
          helps the platform configure sensible defaults for your first Robot.
        </p>
      </>
    ),
  },
  {
    n: "02",
    id: "github",
    title: "Connect GitHub",
    content: (
      <>
        <p>
          From the{" "}
          <strong className="text-slate-800">Integrations</strong> tab, click{" "}
          <strong className="text-slate-800">Add GitHub</strong>. You&apos;ll
          be redirected to GitHub OAuth.
        </p>
        <div className="mt-4 bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-sm">
          <p className="text-slate-400"># Grant access to specific repos only</p>
          <p>Permissions requested:</p>
          <p className="ml-4">? Read/write access to selected repositories</p>
          <p className="ml-4">? Pull request creation and management</p>
          <p className="ml-4">? Actions / CI status read</p>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          You can select individual repositories or all repositories in your
          organisation. You can change this at any time from GitHub Settings,
          then Applications.
        </p>
      </>
    ),
  },
  {
    n: "03",
    id: "slack",
    title: "Install the Slack bot (optional)",
    content: (
      <>
        <p>
          From <strong className="text-slate-800">Integrations</strong>, click{" "}
          <strong className="text-slate-800">Add to Slack</strong>. Install the
          AgentFarm app to your workspace.
        </p>
        <div className="mt-4 bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-sm">
          <p className="text-slate-400"># Invite the bot to a channel</p>
          <p>/invite @AgentFarm</p>
          <br />
          <p className="text-slate-400"># Assign a task to a Robot</p>
          <p>@AgentFarm assign fix the login timeout bug to @backend-dev</p>
        </div>
      </>
    ),
  },
  {
    n: "04",
    title: "Hire your first Robot",
    content: (
      <>
        <p>
          Go to <strong className="text-slate-800">Robots, then Hire</strong> and
          select a role. Start with{" "}
          <strong className="text-slate-800">Backend Developer</strong> if
          you&apos;re unsure.
        </p>
        <p className="mt-3">
          Give your Robot a name, select which repositories it has access to,
          and set an optional monthly task budget. Click{" "}
          <strong className="text-slate-800">Deploy Robot</strong>.
        </p>
        <p className="mt-3">
          Within 60 seconds, your Robot will appear in the Slack channel (if
          connected) and introduce itself.
        </p>
      </>
    ),
  },
  {
    n: "05",
    title: "Assign your first task",
    content: (
      <>
        <p>From the dashboard, open your Robot and click:</p>
        <div className="mt-4 bg-slate-900 text-green-400 rounded-lg p-4 font-mono text-sm">
          <p className="text-slate-400"># Example task</p>
          <p>
            Add input validation to the /api/users endpoint. Email field must
            match RFC 5322. Return 400 with a descriptive error message for
            invalid inputs. Add unit tests.
          </p>
        </div>
        <p className="mt-3">
          The Robot will acknowledge the task, create a branch, write the code,
          run the tests, and open a pull request - typically within 4-12
          minutes for a task of this scope.
        </p>
      </>
    ),
  },
];

export default function QuickstartPage() {
  return (
    <div>
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full mb-4">
          Getting Started
        </span>
        <h1 className="mt-2 text-3xl font-extrabold mb-3">
          <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Quickstart</span>
        </h1>
        <p className="text-slate-500 text-lg leading-relaxed">
          Deploy your first AI worker in under 10 minutes.
        </p>
      </div>

      <div className="space-y-10">
        {steps.map(({ n, id, title, content }, i) => {
          const stepGradients = [
            "from-blue-500 to-cyan-500",
            "from-violet-500 to-blue-500",
            "from-emerald-500 to-teal-500",
            "from-orange-500 to-amber-500",
            "from-pink-500 to-rose-500",
          ];
          return (
            <div
              key={n}
              id={id}
              className="flex gap-6 pb-10 border-b border-slate-100 dark:border-slate-800 last:border-0 scroll-mt-24"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stepGradients[i] ?? "from-blue-500 to-cyan-500"} text-white font-bold text-sm flex items-center justify-center shrink-0 mt-1`}>
                {n}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-slate-900 mb-4">{title}</h2>
                <div className="text-slate-600 leading-relaxed">{content}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 bg-gradient-to-br from-emerald-50 to-blue-50/50 border border-emerald-100 rounded-2xl p-6">
        <p className="font-semibold text-slate-900 mb-2">
          Your Robot is deployed!
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Next: read{" "}
          <a href="/docs/concepts" className="text-blue-600 hover:underline">
            How Robots Work
          </a>{" "}
          to understand the task lifecycle, or browse the{" "}
          <a href="/docs/api-reference" className="text-blue-600 hover:underline">
            REST API
          </a>{" "}
          to automate task assignment programmatically.
        </p>
      </div>
    </div>
  );
}


