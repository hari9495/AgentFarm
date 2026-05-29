/**
 * Shared documentation components — used across all /docs pages.
 * Design: Apple-inspired light theme, dark code blocks, clean tables.
 */

import { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Info, Lightbulb, AlertTriangle, Copy, Check } from "lucide-react";

// ─── Section heading with anchor ─────────────────────────────────────────────

export function H1({ children }: { children: ReactNode }) {
    return (
        <h1
            className="font-semibold text-[#1d1d1f] mt-0 mb-4"
            style={{ fontSize: "2rem", letterSpacing: "-0.025em", lineHeight: 1.1 }}
        >
            {children}
        </h1>
    );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
    return (
        <h2
            id={id}
            className="font-semibold text-[#1d1d1f] mt-10 mb-4 scroll-mt-24 group flex items-center gap-2"
            style={{ fontSize: "1.3rem", letterSpacing: "-0.02em", lineHeight: 1.2 }}
        >
            <a href={`#${id}`} className="no-underline text-inherit hover:text-[#0066cc] transition-colors">
                {children}
            </a>
        </h2>
    );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
    return (
        <h3
            id={id}
            className="font-semibold text-[#1d1d1f] mt-7 mb-3 scroll-mt-24"
            style={{ fontSize: "1.05rem", letterSpacing: "-0.015em" }}
        >
            {children}
        </h3>
    );
}

export function Lead({ children }: { children: ReactNode }) {
    return (
        <p className="text-[17px] text-[#6e6e73] mt-2 mb-6" style={{ lineHeight: 1.6, letterSpacing: "-0.01em" }}>
            {children}
        </p>
    );
}

export function P({ children }: { children: ReactNode }) {
    return (
        <p className="text-[15px] text-[#424245] my-4" style={{ lineHeight: 1.7 }}>
            {children}
        </p>
    );
}

// ─── Callout boxes ────────────────────────────────────────────────────────────

type CalloutType = "note" | "tip" | "warning" | "danger";

const CALLOUT_STYLES: Record<CalloutType, { bg: string; border: string; color: string; icon: typeof Info }> = {
    note: {
        bg: "rgba(0,102,204,0.04)",
        border: "rgba(0,102,204,0.25)",
        color: "#0066cc",
        icon: Info,
    },
    tip: {
        bg: "rgba(52,199,89,0.04)",
        border: "rgba(52,199,89,0.3)",
        color: "#1a7a4a",
        icon: Lightbulb,
    },
    warning: {
        bg: "rgba(255,159,10,0.05)",
        border: "rgba(255,159,10,0.35)",
        color: "#b86800",
        icon: AlertTriangle,
    },
    danger: {
        bg: "rgba(255,59,48,0.05)",
        border: "rgba(255,59,48,0.3)",
        color: "#c4161c",
        icon: AlertCircle,
    },
};

export function Callout({ type = "note", title, children }: { type?: CalloutType; title?: string; children: ReactNode }) {
    const s = CALLOUT_STYLES[type];
    const Icon = s.icon;
    return (
        <div
            className="my-5 rounded-[11px] px-4 py-3.5"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
        >
            <div className="flex items-start gap-2.5">
                <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: s.color }} />
                <div>
                    {title && (
                        <p className="font-semibold text-[14px] mb-1" style={{ color: s.color }}>
                            {title}
                        </p>
                    )}
                    <div className="text-[14px] text-[#424245]" style={{ lineHeight: 1.6 }}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Code block ──────────────────────────────────────────────────────────────

export function Code({ lang, children }: { lang?: string; children: string }) {
    return (
        <div className="my-5 rounded-[12px] overflow-hidden" style={{ border: "1px solid #2a2a2c" }}>
            {lang && (
                <div
                    className="flex items-center justify-between px-4 py-2"
                    style={{ background: "#222224", borderBottom: "1px solid #2a2a2c" }}
                >
                    <span className="text-[11px] font-mono font-semibold text-[#98989d] uppercase tracking-[0.05em]">
                        {lang}
                    </span>
                </div>
            )}
            <pre
                className="overflow-x-auto px-5 py-4 text-[13px] font-mono leading-relaxed"
                style={{ background: "#1a1a1c", color: "#e5e5ea", margin: 0 }}
            >
                <code>{children.trim()}</code>
            </pre>
        </div>
    );
}

