import { Mail, Clock, MapPin, type LucideIcon } from 'lucide-react';

export const contactItems: { icon: LucideIcon; label: string; lines: string[] }[] = [
  { icon: Mail, label: 'Email us', lines: ['hello@agentfarms.in', 'support@agentfarms.in'] },
  { icon: Clock, label: 'Response time', lines: ['Sales: within 4 hours', 'Support: within 24 hours'] },
  { icon: MapPin, label: 'Based in', lines: ['San Francisco, CA', 'Remote-first team'] },
];
