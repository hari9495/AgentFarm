'use client';

/**
 * Team showcase — 21st.dev: makviesainte/team-showcase. Magazine-style staggered
 * photo grid + interactive name list; grayscale→color on hover. Adapted to the
 * op palette (via the shadcn→op bridge) with react-icons swapped for lucide.
 */

import { useState } from 'react';
import { Linkedin, Twitter } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  image: string;
  social?: { twitter?: string; linkedin?: string };
}

export default function TeamShowcase({ members }: { members: TeamMember[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const col1 = members.filter((_, i) => i % 3 === 0);
  const col2 = members.filter((_, i) => i % 3 === 1);
  const col3 = members.filter((_, i) => i % 3 === 2);

  return (
    <div className="mx-auto flex w-full max-w-5xl select-none flex-col items-start gap-8 px-4 py-8 font-sans md:flex-row md:gap-10 md:px-6 lg:gap-14">
      {/* photo grid */}
      <div className="flex flex-shrink-0 gap-2 overflow-x-auto pb-1 md:gap-3 md:pb-0">
        <div className="flex flex-col gap-2 md:gap-3">
          {col1.map((m) => <PhotoCard key={m.id} member={m} className="h-[120px] w-[110px] sm:h-[140px] sm:w-[130px] md:h-[165px] md:w-[155px]" hoveredId={hoveredId} onHover={setHoveredId} />)}
        </div>
        <div className="mt-[48px] flex flex-col gap-2 sm:mt-[56px] md:mt-[68px] md:gap-3">
          {col2.map((m) => <PhotoCard key={m.id} member={m} className="h-[132px] w-[122px] sm:h-[155px] sm:w-[145px] md:h-[182px] md:w-[172px]" hoveredId={hoveredId} onHover={setHoveredId} />)}
        </div>
        <div className="mt-[22px] flex flex-col gap-2 sm:mt-[26px] md:mt-[32px] md:gap-3">
          {col3.map((m) => <PhotoCard key={m.id} member={m} className="h-[125px] w-[115px] sm:h-[146px] sm:w-[136px] md:h-[172px] md:w-[162px]" hoveredId={hoveredId} onHover={setHoveredId} />)}
        </div>
      </div>

      {/* name list */}
      <div className="flex w-full flex-1 flex-col gap-4 pt-0 sm:grid sm:grid-cols-2 md:flex md:flex-col md:gap-5 md:pt-2">
        {members.map((m) => <MemberRow key={m.id} member={m} hoveredId={hoveredId} onHover={setHoveredId} />)}
      </div>
    </div>
  );
}

function PhotoCard({ member, className, hoveredId, onHover }: { member: TeamMember; className: string; hoveredId: string | null; onHover: (id: string | null) => void }) {
  const isActive = hoveredId === member.id;
  const isDimmed = hoveredId !== null && !isActive;
  return (
    <div
      className={cn('flex-shrink-0 cursor-pointer overflow-hidden rounded-xl transition-opacity duration-300', className, isDimmed ? 'opacity-60' : 'opacity-100')}
      onMouseEnter={() => onHover(member.id)}
      onMouseLeave={() => onHover(null)}
    >
      <img src={member.image} alt={member.name} className="h-full w-full object-cover transition-[filter] duration-500" style={{ filter: isActive ? 'grayscale(0) brightness(1)' : 'grayscale(1) brightness(0.82)' }} loading="lazy" />
    </div>
  );
}

function MemberRow({ member, hoveredId, onHover }: { member: TeamMember; hoveredId: string | null; onHover: (id: string | null) => void }) {
  const isActive = hoveredId === member.id;
  const isDimmed = hoveredId !== null && !isActive;
  const hasSocial = member.social?.twitter ?? member.social?.linkedin;
  return (
    <div className={cn('cursor-pointer transition-opacity duration-300', isDimmed ? 'opacity-50' : 'opacity-100')} onMouseEnter={() => onHover(member.id)} onMouseLeave={() => onHover(null)}>
      <div className="flex items-center gap-2.5">
        <span className={cn('h-3 w-4 flex-shrink-0 rounded-[5px] transition-all duration-300', isActive ? 'w-5' : '')} style={{ background: isActive ? 'var(--op-indigo)' : 'var(--op-line-strong, #cbd2d0)' }} />
        <span className="text-base font-semibold leading-none tracking-tight transition-colors duration-300 md:text-[18px]" style={{ color: isActive ? 'var(--op-ink)' : 'var(--op-ink-soft)' }}>{member.name}</span>
        {hasSocial && (
          <div className={cn('ml-0.5 flex items-center gap-1.5 transition-all duration-200', isActive ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-2 opacity-0')}>
            {member.social?.twitter && <a href={member.social.twitter} onClick={(e) => e.stopPropagation()} className="rounded p-1 transition-all hover:scale-110" style={{ color: 'var(--op-muted)' }} title="X / Twitter"><Twitter className="h-3 w-3" /></a>}
            {member.social?.linkedin && <a href={member.social.linkedin} onClick={(e) => e.stopPropagation()} className="rounded p-1 transition-all hover:scale-110" style={{ color: 'var(--op-muted)' }} title="LinkedIn"><Linkedin className="h-3 w-3" /></a>}
          </div>
        )}
      </div>
      <p className="mt-1.5 pl-[27px] text-[9px] font-medium uppercase tracking-[0.2em] md:text-[10px]" style={{ color: 'var(--op-muted)' }}>{member.role}</p>
    </div>
  );
}
