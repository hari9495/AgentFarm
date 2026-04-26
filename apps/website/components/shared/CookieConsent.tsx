"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieConsent() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!localStorage.getItem("AgentFarm-cookies")) {
            setVisible(true);
        }
    }, []);

    function accept() {
        localStorage.setItem("AgentFarm-cookies", "accepted");
        setVisible(false);
    }

    function decline() {
        localStorage.setItem("AgentFarm-cookies", "declined");
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6">
            <div className="max-w-2xl mx-auto bg-slate-900 dark:bg-slate-800 text-white rounded-2xl shadow-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <p className="text-sm text-slate-300 flex-1">
                    We use cookies to improve your experience and analyse site usage.{" "}
                    <Link
                        href="/privacy"
                        className="underline text-slate-200 hover:text-white"
                    >
                        Privacy Policy
                    </Link>
                    .
                </p>
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={decline}
                        className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white rounded-lg border border-slate-600 hover:border-slate-400 transition-colors cursor-pointer"
                    >
                        Decline
                    </button>
                    <button
                        onClick={accept}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer"
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}

