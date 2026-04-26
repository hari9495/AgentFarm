// Deterministic avatar URL per bot slug using cartoon-style avatars.
export function getBotAvatarUrl(slug: string, size = 160): string {
    const seed = encodeURIComponent(slug);
    return `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${seed}&radius=16&scale=95&size=${size}&backgroundType=gradientLinear`;
}
