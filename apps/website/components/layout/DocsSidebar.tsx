"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const sidebarSections = [
  {
    heading: "Getting Started",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/quickstart", label: "Quickstart" },
    ],
  },
  {
    heading: "Core Concepts",
    items: [{ href: "/docs/concepts", label: "How Robots Work" }],
  },
  {
    heading: "Reference",
    items: [{ href: "/docs/api-reference", label: "REST API" }],
  },
];

export default function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:block w-52 shrink-0">
      <nav className="sticky top-24 space-y-7">
        {sidebarSections.map(({ heading, items }) => (
          <div key={heading}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 px-3">
              {heading}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "block px-3 py-1.5 text-sm rounded-lg transition-colors",
                      pathname === href
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                    )}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

