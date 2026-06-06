'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
    return (
        <Sonner
            theme="system"
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast: 'group toast group-[.toaster]:bg-[var(--card)] group-[.toaster]:text-[var(--ink)] group-[.toaster]:border-[var(--line)] group-[.toaster]:shadow-[var(--shadow-md)] group-[.toaster]:rounded-[var(--radius-md)]',
                    description: 'group-[.toast]:text-[var(--ink-muted)]',
                    actionButton: 'group-[.toast]:bg-[var(--brand)] group-[.toast]:text-white',
                    cancelButton: 'group-[.toast]:bg-[var(--bg)] group-[.toast]:text-[var(--ink-soft)]',
                    success: 'group-[.toaster]:bg-[var(--ok-bg)] group-[.toaster]:border-[var(--ok-border)] group-[.toaster]:text-[var(--ok)]',
                    error: 'group-[.toaster]:bg-[var(--danger-bg)] group-[.toaster]:border-[var(--danger-border)] group-[.toaster]:text-[var(--danger)]',
                    warning: 'group-[.toaster]:bg-[var(--warn-bg)] group-[.toaster]:border-[var(--warn-border)] group-[.toaster]:text-[var(--warn)]',
                    info: 'group-[.toaster]:bg-[var(--info-bg)] group-[.toaster]:border-[var(--info-border)] group-[.toaster]:text-[var(--info)]',
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
