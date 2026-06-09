import { redirect } from "next/navigation";

// /portal/login is retired — the unified login page lives at /login
export default function PortalLoginRedirect() {
    redirect("/login");
}
