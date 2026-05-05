const PALETTES: Array<{ start: string; end: string; accent: string; stroke: string }> = [
    { start: "#0ea5e9", end: "#2563eb", accent: "#93c5fd", stroke: "#1d4ed8" },
    { start: "#14b8a6", end: "#0f766e", accent: "#5eead4", stroke: "#115e59" },
    { start: "#8b5cf6", end: "#6d28d9", accent: "#c4b5fd", stroke: "#5b21b6" },
    { start: "#f59e0b", end: "#d97706", accent: "#fde68a", stroke: "#b45309" },
    { start: "#fb7185", end: "#e11d48", accent: "#fda4af", stroke: "#be123c" },
    { start: "#22c55e", end: "#15803d", accent: "#86efac", stroke: "#166534" },
];

function hashSlug(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function getInitials(slug: string): string {
    const parts = slug.split("-").filter(Boolean);
    if (parts.length === 0) {
        return "AF";
    }
    const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
    return initials || "AF";
}

// Deterministic branded avatar as inline SVG data URI.
export function getBotAvatarUrl(slug: string, size = 160): string {
    const hash = hashSlug(slug);
    const palette = PALETTES[hash % PALETTES.length];
    const initials = getInitials(slug);
    const radius = Math.round(size * 0.22);
    const ringInset = Math.max(6, Math.round(size * 0.08));
    const center = Math.round(size / 2);
    const badge = Math.max(10, Math.round(size * 0.13));

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${initials} agent avatar">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.start}" />
      <stop offset="100%" stop-color="${palette.end}" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" fill="url(#g)" />
  <circle cx="${center}" cy="${center}" r="${center - ringInset}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2" />
  <path d="M ${Math.round(size * 0.2)} ${Math.round(size * 0.68)} C ${Math.round(size * 0.35)} ${Math.round(size * 0.5)}, ${Math.round(size * 0.65)} ${Math.round(size * 0.82)}, ${Math.round(size * 0.8)} ${Math.round(size * 0.34)}" stroke="${palette.accent}" stroke-width="${Math.max(2, Math.round(size * 0.05))}" stroke-linecap="round" fill="none" opacity="0.85" />
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="${Math.round(size * 0.34)}" font-family="Sora, Manrope, sans-serif" font-weight="800" letter-spacing="1">${initials}</text>
  <circle cx="${size - badge - 6}" cy="${size - badge - 6}" r="${badge}" fill="${palette.accent}" stroke="${palette.stroke}" stroke-width="2" />
  <path d="M ${size - badge - 11} ${size - badge - 6} L ${size - badge - 7} ${size - badge - 2} L ${size - badge + 1} ${size - badge - 10}" stroke="${palette.stroke}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
