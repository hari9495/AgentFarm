import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REST API Reference - AgentFarm Docs",
  description:
    "AgentFarm REST API reference - authenticate, manage workers and tasks programmatically.",
};

export default function ApiReferencePage() {
  return (
    <div>
      <div className="mb-10">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full mb-4">
          Reference
        </span>
        <h1 className="mt-2 text-3xl font-extrabold mb-3">
          <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">REST API</span>
        </h1>
        <p className="text-slate-500 text-lg leading-relaxed">
          Programmatically manage Robots, tasks, and workspace settings.
        </p>
      </div>

      <div className="space-y-12">
        {/* Base URL */}
        <section id="auth" className="scroll-mt-24">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            Authentication
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            All API requests require a bearer token. Generate one from{" "}
            <strong className="text-slate-800">
              Settings, then API Keys
            </strong>
            .
          </p>
          <div className="bg-slate-900 text-slate-300 rounded-lg p-4 font-mono text-sm">
            <p className="text-slate-400">
              # Base URL
            </p>
            <p>https://api.AgentFarm.ai/v1</p>
            <br />
            <p className="text-slate-400"># Authentication header</p>
            <p>Authorization: Bearer bf_live_xxxxxxxxxxxxxxxxxxxx</p>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Keep your API keys secret. Rotate them from the dashboard if
            compromised. Keys are tied to a workspace - not a user account.
          </p>
        </section>

        {/* Workers API */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-10">
          <h2 className="text-xl font-bold text-slate-900 mb-6"><span className="bg-gradient-to-r from-slate-800 to-blue-700 bg-clip-text text-transparent">Workers API</span></h2>
          <div className="space-y-6">
            {[
              {
                method: "GET",
                path: "/workers",
                description: "List all deployed Robots in your workspace.",
                response: `{ "workers": [{ "id": "wkr_01", "name": "Rex", "role": "backend-dev", "status": "idle" }] }`,
              },
              {
                method: "POST",
                path: "/workers",
                description: "Deploy a new Robot.",
                body: `{ "name": "Rex", "role": "backend-dev", "repo_ids": ["repo_123"] }`,
                response: `{ "worker": { "id": "wkr_01", "status": "provisioning" } }`,
              },
              {
                method: "DELETE",
                path: "/workers/:id",
                description: "Retire a Robot. In-flight tasks are completed first.",
                response: `{ "success": true }`,
              },
            ].map(({ method, path, description, body, response }) => (
              <div
                key={path + method}
                className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${method === "GET"
                      ? "bg-green-100 text-green-700"
                      : method === "POST"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-red-100 text-red-700"
                      }`}
                  >
                    {method}
                  </span>
                  <code className="text-sm font-mono text-slate-700 dark:text-slate-300">
                    {path}
                  </code>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
                  {body && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        Request body
                      </p>
                      <pre className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                        {body}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Response
                    </p>
                    <pre className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                      {response}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tasks API */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-10">
          <h2 className="text-xl font-bold text-slate-900 mb-6"><span className="bg-gradient-to-r from-slate-800 to-violet-700 bg-clip-text text-transparent">Tasks API</span></h2>
          <div className="space-y-6">
            {[
              {
                method: "POST",
                path: "/tasks",
                description: "Assign a new task to a Robot.",
                body: `{ "worker_id": "wkr_01", "repo_id": "repo_123", "description": "Add rate limiting to POST /api/users. 5 req/minute per IP." }`,
                response: `{ "task": { "id": "tsk_01", "status": "queued", "estimated_completion": "2026-03-13T12:30:00Z" } }`,
              },
              {
                method: "GET",
                path: "/tasks/:id",
                description: "Get current status and output of a task.",
                response: `{ "task": { "id": "tsk_01", "status": "in_progress", "pr_url": null, "progress": 0.4 } }`,
              },
              {
                method: "POST",
                path: "/tasks/:id/cancel",
                description:
                  "Cancel a queued or in-progress task. The branch is preserved.",
                response: `{ "success": true }`,
              },
            ].map(({ method, path, description, body, response }) => (
              <div
                key={path + method}
                className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${method === "GET"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-100 text-blue-700"
                      }`}
                  >
                    {method}
                  </span>
                  <code className="text-sm font-mono text-slate-700 dark:text-slate-300">
                    {path}
                  </code>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
                  {body && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        Request body
                      </p>
                      <pre className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                        {body}
                      </pre>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Response
                    </p>
                    <pre className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                      {response}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Webhooks */}
        <section id="webhooks" className="border-t border-slate-100 dark:border-slate-800 pt-10 scroll-mt-24">
          <h2 className="text-xl font-bold text-slate-900 mb-4"><span className="bg-gradient-to-r from-slate-800 to-emerald-700 bg-clip-text text-transparent">Webhooks</span></h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Subscribe to task lifecycle events via HTTP webhooks. Configure
            endpoints in{" "}
            <strong className="text-slate-800">Settings, then Webhooks</strong>.
          </p>
          <div className="bg-slate-900 text-slate-300 rounded-lg p-4 font-mono text-sm">
            <p className="text-slate-400"># Example webhook payload</p>
            <pre className="text-green-400 mt-2">
              {`{
  "event": "task.completed",
  "task_id": "tsk_01",
  "worker_id": "wkr_01",
  "pr_url": "https://github.com/acme/app/pull/142",
  "duration_seconds": 312,
  "timestamp": "2026-03-13T12:28:44Z"
}`}
            </pre>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            All webhook payloads include an{" "}
            <code className="bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono text-xs">
              X-AgentFarm-Signature
            </code>{" "}
            header (HMAC-SHA256). Verify it using your webhook secret from the
            dashboard.
          </p>
        </section>
      </div>
    </div>
  );
}


