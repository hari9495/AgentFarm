export default function AdminLoading() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-8">
            <div className="animate-pulse space-y-4 max-w-6xl mx-auto">
                <div className="h-8 w-52 rounded bg-slate-200 dark:bg-slate-800" />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-24 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
                    ))}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="xl:col-span-2 h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
                    <div className="h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
                </div>
            </div>
        </div>
    );
}
