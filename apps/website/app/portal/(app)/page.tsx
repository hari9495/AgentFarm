import { redirect } from "next/navigation";

// The customer dashboard is now the unified product UI.
// /portal → /dashboard
export default function PortalHomePage() {
    redirect("/dashboard");
}
