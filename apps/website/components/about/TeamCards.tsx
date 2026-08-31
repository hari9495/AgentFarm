'use client';

/**
 * Team cards — 21st.dev: ravikatiyar162/team-section-1. Circular avatar with a
 * rising wave + border animation on hover. Adapted to the op palette and slotted
 * as a drop-in team grid (page supplies its own heading). Adds member bios.
 */

import { Linkedin, Twitter } from 'lucide-react';

export interface TeamCardMember {
  name: string;
  role: string;
  bio?: string;
  photo: string;
  social?: { twitter?: string; linkedin?: string };
}

const TINTS = [
  'color-mix(in srgb, var(--op-indigo-soft) 55%, var(--op-paper))',
  'var(--op-paper-2)',
  'color-mix(in srgb, var(--op-pending-soft, #fdeecd) 45%, var(--op-paper))',
];

export default function TeamCards({ members }: { members: TeamCardMember[] }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:gap-8">
      {members.map((m, i) => (
        <div
          key={m.name}
          className="group relative flex flex-col items-center overflow-hidden rounded-2xl p-6 text-center transition-all duration-300 ease-in-out hover:scale-[1.02]"
          style={{ background: TINTS[i % TINTS.length], border: '1px solid var(--op-line)', boxShadow: '0 14px 34px -22px rgba(16,24,40,0.28)' }}
        >
          {/* rising wave */}
          <div className="absolute bottom-0 left-0 right-0 h-1/2 origin-bottom scale-y-0 rounded-t-full transition-transform duration-500 ease-out group-hover:scale-y-100" style={{ background: 'linear-gradient(to top, color-mix(in srgb, var(--op-indigo) 16%, transparent), transparent)', transitionDelay: `${i * 50}ms` }} />

          {/* avatar */}
          <div className="relative z-10 h-32 w-32 overflow-hidden rounded-full border-4 transition-all duration-500 ease-out group-hover:scale-105" style={{ borderColor: 'transparent', transitionDelay: `${i * 80}ms` }}>
            <img src={m.photo} alt={m.name} className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" loading="lazy" />
          </div>

          <h3 className="relative z-10 mt-4 text-lg font-semibold" style={{ color: 'var(--op-ink)' }}>{m.name}</h3>
          <p className="relative z-10 text-[13px] font-medium" style={{ color: 'var(--op-indigo)' }}>{m.role}</p>
          {m.bio && <p className="relative z-10 mt-2 text-[13px]" style={{ color: 'var(--op-muted)', lineHeight: 1.5 }}>{m.bio}</p>}

          {m.social && (m.social.twitter || m.social.linkedin) && (
            <div className="relative z-10 mt-4 flex gap-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              {m.social.twitter && <a href={m.social.twitter} className="transition-colors" style={{ color: 'var(--op-muted)' }}><Twitter className="h-5 w-5" /></a>}
              {m.social.linkedin && <a href={m.social.linkedin} className="transition-colors" style={{ color: 'var(--op-muted)' }}><Linkedin className="h-5 w-5" /></a>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
