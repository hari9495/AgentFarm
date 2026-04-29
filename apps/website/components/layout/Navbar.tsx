"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Bot, ChevronDown, LayoutDashboard, Shield } from "lucide-react";
import ThemeToggle from "@/components/shared/ThemeToggle";
import CartIcon from "@/components/shared/CartIcon";

type ChildLink = { href: string; label: string };
type NavLink =
  | { href: string; label: string; children?: undefined }
  | { label: string; href?: undefined; children: ChildLink[] };

const navLinks: NavLink[] = [
  { href: "/product", label: "Product" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing" },
  {
    label: "Resources",
    children: [
      { href: "/use-cases", label: "Use Cases" },
      { href: "/compare", label: "Compare" },
      { href: "/changelog", label: "Changelog" },
      { href: "/docs", label: "Docs" },
      { href: "/blog", label: "Blog" },
    ],
  },
];

function DropdownMenu({ children, onClose }: { children: ChildLink[]; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      className="absolute top-full left-0 mt-2 w-48 bg-white/92 dark:bg-slate-900/92 backdrop-blur-xl border border-white/70 dark:border-slate-700 rounded-2xl shadow-2xl shadow-sky-500/10 dark:shadow-slate-900/55 py-1.5 z-50"
    >
      {children.map((child) => (
        <Link
          key={child.href}
          href={child.href}
          onClick={onClose}
          className="block px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {child.label}
        </Link>
      ))}
    </motion.div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dropdown, setDropdown] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setDropdown(null);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white/72 dark:bg-slate-950/78 backdrop-blur-xl border-b border-white/70 dark:border-slate-800/80 shadow-[0_10px_36px_rgba(2,132,199,0.1)] dark:shadow-[0_10px_36px_rgba(2,132,199,0.16)]">
      <nav ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-lg shrink-0">
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 shadow-md shadow-sky-500/40 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
            <Bot className="w-4 h-4 text-white" />
          </span>
          <span className="tracking-tight">AgentFarm</span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <li key={l.label} className="relative">
              {l.children ? (
                <>
                  <button
                    onClick={() => setDropdown(dropdown === l.label ? null : l.label)}
                    className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 rounded-full hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/90 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {l.label}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${dropdown === l.label ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {dropdown === l.label && (
                      <DropdownMenu children={l.children} onClose={() => setDropdown(null)} />
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <Link
                  href={l.href!}
                  className={`px-3.5 py-2 text-sm font-medium rounded-full transition-colors block ${pathname === l.href
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/90 dark:hover:bg-slate-800"
                    }`}
                >
                  {l.label}
                </Link>
              )}
            </li>
          ))}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-1">
          <ThemeToggle />
          <CartIcon />
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <Link
            href="/dashboard"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${pathname.startsWith("/dashboard")
              ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <Link
            href="/admin"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${pathname.startsWith("/admin")
              ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Admin
          </Link>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <Link
            href="/login"
            className="px-3.5 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-full hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/get-started"
            className="px-4 py-2 text-sm font-semibold text-white rounded-full bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 hover:brightness-110 hover:-translate-y-0.5 shadow-md shadow-sky-500/35"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close mobile navigation"
              onClick={() => setOpen(false)}
              className="md:hidden fixed inset-0 top-16 bg-black/30"
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="md:hidden absolute inset-x-0 top-16 border-t border-white/70 dark:border-slate-800 bg-white/96 dark:bg-slate-950/96 backdrop-blur-2xl px-4 py-4 flex flex-col gap-1 max-h-[calc(100vh-4rem)] overflow-y-auto"
            >
              {navLinks.map((l) =>
                l.children ? (
                  <div key={l.label}>
                    <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {l.label}
                    </p>
                    {l.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setOpen(false)}
                        className={`block px-5 py-2.5 text-sm font-medium rounded-md ${pathname === child.href
                          ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    key={l.href}
                    href={l.href!}
                    onClick={() => setOpen(false)}
                    className={`px-3 py-2.5 text-sm font-medium rounded-md ${pathname === l.href
                      ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                  >
                    {l.label}
                  </Link>
                )
              )}
              <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex justify-center mb-1">
                  <CartIcon />
                </div>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-900/20"
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
                >
                  <Shield className="w-4 h-4" /> Admin
                </Link>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="w-full text-center px-4 py-2.5 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Sign In
                </Link>
                <Link
                  href="/get-started"
                  onClick={() => setOpen(false)}
                  className="w-full text-center px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Get Started
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

