import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, isCompanyOperatorEmail } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    if (!token) {
        redirect("/login");
    }

    const user = await getSessionUser(token);
    if (!user) {
        redirect("/login");
    }

    if (!isCompanyOperatorEmail(user.email)) {
        redirect("/admin");
    }

    return <>{children}</>;
}
