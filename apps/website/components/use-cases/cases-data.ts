/** Use-case data (moved out of the page so both A/B layouts share it). */

import { Code2, Megaphone, Headphones, Briefcase, Users, ShieldCheck, type LucideIcon } from 'lucide-react';

export type UseCase = {
  icon: LucideIcon;
  audience: string;
  headline: string;
  story: string;
  results: string[];
};

export const cases: UseCase[] = [
  { icon: Code2, audience: 'Engineering Teams', headline: 'Ship features without drowning in PR overhead',
    story: 'A 20-person engineering team deployed a Developer and Tester worker pair. The Developer opens PRs, the Tester runs CI and fixes failures — engineers stay focused on architecture and review. Every action logged, every PR approval-gated.',
    results: ['PR cycle time cut by 60%', 'CI failures resolved automatically', 'Full audit trail per release', 'Engineers focus on design, not drudgery'] },
  { icon: Megaphone, audience: 'Sales & Marketing', headline: 'Outreach that never misses a follow-up',
    story: 'A Series B SaaS company deployed a Sales Rep and Marketing Specialist worker. The Sales Rep manages CRM updates, follow-up emails, and meeting prep — the Marketing Specialist drafts campaigns, schedules posts, and tracks results. Human reps approve every send.',
    results: ['Pipeline coverage up 3×', 'Zero missed follow-ups', 'Campaigns launched 5× faster', 'Every outbound approved before send'] },
  { icon: Headphones, audience: 'Customer Support', headline: '24/7 support without a 24/7 headcount',
    story: 'A consumer fintech deployed a Customer Support Executive worker that handles Tier 1 tickets via email and chat — checking order status, processing refunds, drafting complex replies for human review. Escalations route to humans in real time.',
    results: ['Tier 1 tickets resolved in < 2 min', 'Support team handles 3× more volume', 'Escalations flagged instantly', 'Full ticket history in the audit trail'] },
  { icon: Briefcase, audience: 'Operations & Admin', headline: 'Every recurring task handled, every deadline met',
    story: 'An operations-heavy company deployed a Corporate Assistant worker that manages calendar invites, meeting notes, vendor follow-ups, and internal report compilation. The team stopped losing hours to scheduling and copy-paste work.',
    results: ['15 hrs/week saved per ops manager', 'Zero missed scheduling conflicts', 'Reports generated automatically', 'All actions logged for review'] },
  { icon: Users, audience: 'HR & Recruiting', headline: 'Source, screen, and schedule without the overhead',
    story: 'A fast-growing startup deployed a Recruiter worker that sourced candidates, screened CVs, scheduled interviews, and drafted offer letters — all under HR team oversight. Human recruiters handled final calls and decisions.',
    results: ['Time-to-screen cut from days to hours', 'Hiring pipeline 2× more candidates', 'Offer letters drafted in minutes', 'Every decision logged with rationale'] },
  { icon: ShieldCheck, audience: 'Enterprise & Regulated', headline: 'Autonomous execution with enterprise-grade governance',
    story: 'A regulated enterprise deployed AI workers across Engineering, Legal, and Finance — each with role-scoped tool access and a strict approval policy. LOW-risk tasks auto-execute. HIGH-risk changes pause for human sign-off. Every action is logged in the evidence plane.',
    results: ['Full audit trail for every agent action', 'Approval gates on all high-risk changes', 'Teams notifications for escalations', 'Compliance evidence exported on demand'] },
];

export const roi = [
  { tier: '1–3 AI workers', hours: '15–25 hrs/wk', cost: '$24k–$40k/yr', note: '~40% of a full-time role' },
  { tier: '4–10 AI workers', hours: '80–150 hrs/wk', cost: '$128k–$240k/yr', note: '~2–3 full-time headcount' },
  { tier: '10+ AI workers', hours: '300–600 hrs/wk', cost: '$480k–$960k/yr', note: '~7–15 full-time employees' },
];
