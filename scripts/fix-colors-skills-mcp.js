const fs = require('fs');
const files = [
  'apps/dashboard/app/skills/skills-hub-client.tsx',
  'apps/dashboard/app/platform-mcp/page.tsx',
];

const replacements = [
  ["color: '#1d1d1f'", "color: 'var(--ink)'"],
  ["color: '#424245'", "color: 'var(--ink-soft)'"],
  ["color: '#6e6e73'", "color: 'var(--ink-muted)'"],
  ["color: '#aeaeb2'", "color: 'var(--ink-muted)'"],
  ["color: '#0066cc'", "color: 'var(--accent)'"],
  ["color: '#1a7a4a'", "color: 'var(--ok)'"],
  ["color: '#b45309'", "color: 'var(--warn)'"],
  ["color: '#c4161c'", "color: 'var(--danger)'"],
  ["background: '#f5f5f7'", "background: 'var(--bg)'"],
  ["background: '#f9f9f9'", "background: 'var(--bg)'"],
  ["background: '#fff'", "background: 'var(--card)'"],
  ["border: '1px solid #d2d2d7'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #e5e5ea'", "border: '1px solid var(--line)'"],
  ["border: '1px solid #f0f0f2'", "border: '1px solid var(--line)'"],
  ["borderTop: '1px solid #f0f0f2'", "borderTop: '1px solid var(--line)'"],
  ["borderBottom: '1px solid #d2d2d7'", "borderBottom: '1px solid var(--line)'"],
  ["borderBottom: '1px solid #e5e5ea'", "borderBottom: '1px solid var(--line)'"],
  ["background: 'rgba(196,22,28,0.07)'", "background: 'var(--danger-bg)'"],
  ["background: 'rgba(196,22,28,0.08)'", "background: 'var(--danger-bg)'"],
  ["border: '1px solid rgba(196,22,28,0.2)'", "border: '1px solid var(--danger-border)'"],
  ["background: 'rgba(26,122,74,0.07)'", "background: 'var(--ok-bg)'"],
  ["background: 'rgba(26,122,74,0.08)'", "background: 'var(--ok-bg)'"],
  ["border: '1px solid rgba(26,122,74,0.2)'", "border: '1px solid var(--ok-border)'"],
  ["border: '1px solid rgba(26,122,74,0.35)'", "border: '1px solid var(--ok-border)'"],
  ["background: 'rgba(0,102,204,0.08)'", "background: 'color-mix(in srgb, var(--accent) 8%, transparent)'"],
  ["background: 'rgba(0,102,204,0.1)'", "background: 'color-mix(in srgb, var(--accent) 10%, transparent)'"],
  ["background: 'rgba(0,102,204,0.07)'", "background: 'color-mix(in srgb, var(--accent) 7%, transparent)'"],
  ["background: 'rgba(0,102,204,0.04)'", "background: 'color-mix(in srgb, var(--accent) 4%, transparent)'"],
  ["background: 'rgba(0,102,204,0.05)'", "background: 'color-mix(in srgb, var(--accent) 5%, transparent)'"],
  ["border: '1px solid rgba(0,102,204,0.2)'", "border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)'"],
  ["border: '1px solid rgba(0,102,204,0.15)'", "border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)'"],
  ["border: '1px solid rgba(0,102,204,0.18)'", "border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)'"],
  ["border: '1px solid rgba(0,102,204,0.35)'", "border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)'"],
  ["background: 'rgba(180,83,9,0.05)'", "background: 'var(--warn-bg)'"],
  ["background: 'rgba(180,83,9,0.08)'", "background: 'color-mix(in srgb, var(--warn) 8%, transparent)'"],
  ["border: '1px solid rgba(180,83,9,0.2)'", "border: '1px solid var(--warn-border)'"],
  ["border: '1px solid rgba(180,83,9,0.4)'", "border: '1px solid var(--warn-border)'"],
  ["background: '#f0f0f2'", "background: 'var(--bg)'"],
  ["background: 'rgba(26,122,74,0.04)'", "background: 'var(--ok-bg)'"],
];

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  for (const [from, to] of replacements) {
    src = src.split(from).join(to);
  }
  fs.writeFileSync(f, src, 'utf8');
  console.log('done:', f);
}
