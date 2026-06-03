import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSocialCalendar } from './social-media-scheduler.js';
import type { SocialCalendarInput } from './social-media-scheduler.js';

const contentItems = [
    { title: 'AI Agents 101', body: 'How AI agents are changing the way teams work.', hashtags: ['aiagents', 'automation'], url: 'https://example.com/post1' },
    { title: 'Productivity Tips', body: '5 ways to automate your repetitive tasks today.', hashtags: ['productivity'] },
];
const BASE_INPUT: SocialCalendarInput = {
    contentItems, platforms: ['linkedin', 'twitter'],
    startDate: '2026-06-02', endDate: '2026-06-30', postsPerWeek: 2,
};

describe('buildSocialCalendar', () => {
    it('returns a valid calendar', async () => {
        const cal = await buildSocialCalendar(BASE_INPUT);
        assert.equal(cal.ok, true);
        assert.equal(cal.totalPosts, cal.posts.length);
    });
    it('schedules posts for all specified platforms', async () => {
        const platforms = new Set((await buildSocialCalendar(BASE_INPUT)).posts.map((p) => p.platform));
        assert.ok(platforms.has('linkedin'));
        assert.ok(platforms.has('twitter'));
    });
    it('truncates twitter copy to 280 chars + hashtags', async () => {
        const longItem = { title: 'Long Post', body: 'x'.repeat(300), hashtags: ['tag'] };
        const cal = await buildSocialCalendar({ ...BASE_INPUT, contentItems: [longItem], platforms: ['twitter'] });
        for (const post of cal.posts) {
            if (post.platform === 'twitter') assert.ok(post.copy.length <= 310);
        }
    });
    it('adds hashtags to copy for linkedin', async () => {
        const liPost = (await buildSocialCalendar({ ...BASE_INPUT, platforms: ['linkedin'] })).posts.find((p) => p.platform === 'linkedin');
        assert.ok(liPost?.copy.includes('#aiagents'));
    });
    it('includes platform breakdown', async () => {
        const cal = await buildSocialCalendar(BASE_INPUT);
        assert.ok(cal.platformBreakdown['linkedin']! > 0);
        assert.ok(cal.platformBreakdown['twitter']! > 0);
    });
    it('generates end date automatically when not provided', async () => {
        const cal = await buildSocialCalendar({ ...BASE_INPUT, endDate: undefined });
        assert.ok(cal.endDate);
        assert.ok(new Date(cal.endDate) > new Date(cal.startDate));
    });
});
