'use client';

/**
 * Home features — clean bento grid. Adapted from 21st.dev
 * `tommyjepsen/feature-section-with-bento-grid`: light editorial cards, the
 * Approval-gates and Azure-isolation cells span two columns for emphasis.
 * Retinted to the Operations Console palette; content is AgentFarm's 6 pillars.
 */

import * as React from 'react';
import { Rocket, Users, ShieldCheck, Plug, FileClock, Server } from 'lucide-react';

const FEATURES = [
  { icon: ShieldCheck, title: 'Approval gates', desc: 'Nothing risky ships without a human. One tap to approve or reject — every action logged.', wide: true },
  { icon: Users, title: '13 specialist roles', desc: 'Recruiter, developer, support, sales and more — one platform, every job.' },
  { icon: Plug, title: '18 connectors', desc: 'Jira, Slack, GitHub, Salesforce and more. Your agents work across your stack.' },
  { icon: FileClock, title: 'Full evidence trail', desc: 'Every decision and action captured in an append-only, immutable audit log.' },
  { icon: Rocket, title: 'Instant deployment', desc: 'Live in about 10 minutes. No infrastructure for you to manage.' },
  { icon: Server, title: 'Azure isolation', desc: 'A dedicated, isolated VM per tenant — your data never mingles with anyone else’s.', wide: true },
];

export default function FeaturesBento() {
  return (
    <section className="w-full px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper)', color: 'var(--op-ink)' }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col items-start gap-3">
          <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>Platform</span>
          <h2 className="max-w-xl font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ lineHeight: 1.04 }}>
            Everything you need to run an AI workforce.
          </h2>
          <p className="max-w-xl text-lg" style={{ color: 'var(--op-muted)' }}>
            Specialist agents, working across your tools, with a human on every risky move.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc, wide }) => (
            <div
              key={title}
              className={`op-lift flex flex-col justify-between rounded-2xl p-6 ${wide ? 'lg:col-span-2' : ''}`}
              style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)', minHeight: 200 }}
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', color: 'var(--op-indigo)' }}>
                <Icon className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <div className="mt-8 flex flex-col">
                <h3 className="text-xl tracking-tight" style={{ color: 'var(--op-ink)' }}>{title}</h3>
                <p className="mt-1 max-w-sm text-base" style={{ color: 'var(--op-muted)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
