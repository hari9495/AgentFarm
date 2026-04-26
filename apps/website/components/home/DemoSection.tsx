"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

const terminalLines = [
  { delay: 0.2, color: "text-slate-400", text: "$ AgentFarm assign --worker backend-dev-01 --task \"Add rate limiting to /api/auth\"" },
  { delay: 0.8, color: "text-blue-400", text: "? Task received by backend-dev-01" },
  { delay: 1.4, color: "text-slate-400", text: "? Cloning repository: my-app (branch: main)" },
  { delay: 2.0, color: "text-slate-400", text: "? Analysing codebase context…" },
  { delay: 2.8, color: "text-yellow-300", text: "? Implementing rate limiter using express-rate-limit" },
  { delay: 3.4, color: "text-slate-400", text: "? Writing unit tests (3 test cases)" },
  { delay: 3.9, color: "text-green-400", text: "? Tests passing (3/3)" },
  { delay: 4.4, color: "text-slate-400", text: "? Opening pull request…" },
  { delay: 5.0, color: "text-green-400", text: "? PR #214 opened: \"feat: add rate limiting to auth endpoint\"" },
  { delay: 5.4, color: "text-slate-300", text: "   2 files changed · 47 insertions · 3 deletions" },
  { delay: 5.8, color: "text-blue-300", text: "   ? https://github.com/my-app/pull/214" },
];

export default function DemoSection() {
  const [playing, setPlaying] = useState(false);
  const [key, setKey] = useState(0);

  const handlePlay = () => {
    setKey((k) => k + 1);
    setPlaying(true);
  };

  return (
    <section className="bg-slate-950 py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
              Live Demo
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">
              Watch an AI worker ship a feature
            </h2>
            <p className="mt-4 text-slate-400">
              Assign a task via CLI or Slack — your AI developer picks it up, writes the
              code, runs tests, and opens a pull request.
            </p>
          </div>

          {/* Terminal window */}
          <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            {/* Title bar */}
            <div className="bg-slate-900 px-5 py-3 flex items-center gap-3 border-b border-slate-800">
              <span className="w-3 h-3 rounded-full bg-red-500/70" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <span className="w-3 h-3 rounded-full bg-green-500/70" />
              <span className="ml-auto text-slate-500 text-xs font-mono">AgentFarm — terminal</span>
            </div>

            {/* Terminal body */}
            <div className="bg-slate-950 px-6 py-5 font-mono text-sm min-h-[280px] relative">
              {!playing ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={handlePlay}
                    className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-full transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" /> Play Demo
                  </button>
                </div>
              ) : (
                <div key={key} className="space-y-1.5">
                  {terminalLines.map((line, i) => (
                    <motion.p
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: line.delay, duration: 0.3 }}
                      className={line.color}
                    >
                      {line.text}
                    </motion.p>
                  ))}
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 7 }}
                    onClick={handlePlay}
                    className="mt-4 text-xs text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
                  >
                    ? Replay
                  </motion.button>
                </div>
              )}
            </div>
          </div>

          {/* Demo stats row */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              { label: "From assign to PR", value: "4m 12s" },
              { label: "Tests written", value: "3 / 3 pass" },
              { label: "Lines of code", value: "47 added" },
            ].map((s) => (
              <div key={s.label} className="text-center bg-slate-900 rounded-xl py-4 border border-slate-800">
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

