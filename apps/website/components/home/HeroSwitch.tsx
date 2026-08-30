'use client';

/**
 * Home hero — agent preview switcher. Adapted from 21st.dev
 * `ruixen.ui/preview-switch-hero`: an icon-rail switches the product preview
 * (scroll-driven on desktop, click-driven on mobile / reduced-motion), a
 * lead column with ratings + CTAs, and a connector logo strip below.
 * Retinted to the Operations Console palette; content is AgentFarm's agents,
 * the approval gate, and real connectors.
 */

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Star, Check, Clock } from 'lucide-react';
import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { cn } from '@/lib/cn';

interface PreviewTab { id: string; label: string; media: React.ReactNode }
interface HeroRating { source: string; score: string; icon?: React.ReactNode }
interface HeroLogo { name: string; logo?: React.ReactNode }
interface HeroAvatar { initials?: string; src?: string }
interface Cta { label: string; href?: string }

interface PreviewSwitchHeroProps {
  badge?: { tag?: string; label: React.ReactNode };
  title: React.ReactNode;
  description?: React.ReactNode;
  ratings?: HeroRating[];
  primaryCta?: Cta;
  secondaryCta?: Cta;
  avatars?: HeroAvatar[];
  socialProof?: React.ReactNode;
  tabs: PreviewTab[];
  logos?: HeroLogo[];
  scrollLength?: string;
  className?: string;
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

function TabRail({ tabs, active, onSelect }: { tabs: PreviewTab[]; active: number; onSelect: (i: number) => void }) {
  return (
    <div role="tablist" aria-label="Preview switcher" className="flex shrink-0 gap-2 overflow-x-auto [scrollbar-width:none] md:flex-col md:overflow-visible [&::-webkit-scrollbar]:hidden">
      {tabs.map((t, i) => {
        const isActive = i === active;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={isActive} onClick={() => onSelect(i)}
            className={cn('whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive ? 'bg-muted font-semibold text-foreground shadow-sm ring-1 ring-border' : 'font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground')}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function PreviewStack({ tabs, active }: { tabs: PreviewTab[]; active: number }) {
  return (
    <div className="relative w-full min-w-0 md:flex-1">
      {tabs.map((t, i) => {
        const isActive = i === active;
        return (
          <div key={t.id} role="tabpanel" aria-hidden={!isActive}
            className={cn('transition-opacity duration-500', isActive ? 'relative opacity-100' : 'pointer-events-none absolute inset-0 opacity-0')}>
            {t.media}
          </div>
        );
      })}
    </div>
  );
}

function CtaButton({ cta, variant }: { cta: Cta; variant: 'primary' | 'secondary' }) {
  const className = cn('inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    variant === 'primary' ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90' : 'bg-muted text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm hover:ring-1 hover:ring-border');
  const body = <>{cta.label}{variant === 'primary' && <ArrowUpRight className="size-4 shrink-0" />}</>;
  return cta.href ? <Link href={cta.href} className={className}>{body}</Link> : <button type="button" className={className}>{body}</button>;
}

function PreviewSwitchHero({ badge, title, description, ratings, primaryCta, secondaryCta, avatars, socialProof, tabs, logos, scrollLength = '340vh', className }: PreviewSwitchHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const sectionRef = React.useRef<HTMLElement>(null);
  const [active, setActive] = React.useState(0);
  const [scrollDriven, setScrollDriven] = React.useState(false);

  useIsomorphicLayoutEffect(() => {
    if (prefersReducedMotion) { setScrollDriven(false); return; }
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setScrollDriven(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefersReducedMotion]);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (!scrollDriven) return;
    const n = tabs.length;
    const i = Math.min(n - 1, Math.max(0, Math.floor(p * n - 1e-6)));
    setActive((prev) => (prev === i ? prev : i));
  });

  const handleSelect = (i: number) => {
    const el = sectionRef.current;
    if (scrollDriven && el) {
      const top = window.scrollY + el.getBoundingClientRect().top;
      const range = el.offsetHeight - window.innerHeight;
      const target = top + ((i + 0.5) / tabs.length) * range;
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    } else {
      setActive(i);
    }
  };

  return (
    <section ref={sectionRef} aria-label="Hero" className={cn('relative w-full bg-background', className)} style={scrollDriven ? { height: scrollLength } : undefined}>
      <div className={cn(scrollDriven && 'sticky top-0 flex h-screen flex-col overflow-hidden')}>
        <div className={cn('mx-auto flex w-full max-w-7xl flex-col justify-center px-6 py-10 lg:py-14', scrollDriven && 'min-h-0 flex-1')}>
          <div className="flex flex-col-reverse justify-center gap-8 md:flex-row md:items-start md:gap-6 lg:gap-10 xl:gap-[72px]">
            <div className={cn('flex min-w-0 flex-col gap-5 md:w-[400px] md:shrink-0 md:flex-row md:gap-4 lg:w-[520px] lg:gap-6', badge && 'md:mt-11')}>
              <TabRail tabs={tabs} active={active} onSelect={handleSelect} />
              <PreviewStack tabs={tabs} active={active} />
            </div>
            <div className="flex min-w-0 flex-col items-center text-center md:max-w-[496px] md:flex-1 md:items-start md:text-left">
              {badge && (
                <div className="mb-4 flex w-fit items-center gap-2 rounded-lg bg-muted py-1 pl-1.5 pr-2.5">
                  {badge.tag && <span className="inline-flex h-4 items-center rounded-[5px] bg-background px-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary shadow-sm">{badge.tag}</span>}
                  <span className="text-sm text-muted-foreground">{badge.label}</span>
                </div>
              )}
              <h1 className="mb-4 text-balance font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:mb-5 lg:text-5xl xl:text-[56px] xl:leading-[1.05]">{title}</h1>
              {description && <p className="text-balance text-base text-muted-foreground lg:text-lg">{description}</p>}
              {ratings && ratings.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 md:justify-start lg:mt-8">
                  {ratings.map((r, i) => (
                    <div key={`${r.source}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-2 pr-3">
                      {r.icon ?? <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                      <span className="text-sm font-semibold text-foreground">{r.score}</span>
                      <span className="text-sm text-muted-foreground">{r.source}</span>
                    </div>
                  ))}
                </div>
              )}
              {(primaryCta || secondaryCta) && (
                <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start lg:mt-8">
                  {primaryCta && <CtaButton cta={primaryCta} variant="primary" />}
                  {secondaryCta && <CtaButton cta={secondaryCta} variant="secondary" />}
                </div>
              )}
              {(avatars?.length || socialProof) && (
                <div className="mt-6 flex flex-col items-center gap-y-3 md:flex-row">
                  {avatars && avatars.length > 0 && (
                    <div className="flex items-center">
                      {avatars.map((a, i) => (
                        <span key={i} className={cn('flex size-7 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground', i > 0 && '-ml-2')}>
                          {a.initials}
                        </span>
                      ))}
                    </div>
                  )}
                  {socialProof && <span className="text-sm text-muted-foreground md:ml-3">{socialProof}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
        {logos && logos.length > 0 && (
          <div className="border-y border-border">
            <div className="mx-auto max-w-7xl lg:px-7">
              <div className="flex items-center overflow-x-auto [scrollbar-width:none] lg:overflow-visible [&::-webkit-scrollbar]:hidden">
                {logos.map((l, i) => (
                  <div key={`${l.name}-${i}`} className="flex shrink-0 items-center lg:w-full lg:shrink">
                    <div className="flex w-full items-center justify-center px-6 py-5 lg:px-0 lg:py-7">
                      {l.logo ?? <span className="whitespace-nowrap text-base font-semibold tracking-tight text-muted-foreground">{l.name}</span>}
                    </div>
                    {i < logos.length - 1 && <div aria-hidden className="h-9 w-px shrink-0 bg-border" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AgentPanel({ agent, action, tone }: { agent: string; action: string; tone: 'pending' | 'approved' }) {
  const pending = tone === 'pending';
  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-md shadow-black/[0.05]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#e1483d' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#d98a00' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#0ea968' }} />
          <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px] text-muted-foreground">agentfarm · {agent.toLowerCase()}</span>
        </div>
        <div className="h-[280px] px-5 py-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{agent} agent</span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={pending ? { background: 'var(--op-pending-soft)', color: 'var(--op-pending)' } : { background: 'var(--op-approved-soft)', color: 'var(--op-approved)' }}>
              {pending ? <Clock className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              {pending ? 'Awaiting approval' : 'Auto-approved'}
            </span>
          </div>
          <div className="rounded-xl border border-border p-4" style={{ background: 'var(--op-paper-2)' }}>
            <p className="text-[13px] leading-snug text-foreground">{action}</p>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: 'var(--op-approved)' }}>
                <Check className="h-3.5 w-3.5" /> Approve
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">Reject</span>
            </div>
          </div>
          <p className="mt-4 font-[family-name:var(--font-mono)] text-[11px] text-muted-foreground">Every action logged to the audit trail.</p>
        </div>
      </div>
    </div>
  );
}

const CONNECTORS = ['Jira', 'Slack', 'GitHub', 'Salesforce', 'Linear', 'HubSpot'].map((name) => ({ name }));

const TABS: PreviewTab[] = [
  { id: 'recruiter', label: 'Recruiter', media: <AgentPanel agent="Recruiter" action="Send outreach to 12 shortlisted candidates for the Senior Backend role." tone="pending" /> },
  { id: 'developer', label: 'Developer', media: <AgentPanel agent="Developer" action="Open PR #182 — “Add rate-limit to /v1/runtime/tasks” on api-gateway." tone="pending" /> },
  { id: 'support', label: 'Support', media: <AgentPanel agent="Support" action="Reply to ticket #4471 with the refund policy and a $20 credit." tone="approved" /> },
  { id: 'sales', label: 'Sales', media: <AgentPanel agent="Sales" action="Send the tailored proposal to Acme Corp and book a follow-up call." tone="pending" /> },
];

export function HeroSwitch() {
  return (
    <PreviewSwitchHero
      badge={{ tag: 'New', label: '14 AI teammates, one control plane' }}
      title="One AI teammate for every job — you stay in control."
      description="Recruiters, developers, support, sales. They work across your tools and wait for your approval on anything risky — every step logged."
      ratings={[{ source: 'setup', score: '10 min' }, { source: 'oversight', score: '100%' }, { source: 'audit', score: 'Full' }]}
      primaryCta={{ label: 'Start free', href: '/signup' }}
      secondaryCta={{ label: 'Book a demo', href: '/contact' }}
      avatars={[{ initials: 'RC' }, { initials: 'DV' }, { initials: 'SP' }, { initials: 'SL' }, { initials: 'BA' }]}
      socialProof="trusted by lean teams shipping real work"
      tabs={TABS}
      logos={CONNECTORS}
      scrollLength="220vh"
    />
  );
}

export default HeroSwitch;
