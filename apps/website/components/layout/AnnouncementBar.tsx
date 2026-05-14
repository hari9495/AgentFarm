"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ArrowRight, Sparkles } from "lucide-react";
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
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                >
                    <div className="relative bg-gradient-to-r from-[#ff5757]/10 via-[#0d0d0d] to-[#57c1ff]/10 border-b border-[#242728] text-center py-2.5 px-4">
                        <div className="flex items-center justify-center gap-2.5 text-sm">
                            <span className="inline-flex items-center gap-1 bg-[#ff5757]/15 border border-[#ff5757]/30 text-[#ff6161] text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                                <Sparkles className="w-2.5 h-2.5" />
                                New
                            </span>
                            <span className="text-[#9c9c9d]">
                                AgentFarm v2 is live — 21 developer skills, approval gates &amp; Azure isolation
                            </span>
                            <Link
                                href="/changelog"
                                className="inline-flex items-center gap-1 text-[#57c1ff] hover:text-[#8dd7ff] font-medium transition-colors"
                            >
                                See what&apos;s new <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                        <button
                            onClick={() => setVisible(false)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-[#6a6b6c] hover:text-[#9c9c9d] transition-colors"
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
