import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/app/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default:
                    'bg-[var(--brand)] text-white border border-[var(--brand)] shadow-sm hover:bg-[var(--brand-dark)] hover:shadow-[var(--shadow-brand)] active:scale-[0.97]',
                destructive:
                    'bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger-border)] hover:bg-red-100 active:scale-[0.97]',
                outline:
                    'border border-[var(--line-strong)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--bg)] active:scale-[0.97]',
                secondary:
                    'bg-[var(--bg)] text-[var(--ink-soft)] border border-[var(--line)] hover:bg-[var(--bg-deep)] active:scale-[0.97]',
                ghost: 'text-[var(--ink-soft)] hover:bg-[var(--bg)] hover:text-[var(--ink)]',
                link: 'text-[var(--brand)] underline-offset-4 hover:underline',
                warn: 'bg-[var(--warn-bg)] text-[var(--warn)] border border-[var(--warn-border)] hover:bg-amber-100 active:scale-[0.97]',
            },
            size: {
                default: 'h-9 px-4 py-2',
                sm: 'h-8 rounded-full px-3 text-xs',
                lg: 'h-10 rounded-full px-6',
                icon: 'h-9 w-9 rounded-full',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
    },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
