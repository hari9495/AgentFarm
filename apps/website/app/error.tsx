"use client";

/**
 * Next.js App Router error boundary — shown when a server component or
 * client component throws during rendering or data fetching.
 *
 * SECURITY: never render `error.message` or any stack trace here. The
 * detailed error is already captured in the server logs. Rendering it would
 * leak internal paths, dependency names, and potentially secrets to users
 * (and attackers scanning for stack traces).
 */
export default function ErrorPage({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center">
                <h1 className="text-2xl font-bold text-slate-900 mb-3">
                    Something went wrong
                </h1>
                <p className="text-slate-600 mb-6">
                    An unexpected error occurred. Our team has been notified.
                </p>
                <button
                    onClick={reset}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    Try again
                </button>
            </div>
        </div>
    );
}
