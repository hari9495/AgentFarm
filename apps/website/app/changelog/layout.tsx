import type { Metadata } from "next";
import { changelogListingContent } from "@/lib/marketing-content";

export const metadata: Metadata = changelogListingContent.metadata;

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
    return children;
}
