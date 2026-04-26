import type { Metadata } from "next";
import ActivityFeed from "@/components/dashboard/ActivityFeed";

export const metadata: Metadata = {
    title: "Activity - AgentFarm Dashboard",
    description: "Live activity feed across all AI agents.",
};

export default function DashboardActivityPage() {
    return <ActivityFeed />;
}
