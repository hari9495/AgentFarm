export default function DashboardLoading() {
    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)] p-6 md:p-8">
            <div className="animate-pulse space-y-4 max-w-6xl mx-auto">
                <div className="h-8 w-56 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 rounded-[4px] bg-[var(--card)] dark:bg-[var(--card)] border border-[color:var(--line)] dark:border-[color:var(--line)]" />
                    ))}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="xl:col-span-2 h-72 rounded-[4px] bg-[var(--card)] dark:bg-[var(--card)] border border-[color:var(--line)] dark:border-[color:var(--line)]" />
                    <div className="h-72 rounded-[4px] bg-[var(--card)] dark:bg-[var(--card)] border border-[color:var(--line)] dark:border-[color:var(--line)]" />
                </div>
            </div>
        </div>
    );
}