export function InlineCode({ children }: { children: ReactNode }) {
    return (
        <code
            className="px-1.5 py-0.5 rounded text-[13px] font-mono"
            style={{ background: "#f5f5f7", color: "#1d1d1f", border: "1px solid #e8e8ed" }}
        >
            {children}
        </code>
    );
}

// ─── HTTP method badge ────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, { bg: string; color: string }> = {
    GET:    { bg: "rgba(52,199,89,0.12)",   color: "#1a7a4a" },
    POST:   { bg: "rgba(0,102,204,0.1)",    color: "#0066cc" },
    PATCH:  { bg: "rgba(255,159,10,0.1)",   color: "#b86800" },
    PUT:    { bg: "rgba(255,159,10,0.1)",   color: "#b86800" },
    DELETE: { bg: "rgba(255,59,48,0.1)",    color: "#c4161c" },
};

export function Endpoint({ method, path, description }: { method: string; path: string; description?: string }) {
    const mc = METHOD_COLORS[method] ?? METHOD_COLORS.GET;
    return (
        <div
            className="my-4 rounded-[11px] p-4"
            style={{ border: "1px solid #e8e8ed", background: "#fafafa" }}
        >
            <div className="flex items-center gap-3">
                <span
                    className="text-[12px] font-bold font-mono px-2 py-1 rounded"
                    style={{ background: mc.bg, color: mc.color, minWidth: 56, textAlign: "center" }}
                >
                    {method}
                </span>
                <code className="font-mono text-[14px] font-semibold text-[#1d1d1f]">{path}</code>
            </div>
            {description && (
                <p className="mt-2 text-[13px] text-[#6e6e73]">{description}</p>
            )}
        </div>
    );
}

// ─── Parameter table ──────────────────────────────────────────────────────────

type Param = {
    name: string;
    type: string;
    required?: boolean;
    default?: string;
    description: string;
};

