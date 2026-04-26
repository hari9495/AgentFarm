/**
 * Abstracted waitlist submission service.
 * Set NEXT_PUBLIC_WAITLIST_PROVIDER to switch backends:
 *   - "formspree"  ? Formspree (set NEXT_PUBLIC_FORMSPREE_ID)
 *   - "console"    ? logs to console (default / development)
 *
 * Add Supabase / Firebase branches here when backend is decided.
 */
export async function submitToWaitlist(
    email: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const provider = process.env.NEXT_PUBLIC_WAITLIST_PROVIDER ?? "console";

        if (provider === "formspree") {
            const formId = process.env.NEXT_PUBLIC_FORMSPREE_ID;
            if (!formId) throw new Error("NEXT_PUBLIC_FORMSPREE_ID is not configured.");
            const res = await fetch(`https://formspree.io/f/${formId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({ email }),
            });
            if (!res.ok) throw new Error("Formspree submission failed.");
        } else {
            // Default: console log (swap in real backend when ready)
            console.log("[AgentFarm Waitlist] New signup:", email);
        }

        return { success: true };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

