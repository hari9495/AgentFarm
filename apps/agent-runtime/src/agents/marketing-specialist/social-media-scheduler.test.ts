import { describe, it, expect } from 'vitest';
import { buildSocialCalendar } from './social-media-scheduler.js';
import type { SocialCalendarInput } from './social-media-scheduler.js';

const contentItems = [
    { title: 'AI Agents 101', body: 'How AI agents are changing the way teams work.', hashtags: ['aiagents', 'automation'], url: 'https://example.com/post1' },
    { title: 'Productivity Tips', body: '5 ways to automate your repetitive tasks today.', hashtags: ['productivity'] },
];

const BASE_INPUT: SocialCalendarInput = {
    contentItems,
    platforms: ['linkedin', 'twitter'],
    startDate: '2026-06-02',
    endDate: '2026-06-30',
    postsPerWeek: 2,
};

describe('buildSocialCalendar', () => {
    it('returns a valid calendar', async () => {
        const cal = await buildSocialCalendar(BASE_INPUT);
        expect(cal.ok).toBe(true);
        expect(cal.totalPosts).toBe(cal.posts.length);
    });

    it('schedules posts for all specified platforms', async () => {
        const cal = await buildSocialCalendar(BASE_INPUT);
        const platforms = new Set(cal.posts.map((p) => p.platform));
        expect(platforms.has('linkedin')).toBe(true);
        expect(platforms.has('twitter')).toBe(true);
    });

    it('truncates twitter copy to 280 chars + hashtags', async () => {
        const longItem = { title: 'Long Post', body: 'x'.repeat(300), hashtags: ['tag'] };
        const cal = await buildSocialCalendar({ ...BASE_INPUT, contentItems: [longItem], platforms: ['twitter'] });
        for (const post of cal.posts) {
            if (post.platform === 'twitter') {
                // body is truncated to 280 in the copy builder before hashtags
                expect(post.copy.length).toBeLessThanOrEqual(310);
            }
        }
    });

    it('adds hashtags to copy for linkedin', async () => {
        const cal = await buildSocialCalendar({ ...BASE_INPUT, platforms: ['linkedin'] });
        const liPost = cal.posts.find((p) => p.platform === 'linkedin');
        expect(liPost?.copy).toContain('#aiagents');
    });

    it('includes platform breakdown', async () => {
        const cal = await buildSocialCalendar(BASE_INPUT);
        expect(cal.platformBreakdown['linkedin']).toBeGreaterThan(0);
        expect(cal.platformBreakdown['twitter']).toBeGreaterThan(0);
    });

    it('generates end date automatically when not provided', async () => {
        const cal = await buildSocialCalendar({ ...BASE_INPUT, endDate: undefined });
        expect(cal.endDate).toBeDefined();
        expect(new Date(cal.endDate) > new Date(cal.startDate)).toBe(true);
    });
});