export function ParamTable({ params }: { params: Param[] }) {
    return (
        <div className="my-5 overflow-hidden rounded-[11px]" style={{ border: "1px solid #d2d2d7" }}>
            <table className="w-full text-[13px]">
                <thead>
                    <tr style={{ background: "#f5f5f7", borderBottom: "1px solid #d2d2d7" }}>
                        <th className="px-4 py-2.5 text-left font-semibold text-[#1d1d1f]">Parameter</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-[#1d1d1f]">Type</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-[#1d1d1f]">Description</th>
                    </tr>
                </thead>
                <tbody>
                    {params.map((p, i) => (
                        <tr
                            key={p.name}
                            style={{ borderBottom: i < params.length - 1 ? "1px solid #e8e8ed" : "none" }}
                        >
                            <td className="px-4 py-3 align-top">
                                <div className="flex items-center gap-1.5">
                                    <code className="font-mono text-[#1d1d1f]">{p.name}</code>
                                    {p.required && (
                                        <span className="text-[10px] font-semibold text-[#c4161c] uppercase">required</span>
                                    )}
                                </div>
                                {p.default && (
                                    <div className="text-[11px] text-[#aeaeb2] mt-0.5">default: {p.default}</div>
                                )}
                            </td>
                            <td className="px-4 py-3 align-top">
                                <code className="font-mono text-[#5856d6] text-[12px]">{p.type}</code>
                            </td>
                            <td className="px-4 py-3 align-top text-[#6e6e73]" style={{ lineHeight: 1.5 }}>
                                {p.description}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Response block ───────────────────────────────────────────────────────────

export function Response({ status, label, children }: { status: number; label?: string; children: string }) {
    const isSuccess = status >= 200 && status < 300;
    return (
        <div className="my-4">
            <div className="flex items-center gap-2 mb-1">
                <span
                    className="text-[12px] font-bold font-mono px-2 py-0.5 rounded"
                    style={{
                        background: isSuccess ? "rgba(52,199,89,0.1)" : "rgba(255,59,48,0.1)",
                        color: isSuccess ? "#1a7a4a" : "#c4161c",
                    }}
                >
                    {status}
                </span>
                {label && <span className="text-[12px] text-[#6e6e73]">{label}</span>}
            </div>
            <Code lang="json">{children}</Code>
        </div>
    );
}

// ─── Step list ────────────────────────────────────────────────────────────────

export function Steps({ children }: { children: ReactNode }) {
    return (
        <ol className="my-6 space-y-6 list-none pl-0">
            {children}
        </ol>
    );
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
    return (
        <li className="flex gap-4">
            <div className="flex flex-col items-center">
                <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold text-white shrink-0"
                    style={{ background: "#0066cc" }}
                >
                    {n}
                </span>
                <div className="flex-1 w-px my-2" style={{ background: "#e8e8ed" }} />
            </div>
            <div className="flex-1 pb-4">
                <p className="font-semibold text-[15px] text-[#1d1d1f] mb-2" style={{ letterSpacing: "-0.01em" }}>
                    {title}
                </p>
                <div>{children}</div>
            </div>
        </li>
    );
}

// ─── Property / type definition table ────────────────────────────────────────

export function TypeTable({ rows }: { rows: { field: string; type: string; description: string }[] }) {
    return (
        <div className="my-5 overflow-hidden rounded-[11px]" style={{ border: "1px solid #d2d2d7" }}>
            <table className="w-full text-[13px]">
                <thead>
                    <tr style={{ background: "#f5f5f7", borderBottom: "1px solid #d2d2d7" }}>
                        <th className="px-4 py-2.5 text-left font-semibold text-[#1d1d1f]">Field</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-[#1d1d1f]">Type</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-[#1d1d1f]">Description</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.field} style={{ borderBottom: i < rows.length - 1 ? "1px solid #e8e8ed" : "none" }}>
                            <td className="px-4 py-3 align-top">
                                <code className="font-mono text-[#1d1d1f]">{r.field}</code>
                            </td>
                            <td className="px-4 py-3 align-top">
                                <code className="font-mono text-[#5856d6] text-[12px]">{r.type}</code>
                            </td>
                            <td className="px-4 py-3 align-top text-[#6e6e73]" style={{ lineHeight: 1.5 }}>
                                {r.description}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Page navigation (prev / next) ────────────────────────────────────────────

export function PageNav({ prev, next }: {
    prev?: { href: string; label: string };
    next?: { href: string; label: string };
}) {
    return (
        <div
            className="flex items-center justify-between mt-12 pt-6"
            style={{ borderTop: "1px solid #e8e8ed" }}
        >
            {prev ? (
                <Link href={prev.href} className="flex flex-col gap-0.5 group">
                    <span className="text-[12px] text-[#aeaeb2]">← Previous</span>
                    <span className="text-[14px] font-medium text-[#0066cc] group-hover:text-[#0071e3] transition-colors">
                        {prev.label}
                    </span>
                </Link>
            ) : <div />}
            {next ? (
                <Link href={next.href} className="flex flex-col items-end gap-0.5 group">
                    <span className="text-[12px] text-[#aeaeb2]">Next →</span>
                    <span className="text-[14px] font-medium text-[#0066cc] group-hover:text-[#0071e3] transition-colors">
                        {next.label}
                    </span>
                </Link>
            ) : <div />}
        </div>
    );
}

// ─── Tag / badge ──────────────────────────────────────────────────────────────

export function Tag({ children, color = "blue" }: { children: ReactNode; color?: "blue" | "green" | "amber" | "red" | "purple" }) {
    const styles = {
        blue:   { bg: "rgba(0,102,204,0.08)",   color: "#0066cc" },
        green:  { bg: "rgba(52,199,89,0.1)",     color: "#1a7a4a" },
        amber:  { bg: "rgba(255,159,10,0.1)",    color: "#b86800" },
        red:    { bg: "rgba(255,59,48,0.1)",     color: "#c4161c" },
        purple: { bg: "rgba(88,86,214,0.1)",     color: "#5856d6" },
    };
    const s = styles[color];
    return (
        <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.05em]"
            style={{ background: s.bg, color: s.color }}
        >
            {children}
        </span>
    );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider() {
    return <hr className="my-8" style={{ border: "none", borderTop: "1px solid #e8e8ed" }} />;
}
