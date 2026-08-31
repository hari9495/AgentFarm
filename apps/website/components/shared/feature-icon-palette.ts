/**
 * Shared multi-hue palette for representational feature/capability icons
 * (Option A, chosen 2026-08-31). Each icon chip cycles a distinct muted color +
 * matching soft tint. Use featureTint(index) for the icon chip bg + icon color.
 */

export const FEATURE_PALETTE: { color: string; bg: string }[] = [
  { color: '#2563eb', bg: '#e9f1fe' }, // indigo (brand)
  { color: '#0d9488', bg: '#d6f3ef' }, // teal
  { color: '#7c3aed', bg: '#ede9fe' }, // violet
  { color: '#d97706', bg: '#fdefd7' }, // amber
  { color: '#e11d48', bg: '#fde7ec' }, // rose
  { color: '#059669', bg: '#d7f3e6' }, // emerald
  { color: '#0284c7', bg: '#dceffa' }, // sky
  { color: '#c026d3', bg: '#fbe8fb' }, // fuchsia
];

export function featureTint(index: number) {
  return FEATURE_PALETTE[index % FEATURE_PALETTE.length];
}
