"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
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
  { href: "/status", label: "Status" },
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
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className="absolute top-full left-0 mt-1.5 w-44 bg-[#121212] border border-[#242728] rounded-xl shadow-2xl shadow-black/60 py-1 z-50"
    >
      {children.map((child) => (
        <Link
          key={child.href}
          href={child.href}
          onClick={onClose}
          className="block px-3.5 py-2 text-sm text-[#9c9c9d] hover:text-[#f4f4f6] hover:bg-white/[0.04] transition-colors rounded-lg mx-1"
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
    <header className="sticky top-0 z-50 bg-[#07080a]/90 backdrop-blur-xl border-b border-[#242728]">
      <nav ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5 shrink-0">
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff5757] to-[#a1131a] shadow-lg shadow-red-900/40 transition-transform duration-300 group-hover:scale-105">
            <Bot className="w-4 h-4 text-white" />
          </span>
          <span className="text-[#f4f4f6] font-semibold tracking-tight text-[15px]">AgentFarm</span>
        </Link>

        {/* Desktop nav links */}
        <ul className="hidden md:flex items-center gap-0.5 flex-1">
          {navLinks.map((l) => (
            <li key={l.label} className="relative">
              {l.children ? (
                <>
                  <button
                    onClick={() => setDropdown(dropdown === l.label ? null : l.label)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[#9c9c9d] hover:text-[#f4f4f6] hover:bg-white/[0.04] rounded-lg transition-colors cursor-pointer"
                  >
                    {l.label}
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${dropdown === l.label ? "rotate-180" : ""}`} />
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
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors block ${pathname === l.href
                      ? "text-[#f4f4f6] bg-white/[0.06]"
                      : "text-[#9c9c9d] hover:text-[#f4f4f6] hover:bg-white/[0.04]"
                    }`}
                >
                  {l.label}
                </Link>
              )}
            </li>
          ))}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-1.5">
          <ThemeToggle />
          <CartIcon />
          <div className="w-px h-4 bg-[#242728] mx-0.5" />
          <Link
            href="/dashboard"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${pathname.startsWith("/dashboard")
                ? "text-[#f4f4f6] bg-white/[0.06]"
                : "text-[#9c9c9d] hover:text-[#f4f4f6] hover:bg-white/[0.04]"
              }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Dashboard</span>
          </Link>
          <Link
            href="/admin"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${pathname.startsWith("/admin")
                ? "text-[#f4f4f6] bg-white/[0.06]"
                : "text-[#9c9c9d] hover:text-[#f4f4f6] hover:bg-white/[0.04]"
              }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Admin</span>
          </Link>
          <div className="w-px h-4 bg-[#242728] mx-0.5" />
          <Link
            href="/login"
            className="px-3 py-1.5 text-sm font-medium text-[#9c9c9d] hover:text-[#f4f4f6] hover:bg-white/[0.04] rounded-lg transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/get-started"
            className="px-4 py-1.5 text-sm font-semibold text-[#000000] bg-[#ffffff] rounded-lg hover:bg-[#e8e8e8] transition-colors shadow-sm"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-[#9c9c9d] hover:text-[#f4f4f6] hover:bg-white/[0.06] transition-colors cursor-pointer"
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
              className="md:hidden fixed inset-0 top-14 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden absolute inset-x-0 top-14 border-t border-[#242728] bg-[#0d0d0d] px-4 py-4 flex flex-col gap-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto z-40"
            >
              {navLinks.map((l) =>
                l.children ? (
                  <div key={l.label}>
                    <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#6a6b6c]">
                      {l.label}
                    </p>
                    {l.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setOpen(false)}
                        className={`block px-4 py-2.5 text-sm font-medium rounded-lg ${pathname === child.href
                            ? "bg-white/[0.06] text-[#f4f4f6]"
                            : "text-[#9c9c9d] hover:bg-white/[0.04] hover:text-[#f4f4f6]"
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
                    className={`px-3 py-2.5 text-sm font-medium rounded-lg ${pathname === l.href
                        ? "bg-white/[0.06] text-[#f4f4f6]"
                        : "text-[#9c9c9d] hover:bg-white/[0.04] hover:text-[#f4f4f6]"
                      }`}
                  >
                    {l.label}
                  </Link>
                )
              )}
              <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-[#242728]">
                <div className="flex gap-2 justify-end mb-1">
                  <ThemeToggle />
                  <CartIcon />
                </div>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium border border-[#242728] text-[#9c9c9d] rounded-lg hover:bg-white/[0.04] hover:text-[#f4f4f6]"
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium border border-[#242728] text-[#9c9c9d] rounded-lg hover:bg-white/[0.04] hover:text-[#f4f4f6]"
                >
                  <Shield className="w-4 h-4" /> Admin
                </Link>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="w-full text-center px-4 py-2.5 text-sm font-medium border border-[#242728] text-[#9c9c9d] rounded-lg hover:bg-white/[0.04] hover:text-[#f4f4f6]"
                >
                  Sign in
                </Link>
                <Link
                  href="/get-started"
                  onClick={() => setOpen(false)}
                  className="w-full text-center px-4 py-2.5 text-sm font-semibold bg-white text-black rounded-lg hover:bg-[#e8e8e8]"
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

