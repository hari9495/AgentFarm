export const runtime = 'edge'

import { NextRequest, NextResponse } from "next/server";
import { marketplaceBots, type Bot } from "@/lib/bots";

type PlanFilter = Bot["plan"] | "all";
type SortOption = "recommended" | "price-low" | "price-high" | "name";

const normalizeDepartment = (value: string) => value.trim().toLowerCase();

const sortBots = (items: Bot[], sortBy: SortOption) => {
    return [...items].sort((left, right) => {
        if (sortBy === "name") {
            return left.name.localeCompare(right.name);
        }

        if (sortBy === "price-low") {
            return left.priceMonthly - right.priceMonthly;
        }

        if (sortBy === "price-high") {
            return right.priceMonthly - left.priceMonthly;
        }

        if (left.available !== right.available) {
            return left.available ? -1 : 1;
        }

        return left.priceMonthly - right.priceMonthly;
    });
};

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;

    const department = params.get("department")?.trim() ?? "all";
    const plan = (params.get("plan")?.trim() as PlanFilter | null) ?? "all";
    const availableParam = params.get("available");
    const availableOnly = availableParam === null ? true : availableParam === "true";
    const query = params.get("q")?.trim().toLowerCase() ?? "";
    const sortByRaw = (params.get("sort")?.trim() as SortOption | null) ?? "recommended";
    const sortBy: SortOption = ["recommended", "price-low", "price-high", "name"].includes(sortByRaw)
        ? sortByRaw
        : "recommended";
    const limitRaw = Number(params.get("limit") ?? "0");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 0;

    const filtered = marketplaceBots.filter((bot) => {
        if (department !== "all" && normalizeDepartment(bot.department) !== normalizeDepartment(department)) {
            return false;
        }

        if (plan !== "all" && bot.plan !== plan) {
            return false;
        }

        if (availableOnly && !bot.available) {
            return false;
        }

        if (query.length > 0) {
            const matches =
                bot.name.toLowerCase().includes(query) ||
                bot.tagline.toLowerCase().includes(query) ||
                bot.description.toLowerCase().includes(query) ||
                bot.skills.some((skill) => skill.toLowerCase().includes(query));

            if (!matches) {
                return false;
            }
        }

        return true;
    });

    const sorted = sortBots(filtered, sortBy);
    const items = limit > 0 ? sorted.slice(0, limit) : sorted;

    return NextResponse.json({
        items,
        total: sorted.length,
        filters: {
            department,
            plan,
            available: availableOnly,
            q: query,
            sort: sortBy,
            limit,
        },
    });
}

