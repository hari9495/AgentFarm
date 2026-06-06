const fs = require('fs');
const path = require('path');

// Dark-theme hex colors used in panels that were styled with hardcoded Tailwind dark-mode values.
// These need to become CSS variables so light mode works correctly.
const REPLACEMENTS = [
  // Dark backgrounds -> card/bg vars
  ["background: '#0f172a'", "background: 'var(--bg)'"],
  ["background: '#111827'", "background: 'var(--bg)'"],
  ["background: '#1e293b'", "background: 'var(--bg-deep)'"],
  ["background: '#1c1917'", "background: 'var(--bg-deep)'"],
  ["background: '#0c1628'", "background: 'var(--info-bg)'"],
  // Dark borders -> line vars
  ["border: '1px solid #1e293b'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #334155'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #1d2d3e'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #2d3748'", "border: '1px solid var(--line)'"],
  ["borderBottom: '1px solid #1e293b'", "borderBottom: '1px solid var(--line)'"],
  ["borderTop: '1px solid #1e293b'", "borderTop: '1px solid var(--line)'"],
  // Light text on dark backgrounds -> ink vars
  ["color: '#e2e8f0'", "color: 'var(--ink)'"],
  ["color: '#f1f5f9'", "color: 'var(--ink)'"],
  ["color: '#cbd5e1'", "color: 'var(--ink-soft)'"],
  ["color: '#94a3b8'", "color: 'var(--ink-muted)'"],
  ["color: '#64748b'", "color: 'var(--ink-muted)'"],
  ["color: '#475569'", "color: 'var(--ink-muted)'"],
  ["color: '#6b7280'", "color: 'var(--ink-muted)'"],
  ["color: '#9ca3af'", "color: 'var(--ink-muted)'"],
  // Slate-600/400 text that appears in dark context
  ["color: '#4b5563'", "color: 'var(--ink-muted)'"],
  // Blues (info-themed)
  ["color: '#93c5fd'", "color: 'var(--info)'"],
  ["color: '#60a5fa'", "color: 'var(--info)'"],
  ["color: '#3b82f6'", "color: 'var(--info)'"],
  ["background: '#172554'", "background: 'var(--info-bg)'"],
  ["background: '#1e3a8a'", "background: 'var(--info-bg)'"],
  ["border: '1px solid #1e3a8a'", "border: '1px solid var(--info-border)'"],
  ["border: '1px solid #2563eb'", "border: '1px solid var(--info-border)'"],
  ["background: '#3b82f6'", "background: 'var(--info)'"],
  // Greens (ok-themed)
  ["color: '#6ee7b7'", "color: 'var(--ok)'"],
  ["color: '#86efac'", "color: 'var(--ok)'"],
  ["color: '#4ade80'", "color: 'var(--ok)'"],
  ["color: '#34d399'", "color: 'var(--ok)'"],
  ["background: '#1e3a2f'", "background: 'var(--ok-bg)'"],
  ["border: '1px solid #166534'", "border: '1px solid var(--ok-border)'"],
  ["border: '1px solid #15803d'", "border: '1px solid var(--ok-border)'"],
  // Purples -> accent
  ["color: '#c4b5fd'", "color: 'var(--accent)'"],
  ["color: '#a78bfa'", "color: 'var(--accent)'"],
  ["background: '#2d1b69'", "background: 'color-mix(in srgb, var(--accent) 10%, transparent)'"],
  // Dark reds -> danger vars
  ["background: '#3b0d0d'", "background: 'var(--danger-bg)'"],
  ["background: '#450a0a'", "background: 'var(--danger-bg)'"],
  ["border: '1px solid #7f1d1d'", "border: '1px solid var(--danger-border)'"],
  ["color: '#fca5a5'", "color: 'var(--danger)'"],
  ["color: '#f87171'", "color: 'var(--danger)'"],
  // Accent blue (already done but catch remaining inline variations)
  ["color: '#2563eb'", "color: 'var(--info)'"],
  ["color: '#1d4ed8'", "color: 'var(--info)'"],
  // Input/form field backgrounds in dark theme
  ["style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0'",
   "style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink)'"],
  ["style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#e2e8f0'",
   "style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink)'"],
  // Cancel/secondary button styles in dark theme
  ["border: '1px solid #334155', borderRadius: '6px', color: '#64748b'",
   "border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--ink-muted)'"],
  // Inline style condensed patterns
  ["color: '#0f172a'", "color: 'var(--ink)'"],
  // Misc dark theme
  ["color: '#1e293b'", "color: 'var(--ink-soft)'"],
  ["color: '#172554'", "color: 'var(--info)'"],
];

// Files to target (high color count from find script)
const TARGET_FILES = [
  'apps/dashboard/app/components/agent-messages-panel.tsx',
  'apps/dashboard/app/components/agent-observability-panel.tsx',
  'apps/dashboard/app/components/approval-queue-panel.tsx',
  'apps/dashboard/app/approvals/mobile/mobile-approvals-client.tsx',
  'apps/dashboard/app/components/agent-version-history.tsx',
  'apps/dashboard/app/components/runtime-observability-panel.tsx',
  'apps/dashboard/app/components/talent-pipeline-panel.tsx',
  'apps/dashboard/app/components/wake-runs-panel.tsx',
  'apps/dashboard/app/components/adapter-discovery-panel.tsx',
  'apps/dashboard/app/components/knowledge-graph-explorer.tsx',
  'apps/dashboard/app/components/agent-detail-panel.tsx',
  'apps/dashboard/app/components/health-status-panel.tsx',
  'apps/dashboard/app/meetings/[sessionId]/page.tsx',
  'apps/dashboard/app/components/support-queue-panel.tsx',
  'apps/dashboard/app/components/routine-scheduler-panel.tsx',
  'apps/dashboard/app/portal/support/history/page.tsx',
  'apps/dashboard/app/components/agent-chat-panel.tsx',
  'apps/dashboard/app/components/campaigns-panel.tsx',
  'apps/dashboard/app/components/content-drafts-panel.tsx',
  'apps/dashboard/app/components/project-plans-panel.tsx',
  'apps/dashboard/app/connectors/connectors-hub-client.tsx',
  'apps/dashboard/app/components/api-docs-panel.tsx',
  'apps/dashboard/app/components/connector-marketplace-panel.tsx',
  'apps/dashboard/app/components/meeting-sessions-panel.tsx',
  'apps/dashboard/app/components/support-issue-feed.tsx',
  'apps/dashboard/app/components/agent-control-panel.tsx',
  'apps/dashboard/app/components/notifications-panel.tsx',
  'apps/dashboard/app/components/skill-invoke-panel.tsx',
  'apps/dashboard/app/components/task-dag-panel.tsx',
  'apps/dashboard/app/components/internal-sidebar.tsx',
];

let totalChanges = 0;

for (const f of TARGET_FILES) {
  if (!require('fs').existsSync(f)) {
    console.log('skip (not found):', f);
    continue;
  }
  let src = fs.readFileSync(f, 'utf8');
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(f, src, 'utf8');
    totalChanges++;
    console.log('fixed:', f);
  }
}
console.log(`\nTotal files modified: ${totalChanges}`);
