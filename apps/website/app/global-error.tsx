"use client";

/**
 * Next.js App Router global error boundary — catches errors in the root layout
 * itself (e.g. failures in providers wrapping the entire app).
 *
 * SECURITY: never render `error.message` or stack trace details.
 * Must include <html> and <body> since the root layout is unavailable here.
 */
export default function GlobalError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body style={{ margin: 0, fontFamily: "sans-serif", background: "#f8fafc" }}>
                <div
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1rem",
                    }}
                >
                    <div style={{ maxWidth: 400, textAlign: "center" }}>
                        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
                            Something went wrong
                        </h1>
                        <p style={{ color: "#475569", marginBottom: 24 }}>
                            An unexpected error occurred. Our team has been notified.
                        </p>
                        <button
                            onClick={reset}
                            style={{
                                padding: "8px 20px",
                                background: "#2563eb",
                                color: "#fff",
                                border: "none",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontWeight: 500,
                            }}
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
