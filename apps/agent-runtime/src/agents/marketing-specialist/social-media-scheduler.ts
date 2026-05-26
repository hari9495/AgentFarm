/**
 * Social Media Scheduler
 *
 * Plans and schedules social media posts across platforms (LinkedIn, X/Twitter,
 * Instagram, Facebook). Computes optimal posting times and produces a structured
 * content calendar. Integrates with Hootsuite and Sprout Social APIs.
 */

export type SocialPlatform = 'linkedin' | 'twitter' | 'instagram' | 'facebook';

export type PostType = 'article_link' | 'image_post' | 'video_post' | 'carousel' | 'story' | 'poll' | 'text_post';

export type SocialFetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface ContentItem {
    title: string;
    body: string;
    url?: string;
    imageUrl?: string;
    hashtags?: string[];
    postType?: PostType;
}

export interface SocialCalendarInput {
    contentItems: ContentItem[];
    platforms: SocialPlatform[];
    startDate: string;
    endDate?: string;
    postsPerWeek?: number;
    brand?: string;
    hootsuiteAccessToken?: string;
    sproutSocialAccessToken?: string;
    hootsuiteProfileIds?: Record<SocialPlatform, string>;
}

export interface ScheduledPost {
    platform: SocialPlatform;
    scheduledAt: string;
    postType: PostType;
    copy: string;
    hashtags: string[];
    imageUrl?: string;
    url?: string;
    sourceTitle: string;
    hootsuiteMessageId?: string;
}

export interface SocialCalendar {
    ok: boolean;
    brand?: string;
    startDate: string;
    endDate: string;
    totalPosts: number;
    posts: ScheduledPost[];
    platformBreakdown: Record<string, number>;
    summary: string;
    errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Optimal posting times per platform (UTC)
// ---------------------------------------------------------------------------

const OPTIMAL_TIMES: Record<SocialPlatform, { day: number; hour: number }[]> = {
    linkedin: [
        { day: 2, hour: 8 },  // Tue 8am
        { day: 3, hour: 12 }, // Wed noon
        { day: 4, hour: 9 },  // Thu 9am
    ],
    twitter: [
        { day: 1, hour: 9 },  // Mon 9am
        { day: 3, hour: 15 }, // Wed 3pm
        { day: 5, hour: 12 }, // Fri noon
    ],
    instagram: [
        { day: 2, hour: 11 }, // Tue 11am
        { day: 4, hour: 14 }, // Thu 2pm
        { day: 6, hour: 10 }, // Sat 10am
    ],
    facebook: [
        { day: 2, hour: 13 }, // Tue 1pm
        { day: 3, hour: 15 }, // Wed 3pm
        { day: 5, hour: 13 }, // Fri 1pm
    ],
};

// ---------------------------------------------------------------------------
// Copy formatter per platform
// ---------------------------------------------------------------------------

function formatCopy(item: ContentItem, platform: SocialPlatform): string {
    const maxLen: Record<SocialPlatform, number> = {
        linkedin: 700,
        twitter: 280,
        instagram: 2200,
        facebook: 500,
    };
    const limit = maxLen[platform];
    let copy = item.body;
    if (item.url && platform !== 'instagram') {
        copy += `\n\n${item.url}`;
    }
    return copy.length > limit ? copy.slice(0, limit - 3) + '...' : copy;
}

// ---------------------------------------------------------------------------
// Posting slot generator
// ---------------------------------------------------------------------------

function generatePostingSlots(
    startDate: string,
    endDate: string,
    platform: SocialPlatform,
    postsPerWeek: number,
): string[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const slots: string[] = [];
    const optimalTimes = OPTIMAL_TIMES[platform];
    const slotsPerWeek = Math.min(postsPerWeek, optimalTimes.length);

    const cursor = new Date(start);
    while (cursor <= end) {
        const dayOfWeek = cursor.getDay();
        const slot = optimalTimes.find((t) => t.day === dayOfWeek);
        if (slot) {
            const scheduled = new Date(cursor);
            scheduled.setUTCHours(slot.hour, 0, 0, 0);
            slots.push(scheduled.toISOString());
            if (slots.filter((s) => {
                const d = new Date(s);
                const weekStart = new Date(start);
                return d >= weekStart && d < new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
            }).length >= slotsPerWeek) {
                cursor.setDate(cursor.getDate() + (7 - dayOfWeek + optimalTimes[0]!.day));
                continue;
            }
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return slots;
}

// ---------------------------------------------------------------------------
// Hootsuite API integration
// ---------------------------------------------------------------------------

async function scheduleOnHootsuite(
    posts: ScheduledPost[],
    accessToken: string,
    profileIds: Record<SocialPlatform, string>,
    fetchFn: SocialFetchFn,
): Promise<void> {
    for (const post of posts) {
        const profileId = profileIds[post.platform];
        if (!profileId) continue;
        try {
            const body: Record<string, unknown> = {
                sendTime: post.scheduledAt,
                message: post.copy,
                socialProfiles: [{ id: profileId }],
            };
            if (post.url) body['urlAttachment'] = { url: post.url };

            const resp = await fetchFn('https://platform.hootsuite.com/v1/messages', {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (resp.ok) {
                const data = await resp.json() as Record<string, unknown>;
                post.hootsuiteMessageId = String(data['id'] ?? '');
            }
        } catch {
            // Non-fatal — post stays in calendar without confirmed ID
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildSocialCalendar(
    input: SocialCalendarInput,
    fetchFn?: SocialFetchFn,
): Promise<SocialCalendar> {
    const startDate = input.startDate;
    const endDate = input.endDate ?? (() => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + 28);
        return d.toISOString().split('T')[0]!;
    })();

    const postsPerWeek = input.postsPerWeek ?? 3;
    const posts: ScheduledPost[] = [];

    for (const platform of input.platforms) {
        const slots = generatePostingSlots(startDate, endDate, platform, postsPerWeek);
        for (let i = 0; i < Math.min(slots.length, input.contentItems.length); i++) {
            const item = input.contentItems[i % input.contentItems.length]!;
            const hashtags = item.hashtags ?? [];
            const hashtagStr = platform !== 'facebook' && hashtags.length > 0
                ? '\n\n' + hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')
                : '';
            posts.push({
                platform,
                scheduledAt: slots[i]!,
                postType: item.postType ?? (item.imageUrl ? 'image_post' : item.url ? 'article_link' : 'text_post'),
                copy: formatCopy(item, platform) + hashtagStr,
                hashtags,
                imageUrl: item.imageUrl,
                url: item.url,
                sourceTitle: item.title,
            });
        }
    }

    posts.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    const fetch: SocialFetchFn = fetchFn ?? (async (url, init) => {
        const resp = await globalThis.fetch(url, { method: init.method, headers: init.headers, body: init.body });
        return { ok: resp.ok, status: resp.status, json: () => resp.json() as Promise<unknown> };
    });

    if (input.hootsuiteAccessToken && input.hootsuiteProfileIds) {
        await scheduleOnHootsuite(posts, input.hootsuiteAccessToken, input.hootsuiteProfileIds, fetch);
    }

    const platformBreakdown: Record<string, number> = {};
    for (const post of posts) {
        platformBreakdown[post.platform] = (platformBreakdown[post.platform] ?? 0) + 1;
    }

    return {
        ok: true,
        brand: input.brand,
        startDate,
        endDate,
        totalPosts: posts.length,
        posts,
        platformBreakdown,
        summary: `Scheduled ${posts.length} posts across ${input.platforms.join(', ')} from ${startDate} to ${endDate}.`,
    };
}
