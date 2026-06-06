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
  // agent-chat-panel STATUS_COLOR record
  ["pending: '#555'", "pending: 'var(--ink-muted)'"],
  ["running: '#60a5fa'", "running: 'var(--info)'"],
  ["skipped: '#888'", "skipped: 'var(--ink-muted)'"],
  // agent-chat step label ternary
  ["status === 'done' ? '#ccc' : status === 'running' ? 'var(--info)' : '#555'",
   "status === 'done' ? 'var(--ink-muted)' : status === 'running' ? 'var(--info)' : 'var(--ink-muted)'"],
  // agent-chat STATUS_COLOR fallback
  ["STATUS_COLOR[status] ?? '#888'", "STATUS_COLOR[status] ?? 'var(--ink-muted)'"],
  // agent-chat message bubble backgrounds
  ["background: isUser ? '#4f46e5' : '#1e2235'", "background: isUser ? 'var(--accent)' : 'var(--bg-deep)'"],
  ["color: '#e8ecf8'", "color: 'var(--ink)'"],
  ["color: '#818cf8'", "color: 'var(--accent)'"],
  // agent-chat input area
  ["background: '#0c0e1c'", "background: 'var(--bg-deep)'"],
  ["background: '#161929'", "background: 'var(--bg-deep)'"],
  ["border: '1px solid #2a2d45'", "border: '1px solid var(--line)'"],
  ["background: isRunning ? '#2a2d45' : '#4f46e5'", "background: isRunning ? 'var(--line)' : 'var(--accent)'"],
  // internal-sidebar agent icon colors
  ["color: '#0066cc'", "color: 'var(--accent)'"],
  ["color: '#059669'", "color: 'var(--ok)'"],
  ["color: '#e11d48'", "color: 'var(--danger)'"],
  ["color: '#ea580c'", "color: 'var(--warn)'"],
  ["color: '#0d9488'", "color: 'var(--info)'"],
  ["color: '#0891b2'", "color: 'var(--info)'"],
  ["color: '#4f46e5'", "color: 'var(--accent)'"],
  ["color: '#0284c7'", "color: 'var(--info)'"],
  ["color: '#ca8a04'", "color: 'var(--warn)'"],
  ["color: '#475569'", "color: 'var(--ink-muted)'"],
  // api-docs-panel remaining
  ["background: '#ffffff'", "background: 'var(--card)'"],
  ["color: '#ffffff'", "color: '#fff'"],  // keep white-on-dark intentional
  ["color: '#cdd6f4'", "color: 'var(--ink)'"],
  ["color: '#e2e8f0'", "color: 'var(--ink)'"],
  ["background: '#d1fae5'", "background: 'var(--ok-bg)'"],
  ["color: '#065f46'", "color: 'var(--ok)'"],
  ["color: '#334155'", "color: 'var(--ink-muted)'"],
  ["background: '#1e1e2e'", "background: 'var(--bg-deep)'"],
  // kill-switch-panel remaining
  ["color: '#c4161c'", "color: 'var(--danger)'"],
  ["color: '#b45309'", "color: 'var(--warn)'"],
  ["color: '#1a7a4a'", "color: 'var(--ok)'"],
  // support-queue remaining
  ["background: '#fafafa'", "background: 'var(--bg)'"],
  ["background: '#f5f5f5'", "background: 'var(--bg)'"],
  ["color: '#737373'", "color: 'var(--ink-muted)'"],
  // support-issue-feed remaining
  ["color: '#059669'", "color: 'var(--ok)'"],
  ["color: '#9ca3af'", "color: 'var(--ink-muted)'"],
  // business-reports remaining
  ["color: '#dc2626'", "color: 'var(--danger)'"],
  ["color: '#ef4444'", "color: 'var(--danger)'"],
  ["color: '#16a34a'", "color: 'var(--ok)'"],
  // content-drafts / comms remaining
  ["background: '#fef2f2'", "background: 'var(--danger-bg)'"],
  // notifications remaining
  ["background: '#f5f5f5'", "background: 'var(--bg)'"],
  ["color: '#52525b'", "color: 'var(--ink-muted)'"],
  // meeting-sessions remaining
  ["color: '#a1a1aa'", "color: 'var(--ink-muted)'"],
  // approval-queue remaining
  ["color: '#ff6b6b'", "color: 'var(--danger)'"],
  ["color: '#ffd93d'", "color: 'var(--warn)'"],
  ["color: '#a8e6cf'", "color: 'var(--ok)'"],
  // signup page remaining
  ["color: '#6e6e73'", "color: 'var(--ink-muted)'"],
  ["color: '#1d1d1f'", "color: 'var(--ink)'"],
  // provisioning page remaining
  ["color: '#0c4a6e'", "color: 'var(--info)'"],
  // portal support history remaining
  ["background: '#1e293b'", "background: 'var(--bg-deep)'"],
  ["background: '#334155'", "background: 'var(--bg-deep)'"],
  ["color: '#1e293b'", "color: 'var(--ink)'"],
  // agent-detail / insights remaining
  ["color: '#4b5563'", "color: 'var(--ink-muted)'"],
  ["background: '#4b5563'", "background: 'var(--ink-muted)'"],
  // outbound-webhooks remaining
  ["background: '#f9f9f9'", "background: 'var(--bg)'"],
  // connector-marketplace remaining
  ["color: '#18181b'", "color: 'var(--ink)'"],
  ["color: '#71717a'", "color: 'var(--ink-muted)'"],
  ["color: '#f43f5e'", "color: 'var(--danger)'"],
  // talent-pipeline remaining
  ["color: '#0c4a6e'", "color: 'var(--info)'"],
  ["color: '#0369a1'", "color: 'var(--info)'"],
  // api-keys remaining
  ["background: '#fef3c7'", "background: 'var(--warn-bg)'"],
  // remaining common shorthand colors not caught earlier
  ["'#555'", "'var(--ink-soft)'"],
  ["'#888'", "'var(--ink-muted)'"],
  ["'#666'", "'var(--ink-muted)'"],
  ["'#999'", "'var(--ink-muted)'"],
  ["'#ccc'", "'var(--line-strong)'"],
  ["'#ddd'", "'var(--line)'"],
  ["'#eee'", "'var(--line)'"],
  ["'#fff'", "'var(--card)'"],
  ["'#000'", "'var(--ink)'"],
  ["'#333'", "'var(--ink)'"],
  ["'#444'", "'var(--ink-soft)'"],
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
