import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { marketplaceBots } from "@/lib/bots";
import BotDetailClient from "@/components/marketplace/BotDetailClient";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
    return marketplaceBots.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const bot = marketplaceBots.find((b) => b.slug === slug);
    if (!bot) return {};
    return {
        title: `${bot.name} – AgentFarm Marketplace`,
        description: bot.tagline,
    };
}

export default async function BotDetailPage({ params }: PageProps) {
    const { slug } = await params;
    const bot = marketplaceBots.find((b) => b.slug === slug);
    if (!bot) notFound();
    return <BotDetailClient bot={bot} />;
}
