/**
 * "Works with your stack" pill — real brand logo (svgl.app, served locally) +
 * name, with a monogram fallback for tools not in the logo library. Replaces the
 * old saturated colored text pills on the marketplace agent landing pages.
 */

import { CONNECTOR_LOGOS } from '@/components/integrations/IntegrationsCardGrid';

export default function StackPill({ name }: { name: string }) {
  const src = CONNECTOR_LOGOS[name];
  return (
    <span className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>
      {src ? (
        <img src={src} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{name.slice(0, 2).toUpperCase()}</span>
      )}
      {name}
    </span>
  );
}
