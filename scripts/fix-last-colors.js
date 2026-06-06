const fs = require('fs');
const path = require('path');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      results.push(...walk(full));
    } else if (e.isFile() && (e.name.endsWith('.tsx') || e.name.endsWith('.ts'))) {
      results.push(full);
    }
  }
  return results;
}

const REPLACEMENTS = [
  // SSE stream panel dark terminal backgrounds
  ["background: '#1a1a1c'", "background: 'var(--bg-deep)'"],
  ["background: '#111113'", "background: 'var(--bg-deep)'"],
  ["color: '#e5e5e7'", "color: 'var(--ink)'"],
  ["color: '#98989d'", "color: 'var(--ink-muted)'"],
  ["color: copied ? '#34d399' : '#98989d'", "color: copied ? 'var(--ok)' : 'var(--ink-muted)'"],
  ["color: urlCopied ? '#1a7a4a' : 'var(--ink-muted)'", "color: urlCopied ? 'var(--ok)' : 'var(--ink-muted)'"],
  // SSE colorVar data structure
  ["colorVar: '#b45309'", "colorVar: 'var(--warn)'"],
  ["colorVar: '#0066cc'", "colorVar: 'var(--accent)'"],
  ["colorVar: '#1a7a4a'", "colorVar: 'var(--ok)'"],
  ["colorVar: '#c4161c'", "colorVar: 'var(--danger)'"],
  ["colorVar: '#6e6e73'", "colorVar: 'var(--ink-muted)'"],
  // approval-queue decision status ternaries
  ["decision_status === 'approved' ? '#f0fdf4' : '#fef2f2'",
   "decision_status === 'approved' ? 'var(--ok-bg)' : 'var(--danger-bg)'"],
  ["decision_status === 'approved' ? '#166534' : '#991b1b'",
   "decision_status === 'approved' ? 'var(--ok)' : 'var(--danger)'"],
  ["rec.action_outcome.error_reason ? '#c4161c' : '#1a7a4a'",
   "rec.action_outcome.error_reason ? 'var(--danger)' : 'var(--ok)'"],
  ["passed ? '#1a7a4a' : failed ? 'var(--danger)'", "passed ? 'var(--ok)' : failed ? 'var(--danger)'"],
  // approval-queue log level ternary
  ["log.level === 'error' ? '#ff6b6b' : log.level === 'warn' ? '#ffd93d' : '#a8e6cf'",
   "log.level === 'error' ? 'var(--danger)' : log.level === 'warn' ? 'var(--warn)' : 'var(--ok)'"],
  // approval-queue dark terminal bg
  ["background: '#1d1d1f'", "background: 'var(--bg-deep)'"],
  // connector-marketplace zinc dark colors
  ["background: '#18181b'", "background: 'var(--bg-deep)'"],
  ["background: '#09090b'", "background: 'var(--bg-deep)'"],
  ["background: '#27272a'", "background: 'var(--bg-deep)'"],
  ["background: '#f4f4f5'", "background: 'var(--bg)'"],
  ["color: '#a1a1aa'", "color: 'var(--ink-muted)'"],
  ["color: '#71717a'", "color: 'var(--ink-muted)'"],
  ["color: '#52525b'", "color: 'var(--ink-muted)'"],
  ["color: '#f43f5e'", "color: 'var(--danger)'"],
  ["border: '1px solid #18181b'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #27272a'", "border: '1px solid var(--line)'"],
  // internal-sidebar agent avatar colors (keep purples/pinks as-is, convert others)
  ["color: '#0066cc'", "color: 'var(--accent)'"],
  ["color: '#059669'", "color: 'var(--ok)'"],
  ["color: '#e11d48'", "color: 'var(--danger)'"],
  ["color: '#ea580c'", "color: 'var(--warn)'"],
  ["color: '#0d9488'", "color: 'var(--info)'"],
  ["color: '#0891b2'", "color: 'var(--info)'"],
  ["color: '#4f46e5'", "color: 'var(--accent)'"],
  ["color: '#0284c7'", "color: 'var(--info)'"],
  // agent-chat-panel dark chat
  ["background: '#0f0f1a'", "background: 'var(--bg-deep)'"],
  ["background: '#1e2235'", "background: 'var(--bg-deep)'"],
  ["background: '#0f1120'", "background: 'var(--bg-deep)'"],
  ["background: '#4f46e5'", "background: 'var(--accent)'"],
  ["background: '#e8ecf8'", "background: 'color-mix(in srgb, var(--accent) 8%, transparent)'"],
  ["color: '#4f46e5'", "color: 'var(--accent)'"],
  ["color: '#60a5fa'", "color: 'var(--info)'"],
  ["color: '#555'", "color: 'var(--ink-soft)'"],
  ["color: '#888'", "color: 'var(--ink-muted)'"],
  ["color: '#666'", "color: 'var(--ink-muted)'"],
  ["color: '#ccc'", "color: 'var(--line-strong)'"],
  ["border: '1px solid #ccc'", "border: '1px solid var(--line)'"],
  // portal/support/history remaining
  ["background: '#f8fafc'", "background: 'var(--bg)'"],
  ["color: '#475569'", "color: 'var(--ink-muted)'"],
  ["color: '#92400e'", "color: 'var(--warn)'"],
  ["color: '#b91c1c'", "color: 'var(--danger)'"],
  ["color: '#1d4ed8'", "color: 'var(--info)'"],
  ["color: '#15803d'", "color: 'var(--ok)'"],
  ["color: '#2563eb'", "color: 'var(--info)'"],
  ["color: '#1e293b'", "color: 'var(--ink)'"],
  ["color: '#334155'", "color: 'var(--ink-muted)'"],
  // kill-switch-panel remaining
  ["color: '#c4161c'", "color: 'var(--danger)'"],
  ["color: '#1a7a4a'", "color: 'var(--ok)'"],
  ["color: '#b45309'", "color: 'var(--warn)'"],
  // signup/login pages remaining
  ["background: '#f5f5f7'", "background: 'var(--bg)'"],
  ["color: '#6e6e73'", "color: 'var(--ink-muted)'"],
  ["color: '#1d1d1f'", "color: 'var(--ink)'"],
  // api-docs panel remaining
  ["color: '#059669'", "color: 'var(--ok)'"],
  // skill-search remaining
  ["background: '#f9fafb'", "background: 'var(--bg)'"],
  // provisioning page remaining
  ["color: '#0c4a6e'", "color: 'var(--info)'"],
  // Remaining shorthand colors everywhere
  ["color: '#fff'", "color: 'var(--card)'"],
  ["border: '1px solid #fff'", "border: '1px solid var(--card)'"],
  // adapter-discovery remaining
  ["color: '#1a7a4a'", "color: 'var(--ok)'"],
  ["color: '#aeaeb2'", "color: 'var(--ink-muted)'"],
  ["color: '#424245'", "color: 'var(--ink-soft)'"],
  ["color: '#c4161c'", "color: 'var(--danger)'"],
  // business-reports remaining
  ["color: '#166534'", "color: 'var(--ok)'"],
  ["color: '#991b1b'", "color: 'var(--danger)'"],
  // campaigns/comms remaining
  ["background: '#ecfdf5'", "background: 'var(--ok-bg)'"],
  // content-drafts remaining
  ["color: '#047857'", "color: 'var(--ok)'"],
  // notifications remaining
  ["background: '#1e293b'", "background: 'var(--bg-deep)'"],
  // operator-guide remaining
  ["color: '#e5e5e7'", "color: 'var(--ink)'"],
  // meeting-sessions remaining
  ["color: '#a1a1aa'", "color: 'var(--ink-muted)'"],
  // api-keys remaining
  ["color: '#059669'", "color: 'var(--ok)'"],
  ["color: '#1d4ed8'", "color: 'var(--info)'"],
  // support remaining
  ["background: '#f9f9f9'", "background: 'var(--bg)'"],
  ["color: '#333'", "color: 'var(--ink)'"],
];

const files = walk('apps/dashboard/app');
let totalChanges = 0;

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (from !== to && src.includes(from)) {
      src = src.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(f, src, 'utf8');
    totalChanges++;
    console.log('fixed:', f.replace(/\\/g, '/'));
  }
}
console.log(`\nTotal files modified: ${totalChanges}`);
