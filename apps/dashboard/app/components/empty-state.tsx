import type { ReactNode } from 'react';

type EmptyStateVariant = 'info' | 'warn' | 'error' | 'success';

type EmptyStateProps = {
    title: string;
    description?: string;
    variant?: EmptyStateVariant;
    action?: ReactNode;
    icon?: ReactNode;
};

const DEFAULT_ICONS: Record<EmptyStateVariant, ReactNode> = {
    info: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    ),
    warn: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
    error: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
        </svg>
    ),
    success: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    ),
};

export function EmptyState({ title, description, variant = 'info', action, icon }: EmptyStateProps) {
    return (
        <div className={`empty-state empty-state-${variant}`} role="status">
            <span className={`empty-state-icon ${variant}`}>
                {icon ?? DEFAULT_ICONS[variant]}
            </span>
            <p className="empty-state-title">{title}</p>
            {description && <p className="empty-state-desc">{description}</p>}
            {action}
        </div>
    );
}
