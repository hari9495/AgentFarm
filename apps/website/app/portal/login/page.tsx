import { redirect } from "next/navigation";

// /portal/login is retired — the unified login page lives at /login.
// Preserve query params (e.g. ?verified=1 from email verification) so the
// login page can show the right confirmation banner.
export default async function PortalLoginRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string") qs.set(key, value);
    }
    const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
    redirect(`/login${suffix}`);
}
