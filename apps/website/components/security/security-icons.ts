import { Shield, ShieldCheck, Globe, FileLock2, Lock, Server, Eye, KeyRound, Zap, RefreshCw, type LucideIcon } from 'lucide-react';

/** Shared icon map for the security page (mirrors the string keys in securityPageContent). */
export const securityIconMap: Record<string, LucideIcon> = {
  shield: Shield,
  'shield-check': ShieldCheck,
  globe: Globe,
  'file-lock-2': FileLock2,
  lock: Lock,
  server: Server,
  eye: Eye,
  'key-round': KeyRound,
  zap: Zap,
  'refresh-cw': RefreshCw,
};

export interface SecurityFeature {
  icon: string;
  title: string;
  items: readonly string[];
}
