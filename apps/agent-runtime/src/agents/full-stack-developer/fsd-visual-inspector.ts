// ============================================================================
// FSD VISUAL INSPECTOR
// Sprint 16 — Full-Stack Developer Role
//
// Pure functions for visual UI review:
//
//   buildVisualCritiquePrompt    → LLM / vision-model prompt for UI critique
//   parseVisualCritiqueResponse  → structures LLM free-text into VisualIssue[]
//   computeContrastRatio         → WCAG 2.1 contrast ratio from hex colours
//   analyzeCssForVisualIssues    → static CSS analysis (spacing, font, contrast)
//   summariseVisualReport        → human-readable report summary
//
// No I/O — all side-effectful work (screenshots, HTTP) lives in the handler.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VisualIssueSeverity = 'critical' | 'warning' | 'info';

export type VisualIssueCategory =
    | 'spacing'
    | 'alignment'
    | 'contrast'
    | 'typography'
    | 'layout'
    | 'responsiveness'
    | 'colour'
    | 'other';

export interface VisualIssue {
    category:   VisualIssueCategory;
    severity:   VisualIssueSeverity;
    element?:   string;           // CSS selector or component name
    description: string;
    suggestion:  string;
}

export interface VisualReviewReport {
    score:        number;          // 0–100
    issues:       VisualIssue[];
    screenshotPath?: string;
    liveRun:      boolean;
    summary:      string;
}

// ---------------------------------------------------------------------------
// buildVisualCritiquePrompt
// ---------------------------------------------------------------------------

/**
 * Returns the prompt sent to a vision-capable LLM when a screenshot is
 * available. The model should return a JSON array of VisualIssue objects.
 */
