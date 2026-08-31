export interface ChangelogEntry {
  date: string;
  version?: string;
  versionSlug?: string;
  title: string;
  description?: string;
  summary?: string;
  status: string;
  tags: readonly string[];
  highlights?: readonly string[];
}

export const statusStyle: Record<string, { label: string; color: string; bg: string }> = {
  shipped: { label: 'Shipped', color: 'var(--op-approved)', bg: 'var(--op-approved-soft, #e7f6ee)' },
  'in-progress': { label: 'In progress', color: 'var(--op-pending)', bg: 'var(--op-pending-soft, #fdf3e2)' },
  planned: { label: 'Planned', color: 'var(--op-muted)', bg: 'var(--op-paper-3)' },
};

export function filterEntries<T extends { status: string }>(entries: readonly T[], filter: string): readonly T[] {
  if (filter === 'All') return entries;
  const map: Record<string, string> = { Shipped: 'shipped', 'In Progress': 'in-progress', Planned: 'planned' };
  const want = map[filter];
  return want ? entries.filter((e) => e.status === want) : entries;
}
