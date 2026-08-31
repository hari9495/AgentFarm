/**
 * Pricing-page feature comparison — rendered by the shared ComparisonTable
 * (21st.dev: kokonutd/pricing-table). Keeps the exact plan values (2 / 5 /
 * Unlimited); Pro+ column highlighted; click a column to focus a plan.
 */

import ComparisonTable, { type Cell } from '@/components/shared/ComparisonTable';

const COLUMNS = [
  { key: 'starter', label: 'Starter+' },
  { key: 'pro', label: 'Pro+', highlight: true },
  { key: 'enterprise', label: 'Enterprise' },
];

const bool = (v: boolean): Cell => (v ? 'yes' : 'no');

const ROWS: { label: string; cells: Cell[] }[] = [
  { label: 'AI workers', cells: ['2', '5', 'Unlimited'] },
  { label: 'Task executions / month', cells: ['2,000', '10,000', 'Unlimited'] },
  { label: 'Repositories & workspaces', cells: ['Up to 10', 'Unlimited', 'Unlimited'] },
  { label: 'Integrations', cells: ['Core', 'Expanded', 'All + custom'] },
  { label: 'Approval routing', cells: [bool(true), 'Custom workflows', 'Custom + policy packs'] },
  { label: 'Evidence / audit trail', cells: [bool(true), bool(true), 'Immutable'] },
  { label: 'Analytics', cells: ['Baseline', 'Team + rollout', 'Advanced + exports'] },
  { label: 'Support', cells: ['Email', 'Priority', 'Dedicated + SLA'] },
  { label: 'SSO / SAML', cells: [bool(false), bool(false), bool(true)] },
  { label: 'Tenant-isolated runtime', cells: [bool(false), bool(false), bool(true)] },
  { label: 'Custom connectors & policy packs', cells: [bool(false), bool(false), bool(true)] },
];

export default function PricingComparison() {
  return (
    <div className="op-wrap">
      <h2 className="mb-10 text-center op-h2" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', letterSpacing: '-0.025em' }}>Compare every plan</h2>
      <ComparisonTable columns={COLUMNS} rows={ROWS} defaultSelected="pro" />
    </div>
  );
}
