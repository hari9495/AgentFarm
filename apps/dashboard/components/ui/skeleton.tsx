import { cn } from '@/app/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('animate-pulse rounded-[var(--radius-sm)] bg-[var(--line)]', className)}
            {...props}
        />
    );
}

export { Skeleton };
