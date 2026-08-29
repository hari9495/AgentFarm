import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/app/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold leading-snug transition-colors',
    {
        variants: {
            variant: {
                default:
                    'bg-[var(--brand-light)] border-[color-mix(in_srgb,var(--brand)_28%,transparent)] text-[var(--brand)]',
                secondary:
                    'bg-[var(--bg)] border-[var(--line-strong)] text-[var(--ink-soft)]',
                ok: 'bg-[var(--ok-bg)] border-[var(--ok-border)] text-[var(--ok)]',
                warn: 'bg-[var(--warn-bg)] border-[var(--warn-border)] text-[var(--warn)]',
                danger: 'bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger)]',
                info: 'bg-[var(--info-bg)] border-[var(--info-border)] text-[var(--info)]',
                outline: 'bg-transparent border-[var(--line)] text-[var(--ink-soft)]',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
