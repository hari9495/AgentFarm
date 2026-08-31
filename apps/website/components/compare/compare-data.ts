/** Competitive comparison data (moved out of the page for both A/B layouts). */

export type Value = 'yes' | 'no' | 'partial';
export type CompareKey = 'copilot' | 'contractor' | 'hiring';
export type CompareRow = { feature: string; AgentFarms: Value; copilot: Value; contractor: Value; hiring: Value };

export const rows: CompareRow[] = [
  { feature: 'Executes tasks autonomously', AgentFarms: 'yes', copilot: 'no', contractor: 'yes', hiring: 'yes' },
  { feature: 'Opens GitHub PRs automatically', AgentFarms: 'yes', copilot: 'no', contractor: 'yes', hiring: 'yes' },
  { feature: 'Works 24/7 without breaks', AgentFarms: 'yes', copilot: 'partial', contractor: 'no', hiring: 'no' },
  { feature: 'Risk-classified approval gates', AgentFarms: 'yes', copilot: 'no', contractor: 'no', hiring: 'partial' },
  { feature: 'Jira & Linear integration', AgentFarms: 'yes', copilot: 'no', contractor: 'partial', hiring: 'yes' },
  { feature: 'Day-one productivity', AgentFarms: 'yes', copilot: 'yes', contractor: 'partial', hiring: 'no' },
  { feature: 'Runs CI checks & fixes failures', AgentFarms: 'yes', copilot: 'partial', contractor: 'partial', hiring: 'yes' },
  { feature: 'Full audit trail', AgentFarms: 'yes', copilot: 'no', contractor: 'no', hiring: 'partial' },
  { feature: 'Cost under $500/mo per worker', AgentFarms: 'yes', copilot: 'yes', contractor: 'no', hiring: 'no' },
  { feature: 'No hiring / onboarding time', AgentFarms: 'yes', copilot: 'yes', contractor: 'partial', hiring: 'no' },
  { feature: 'Scales instantly', AgentFarms: 'yes', copilot: 'yes', contractor: 'no', hiring: 'no' },
  { feature: 'Understands full codebase context', AgentFarms: 'yes', copilot: 'partial', contractor: 'partial', hiring: 'yes' },
  { feature: '13 AI worker roles available', AgentFarms: 'yes', copilot: 'no', contractor: 'partial', hiring: 'partial' },
  { feature: 'OWASP / security scanning per PR', AgentFarms: 'yes', copilot: 'no', contractor: 'no', hiring: 'partial' },
  { feature: 'Test coverage delta tracked per PR', AgentFarms: 'yes', copilot: 'no', contractor: 'no', hiring: 'partial' },
  { feature: 'Per-skill analytics dashboard', AgentFarms: 'yes', copilot: 'no', contractor: 'no', hiring: 'no' },
  { feature: 'Iterate on PR review comments', AgentFarms: 'yes', copilot: 'partial', contractor: 'yes', hiring: 'yes' },
  { feature: 'Cancel & reassign tasks instantly', AgentFarms: 'yes', copilot: 'yes', contractor: 'no', hiring: 'no' },
  { feature: 'Tenant-isolated Azure runtime', AgentFarms: 'yes', copilot: 'no', contractor: 'no', hiring: 'no' },
  { feature: 'Microsoft Teams task assignment', AgentFarms: 'yes', copilot: 'no', contractor: 'no', hiring: 'yes' },
];

export const cols: { key: 'AgentFarms' | CompareKey; label: string; highlight?: boolean }[] = [
  { key: 'AgentFarms', label: 'AgentFarms', highlight: true },
  { key: 'copilot', label: 'Copilot / Cursor' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'hiring', label: 'Full-time hire' },
];

export const competitors: { key: CompareKey; label: string }[] = [
  { key: 'copilot', label: 'Copilot / Cursor' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'hiring', label: 'Full-time hire' },
];
