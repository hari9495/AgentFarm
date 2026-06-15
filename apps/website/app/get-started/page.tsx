import { redirect } from "next/navigation";

export default function GetStartedPage() {
    // Self-serve signup is the primary funnel — "Get Started" / "Start free" CTAs
    // land here. (Was a permanent redirect to /book-demo while signup couldn't
    // complete; now that company-email signup + verification work, send users to
    // the real signup. Use a temporary redirect so it can change without caching.)
    redirect("/signup");
}


