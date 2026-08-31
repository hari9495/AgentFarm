import { Zap, ShieldCheck, Users, BarChart3, type LucideIcon } from 'lucide-react';
import type { Role } from './CareersList';

export const openRoles: Role[] = [
  { title: 'Senior Backend Engineer', department: 'Engineering', location: 'Remote (US / EU)', type: 'Full-time', description: "Build the execution engine that powers 13 AI worker roles. You'll work on task scheduling, LLM dispatch, tool connectors, and the approval pipeline.", href: '/contact' },
  { title: 'Product Engineer — Dashboard', department: 'Engineering', location: 'Remote (US / EU)', type: 'Full-time', description: 'Own the operator dashboard — approvals queue, evidence explorer, deployment controls. React 19, Next.js 15, real-time data from a Fastify API.', href: '/contact' },
  { title: 'Developer Advocate', department: 'Growth', location: 'Remote', type: 'Full-time', description: 'Help engineering teams understand how to deploy governed AI workers. Write guides, produce demos, and engage the community around agentic workflows.', href: '/contact' },
  { title: 'Solutions Engineer', department: 'Customer Success', location: 'Remote (US)', type: 'Full-time', description: 'Onboard enterprise customers, configure workers, map approval policies to compliance requirements, and help teams expand beyond the pilot.', href: '/contact' },
];

export const values: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Zap, title: 'Small team, real leverage', body: 'Every person ships work that reaches customers. No large bureaucracy, no approval chains that slow down good ideas.' },
  { icon: ShieldCheck, title: 'Governance is the product', body: 'We are building AI workers that teams can actually trust. If you care about responsible AI in practice, this work is the right fit.' },
  { icon: Users, title: 'Async-first, remote-friendly', body: 'We document decisions, ship context with every change, and default to writing over synchronous interruptions.' },
  { icon: BarChart3, title: 'Measured outcomes', body: 'We track what we ship, how it performs, and where we need to improve. Data over intuition where both are available.' },
];

export const perks = [
  'Competitive salary + equity',
  'Fully remote — work from anywhere',
  'Health, dental, and vision coverage',
  'Home office stipend',
  'Annual learning budget',
  'Flexible PTO',
  'Team offsites 2× per year',
  'Latest hardware — your choice',
];
