"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X, ChevronDown } from "lucide-react";

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
      { href: "/status", label: "Status" },
    ],
  },
];

function DropdownMenu({ items, onClose }: { items: ChildLink[]; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 2, scale: 0.98 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-44 rounded-xl overflow-hidden"
      style={{ background: "#ffffff", border: "1px solid var(--op-line)", boxShadow: "0 8px 24px rgba(16,24,40,0.08)", backdropFilter: "blur(20px)" }}
    >
      {items.map((child) => (
        <Link
          key={child.href}
          href={child.href}
          onClick={onClose}
          className="block px-4 py-2.5 text-[13px] text-[color:var(--op-muted)] hover:text-[color:var(--op-ink)] hover:bg-[color:var(--op-paper-2)] transition-colors"
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

  useEffect(() => { setOpen(false); setDropdown(null); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setDropdown(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: "rgba(255,255,255,0.9)", borderBottom: "1px solid var(--op-line)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)" }}
    >
      <nav ref={ref} className="max-w-[1200px] mx-auto px-5 h-11 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[var(--op-indigo)]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="5" stroke="white" strokeWidth="1.5" />
              <path d="M4 6h4M6 4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-[color:var(--op-ink)] font-semibold text-[13px] tracking-[-0.01em]">AgentFarms</span>
        </Link>

        {/* Desktop nav links */}
        <ul className="hidden md:flex items-center gap-0 flex-1 justify-center">
          {navLinks.map((l) => (
            <li key={l.label} className="relative">
              {l.children ? (
                <>
                  <button
                    onClick={() => setDropdown(dropdown === l.label ? null : l.label)}
                    className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-[color:var(--op-muted)] hover:text-[color:var(--op-ink)] transition-colors cursor-pointer"
                  >
                    {l.label}
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${dropdown === l.label ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {dropdown === l.label && (
                      <DropdownMenu items={l.children} onClose={() => setDropdown(null)} />
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <Link
                  href={l.href!}
                  className={`px-3 py-1.5 text-[12px] transition-colors block ${
                    pathname === l.href ? "text-[color:var(--op-ink)]" : "text-[color:var(--op-muted)] hover:text-[color:var(--op-ink)]"
                  }`}
                >
                  {l.label}
                </Link>
              )}
            </li>
          ))}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/login"
            className="px-3 py-1 text-[12px] text-[color:var(--op-muted)] hover:text-[color:var(--op-ink)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/get-started"
            className="px-4 py-1.5 text-[13px] font-medium text-white rounded-full transition-colors"
            style={{ background: "var(--op-indigo)" }}
            onMouseOver={(e) => (e.currentTarget.style.background = "var(--op-indigo-ink)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "var(--op-indigo)")}
          >
            Get Started
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-1.5 text-[color:var(--op-muted)] hover:text-[color:var(--op-ink)] transition-colors cursor-pointer"
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
              className="md:hidden fixed inset-0 top-11"
              style={{ background: "rgba(0,0,0,0.5)" }}
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden absolute inset-x-0 top-11 flex flex-col gap-0 z-40 max-h-[calc(100vh-2.75rem)] overflow-y-auto"
              style={{ background: "#ffffff", borderTop: "1px solid var(--op-line)", backdropFilter: "blur(20px)" }}
            >
              <div className="px-4 py-4 flex flex-col gap-1">
                {navLinks.map((l) =>
                  l.children ? (
                    <div key={l.label}>
                      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.4)]">
                        {l.label}
                      </p>
                      {l.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setOpen(false)}
                          className="block px-4 py-2.5 text-[14px] text-[color:var(--op-muted)] hover:text-[color:var(--op-ink)] rounded-lg hover:bg-[color:var(--op-paper-2)] transition-colors"
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
                      className={`px-4 py-2.5 text-[14px] rounded-lg transition-colors ${
                        pathname === l.href ? "text-[color:var(--op-ink)] bg-[color:var(--op-paper-2)]" : "text-[color:var(--op-muted)] hover:text-[color:var(--op-ink)] hover:bg-[color:var(--op-paper-2)]"
                      }`}
                    >
                      {l.label}
                    </Link>
                  )
                )}
              </div>
              <div className="px-4 pb-5 pt-2 flex flex-col gap-2 border-t border-white/[0.08]">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="w-full text-center px-4 py-2.5 text-[14px] text-[color:var(--op-muted)] border border-[color:var(--op-line)] rounded-full hover:text-[color:var(--op-ink)] hover:border-[color:var(--op-muted)] transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/get-started"
                  onClick={() => setOpen(false)}
                  className="w-full text-center px-4 py-2.5 text-[14px] font-medium text-white rounded-full"
                  style={{ background: "var(--op-indigo)" }}
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
