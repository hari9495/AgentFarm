"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function AnnouncementBar() {
    const [visible, setVisible] = useState(true);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                >
                    <div
                        className="relative text-center py-2 px-10"
                        style={{ background: "#0066cc" }}
                    >
                        <div className="flex items-center justify-center gap-2 text-white text-[13px]">
                            <span>AgentFarm v2 — 12 AI worker roles, approval gates &amp; Azure isolation.</span>
                            <Link
                                href="/changelog"
                                className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline transition-all"
                            >
                                See what&apos;s new <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                        <button
                            onClick={() => setVisible(false)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/70 hover:text-white transition-colors cursor-pointer"
                            aria-label="Dismiss announcement"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