export function buildVisualCritiquePrompt(params: {
    componentName?: string;
    framework?:     string;
    designSystem?:  string;    // e.g. "Material UI 5", "Tailwind"
    focusAreas?:    VisualIssueCategory[];
}): string {
    const focus = params.focusAreas?.join(', ') ?? 'spacing, alignment, contrast, typography, layout';
    const component = params.componentName ? `Component: ${params.componentName}` : 'UI screenshot';
    const ds = params.designSystem ? `Design system: ${params.designSystem}` : '';

    return [
        `You are a senior UX engineer performing a visual code review.`,
        `${component}${ds ? `\n${ds}` : ''}`,
        `Framework: ${params.framework ?? 'React'}`,
        ``,
        `Inspect the screenshot and identify issues in these areas: ${focus}.`,
        ``,
        `For each issue output a JSON object with these exact keys:`,
        `  category   — one of: spacing | alignment | contrast | typography | layout | responsiveness | colour | other`,
        `  severity   — one of: critical | warning | info`,
        `  element    — CSS selector or component name (optional)`,
        `  description — what is wrong`,
        `  suggestion  — how to fix it (specific CSS or Tailwind class)`,
        ``,
        `Return a JSON array of such objects. No markdown, no prose — only the array.`,
        `Example: [{"category":"spacing","severity":"warning","element":".btn","description":"Button padding is 4px, too tight for touch targets","suggestion":"Use p-3 (12px) minimum for interactive elements"}]`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// parseVisualCritiqueResponse
// ---------------------------------------------------------------------------

/**
 * Parses the raw string returned by the vision LLM into VisualIssue[].
 * Gracefully handles partial JSON and markdown fences.
 */
export function parseVisualCritiqueResponse(raw: string): VisualIssue[] {
    const cleaned = raw
        .replace(/^```[a-z]*\n?/im, '')
        .replace(/```\s*$/im, '')
        .trim();

    const start = cleaned.indexOf('[');
    const end   = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];

    try {
        const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
        return arr
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .map((item) => ({
                category:    isCategory(item['category']) ? item['category'] : 'other',
                severity:    isSeverity(item['severity']) ? item['severity'] : 'info',
                element:     typeof item['element']     === 'string' ? item['element']     : undefined,
                description: typeof item['description'] === 'string' ? item['description'] : String(item['description'] ?? ''),
                suggestion:  typeof item['suggestion']  === 'string' ? item['suggestion']  : '',
            } satisfies VisualIssue));
    } catch {
        return [];
    }
}

function isCategory(v: unknown): v is VisualIssueCategory {
    return ['spacing', 'alignment', 'contrast', 'typography', 'layout', 'responsiveness', 'colour', 'other'].includes(v as string);
}
function isSeverity(v: unknown): v is VisualIssueSeverity {
    return ['critical', 'warning', 'info'].includes(v as string);
}

// ---------------------------------------------------------------------------
// computeContrastRatio  (WCAG 2.1)
// ---------------------------------------------------------------------------

/**
 * Computes the WCAG 2.1 contrast ratio between two hex colours.
 * Returns a number between 1 (no contrast) and 21 (black on white).
 */
export function computeContrastRatio(hex1: string, hex2: string): number {
    const l1 = relativeLuminance(hex1);
    const l2 = relativeLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker  = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const sRgb = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((c) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
    );
    return 0.2126 * sRgb[0]! + 0.7152 * sRgb[1]! + 0.0722 * sRgb[2]!;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const clean = hex.replace(/^#/, '');
    const full  = clean.length === 3
        ? clean.split('').map((c) => c + c).join('')
        : clean;
    const num = parseInt(full, 16);
    if (isNaN(num)) return null;
    return {
        r: (num >> 16) & 255,
        g: (num >>  8) & 255,
        b:  num        & 255,
    };
}

// ---------------------------------------------------------------------------
// analyzeCssForVisualIssues
// ---------------------------------------------------------------------------

const TOUCH_TARGET_PX = 44;   // WCAG 2.5.5
const MIN_BODY_FONT_PX = 16;
const MIN_LINE_HEIGHT  = 1.4;

/**
 * Static analysis of CSS source to find common visual quality issues.
 * Works without a browser — useful when screenshots are unavailable.
 */
export function analyzeCssForVisualIssues(cssContent: string): VisualIssue[] {
    const issues: VisualIssue[] = [];
    const lines = cssContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line  = lines[i]!;
        const lineNo = i + 1;

        // ── Contrast checks from inline colour pairs ──────────────────────
        const colorMatch = line.match(/color\s*:\s*(#[0-9a-fA-F]{3,6})/);
        const bgMatch    = lines.slice(Math.max(0, i - 3), i + 3)
            .join('\n')
            .match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/);
        if (colorMatch && bgMatch) {
            const ratio = computeContrastRatio(colorMatch[1]!, bgMatch[1]!);
            if (ratio < 4.5) {
                issues.push({
                    category: 'contrast',
                    severity: ratio < 3 ? 'critical' : 'warning',
                    element:  `line ${lineNo}`,
                    description: `Contrast ratio ${ratio.toFixed(2)}:1 between ${colorMatch[1]} and ${bgMatch[1]} — fails WCAG AA (4.5:1)`,
                    suggestion:  `Darken the foreground or lighten the background to achieve ≥ 4.5:1 ratio.`,
                });
            }
        }

        // ── Touch target size ─────────────────────────────────────────────
        const heightMatch = line.match(/height\s*:\s*(\d+)px/);
        if (heightMatch) {
            const px = parseInt(heightMatch[1]!, 10);
            if (px > 0 && px < TOUCH_TARGET_PX) {
                const isInteractive = lines.slice(Math.max(0, i - 10), i)
                    .join('\n')
                    .match(/button|input|a\s*\{|\.btn|\.link/i);
                if (isInteractive) {
                    issues.push({
                        category:    'spacing',
                        severity:    'warning',
                        element:     `line ${lineNo}`,
                        description: `Interactive element height ${px}px is below the 44px minimum touch target (WCAG 2.5.5)`,
                        suggestion:  `Set height: ${TOUCH_TARGET_PX}px or use padding to meet the touch target minimum.`,
                    });
                }
            }
        }

        // ── Font size ─────────────────────────────────────────────────────
        const fontMatch = line.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/);
        if (fontMatch) {
            const px = parseFloat(fontMatch[1]!);
            if (px < MIN_BODY_FONT_PX && !line.includes('caption') && !line.includes('label')) {
                issues.push({
                    category:    'typography',
                    severity:    px < 12 ? 'critical' : 'info',
                    element:     `line ${lineNo}`,
                    description: `Font size ${px}px may be too small for comfortable reading (recommended ≥ ${MIN_BODY_FONT_PX}px for body text)`,
                    suggestion:  `Use font-size: ${MIN_BODY_FONT_PX}px or 1rem for body text.`,
                });
            }
        }

        // ── Line height ───────────────────────────────────────────────────
        const lhMatch = line.match(/line-height\s*:\s*(\d+(?:\.\d+)?)/);
        if (lhMatch) {
            const lh = parseFloat(lhMatch[1]!);
            if (lh > 0 && lh < MIN_LINE_HEIGHT) {
                issues.push({
                    category:    'typography',
                    severity:    'warning',
                    element:     `line ${lineNo}`,
                    description: `Line height ${lh} is below the recommended minimum of ${MIN_LINE_HEIGHT} for readability`,
                    suggestion:  `Set line-height: 1.5 for body text and 1.2 for headings.`,
                });
            }
        }

        // ── Absolute positioning without z-index comment ──────────────────
        if (/position\s*:\s*absolute/.test(line)) {
            const surroundingBlock = lines.slice(Math.max(0, i - 5), i + 5).join('\n');
            if (!surroundingBlock.includes('z-index')) {
                issues.push({
                    category:    'layout',
                    severity:    'info',
                    element:     `line ${lineNo}`,
                    description: `position: absolute used without a z-index — may cause stacking context issues`,
                    suggestion:  `Add explicit z-index to control layering, or use position: relative on the parent.`,
                });
            }
        }
    }

    return issues;
}

// ---------------------------------------------------------------------------
// summariseVisualReport
// ---------------------------------------------------------------------------

export function summariseVisualReport(issues: VisualIssue[]): { score: number; summary: string } {
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const warnings = issues.filter((i) => i.severity === 'warning').length;
    const score    = Math.max(0, 100 - critical * 20 - warnings * 5);

    if (issues.length === 0) {
        return { score: 100, summary: 'No visual issues detected.' };
    }
    const worst = issues.find((i) => i.severity === 'critical') ?? issues[0]!;
    return {
        score,
        summary: `Visual review: ${issues.length} issue(s) — ${critical} critical, ${warnings} warning(s). Worst: ${worst.description.slice(0, 100)}`,
    };
}
