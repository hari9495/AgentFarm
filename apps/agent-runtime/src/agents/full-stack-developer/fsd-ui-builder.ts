// ============================================================================
// FSD UI BUILDER
// Sprint 16 — Full-Stack Developer Role
//
// Pure functions for frontend UI work:
//   - Component scaffolding (React / Vue / Angular / Svelte)
//   - CSS / Tailwind generation from design tokens
//   - Responsive design audit
//   - Accessibility report builder
//   - SEO report builder
//   - Performance budget report
//
// No I/O, no LLM calls, no side-effects — all testable in isolation.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UiFramework   = 'react' | 'vue' | 'angular' | 'svelte' | 'solid';
export type StylingMethod = 'tailwind' | 'css-modules' | 'styled-components' | 'scss' | 'plain-css';

export interface ComponentProp {
    name:     string;
    type:     string;
    required: boolean;
    default?: string;
}

export interface ComponentSpec {
    name:        string;
    framework:   UiFramework;
    styling:     StylingMethod;
    props:       ComponentProp[];
    hasState:    boolean;
    isAsync:     boolean;
    description: string;
}

export interface ComponentScaffold {
    filename:       string;
    code:           string;
    styleFilename?: string;
    styleCode?:     string;
    testFilename:   string;
    testCode:       string;
}

export interface DesignToken {
    name:     string;
    value:    string;
    category: 'color' | 'spacing' | 'typography' | 'shadow' | 'radius' | 'other';
}

export interface ResponsiveIssue {
    line?:        number;
    selector:     string;
    issue:        string;
    severity:     'critical' | 'warning' | 'info';
    suggestion:   string;
}

export interface ResponsiveReport {
    filePath:     string;
    issueCount:   number;
    issues:       ResponsiveIssue[];
    summary:      string;
}

export interface A11yIssue {
    rule:        string;
    description: string;
    severity:    'critical' | 'serious' | 'moderate' | 'minor';
    selector?:   string;
    fix:         string;
}

export interface A11yReport {
    score:      number;   // 0–100
    violations: A11yIssue[];
    summary:    string;
}

export interface SeoIssue {
    type:        'missing' | 'duplicate' | 'too_long' | 'too_short' | 'invalid';
    field:       string;
    description: string;
    fix:         string;
}

export interface SeoReport {
    score:      number;   // 0–100
    issues:     SeoIssue[];
    summary:    string;
}

export interface PerformanceBudget {
    maxBundleKb?:  number;
    maxLcpMs?:     number;
    maxFidMs?:     number;
    maxCls?:       number;
}

export interface PerformanceIssue {
    metric:    string;
    actual:    string;
    budget:    string;
    severity:  'critical' | 'warning';
}

export interface PerformanceReport {
    score:     number;   // 0–100
    issues:    PerformanceIssue[];
    summary:   string;
}

// ---------------------------------------------------------------------------
// generateComponentScaffold
// ---------------------------------------------------------------------------

export function generateComponentScaffold(spec: ComponentSpec): ComponentScaffold {
    switch (spec.framework) {
        case 'react':  return buildReactComponent(spec);
        case 'vue':    return buildVueComponent(spec);
        case 'angular': return buildAngularComponent(spec);
        case 'svelte': return buildSvelteComponent(spec);
        case 'solid':  return buildSolidComponent(spec);
    }
}

// ── React ──────────────────────────────────────────────────────────────────

function buildReactComponent(spec: ComponentSpec): ComponentScaffold {
    const propsType   = buildTsPropsInterface(spec.name, spec.props);
    const propsDestr  = spec.props.length > 0
        ? `{ ${spec.props.map((p) => p.name).join(', ')} }: ${spec.name}Props`
        : '_props: Record<string, never>';
    const stateLines  = spec.hasState
        ? `\n  const [state, setState] = React.useState<unknown>(null);\n`
        : '';
    const styleImport = buildReactStyleImport(spec);
    const className   = buildClassName(spec);

    const innerContent = buildMinimalContent(spec, 'react-jsx');
    const code = [
        `import React from 'react';`,
        styleImport,
        '',
        propsType,
        '',
        `/**`,
        ` * ${spec.description}`,
        ` */`,
        `export const ${spec.name}: React.FC<${spec.name}Props> = (${propsDestr}) => {`,
        stateLines,
        `  return (`,
        `    <div${className}>`,
        ...(innerContent ? [`      ${innerContent}`] : []),
        `    </div>`,
        `  );`,
        `};`,
        '',
        `export default ${spec.name};`,
    ].join('\n');

    const { testFilename, testCode } = buildReactTest(spec);
    const { styleFilename, styleCode } = buildStyleFile(spec);

    return {
        filename:      `${spec.name}.tsx`,
        code,
        styleFilename,
        styleCode,
        testFilename,
        testCode,
    };
}

function buildReactStyleImport(spec: ComponentSpec): string {
    if (spec.styling === 'css-modules')     return `import styles from './${spec.name}.module.css';`;
    if (spec.styling === 'scss')            return `import './${spec.name}.scss';`;
    if (spec.styling === 'styled-components') return `import styled from 'styled-components';`;
    return '';
}

function buildClassName(spec: ComponentSpec): string {
    if (spec.styling === 'css-modules')    return ` className={styles.root}`;
    if (spec.styling === 'tailwind')       return ` className="flex flex-col"`;
    return ` className="${kebab(spec.name)}"`;
}

function buildReactTest(spec: ComponentSpec): { testFilename: string; testCode: string } {
    const testCode = [
        `import { render, screen } from '@testing-library/react';`,
        `import { ${spec.name} } from './${spec.name}';`,
        '',
        `describe('${spec.name}', () => {`,
        `  it('renders without crashing', () => {`,
        `    render(<${spec.name}${buildDefaultProps(spec)} />);`,
        `  });`,
        '',
        `  it('matches snapshot', () => {`,
        `    const { asFragment } = render(<${spec.name}${buildDefaultProps(spec)} />);`,
        `    expect(asFragment()).toMatchSnapshot();`,
        `  });`,
        `});`,
    ].join('\n');
    return { testFilename: `${spec.name}.test.tsx`, testCode };
}

// ── Vue ────────────────────────────────────────────────────────────────────

function buildVueComponent(spec: ComponentSpec): ComponentScaffold {
    const props = spec.props.map((p) =>
        `    ${p.name}: { type: ${mapTypeToVue(p.type)}${p.required ? ', required: true' : ''} },`,
    ).join('\n');

    const vueInner = buildMinimalContent(spec, 'vue-template');
    const code = [
        `<template>`,
        `  <div${spec.styling === 'tailwind' ? ' class="flex flex-col"' : ''}>`,
        `    ${vueInner}`,
        `  </div>`,
        `</template>`,
        '',
        `<script setup lang="ts">`,
        `/**`,
        ` * ${spec.description}`,
        ` */`,
        spec.props.length > 0 ? `defineProps<{` : '',
        ...spec.props.map((p) => `  ${p.name}${p.required ? '' : '?'}: ${p.type};`),
        spec.props.length > 0 ? `}>();` : '',
        spec.hasState ? `\nimport { ref } from 'vue';\nconst state = ref<unknown>(null);` : '',
        `</script>`,
        '',
        spec.styling === 'scss' ? `<style lang="scss" scoped>\n.${kebab(spec.name)} {}\n</style>` : `<style scoped>\n.${kebab(spec.name)} {}\n</style>`,
    ].filter(Boolean).join('\n');

    void props; // used in Options API but not Composition API; kept for completeness

    const testCode = [
        `import { mount } from '@vue/test-utils';`,
        `import ${spec.name} from './${spec.name}.vue';`,
        '',
        `describe('${spec.name}', () => {`,
        `  it('renders without crashing', () => {`,
        `    const wrapper = mount(${spec.name}${spec.props.length > 0 ? `, { props: {} }` : ''});`,
        `    expect(wrapper.exists()).toBe(true);`,
        `  });`,
        `});`,
    ].join('\n');

    return {
        filename:    `${spec.name}.vue`,
        code,
        testFilename: `${spec.name}.test.ts`,
        testCode,
    };
}

// ── Angular ────────────────────────────────────────────────────────────────

function buildAngularComponent(spec: ComponentSpec): ComponentScaffold {
    const selector = kebab(spec.name);
    const inputs   = spec.props.map((p) => `  @Input() ${p.name}!: ${p.type};`).join('\n');

    const code = [
        `import { Component, Input${spec.hasState ? ', OnInit' : ''} } from '@angular/core';`,
        '',
        `/**`,
        ` * ${spec.description}`,
        ` */`,
        `@Component({`,
        `  selector: '${selector}',`,
        `  templateUrl: './${spec.name}.component.html',`,
        `  styleUrls: ['./${spec.name}.component.${spec.styling === 'scss' ? 'scss' : 'css'}'],`,
        `})`,
        `export class ${spec.name}Component${spec.hasState ? ' implements OnInit' : ''} {`,
        inputs,
        spec.hasState ? `\n  ngOnInit(): void {}\n` : '',
        `}`,
    ].join('\n');

    const angularInner = buildMinimalContent(spec, 'angular-html');
    const htmlCode = `<div>\n  ${angularInner}\n</div>\n`;

    const testCode = [
        `import { ComponentFixture, TestBed } from '@angular/core/testing';`,
        `import { ${spec.name}Component } from './${spec.name}.component';`,
        '',
        `describe('${spec.name}Component', () => {`,
        `  let fixture: ComponentFixture<${spec.name}Component>;`,
        `  beforeEach(async () => {`,
        `    await TestBed.configureTestingModule({ declarations: [${spec.name}Component] }).compileComponents();`,
        `    fixture = TestBed.createComponent(${spec.name}Component);`,
        `  });`,
        `  it('should create', () => expect(fixture.componentInstance).toBeTruthy());`,
        `});`,
    ].join('\n');

    return {
        filename:      `${spec.name}.component.ts`,
        code,
        styleFilename: `${spec.name}.component.html`,
        styleCode:     htmlCode,
        testFilename:  `${spec.name}.component.spec.ts`,
        testCode,
    };
}

// ── Svelte ─────────────────────────────────────────────────────────────────

function buildSvelteComponent(spec: ComponentSpec): ComponentScaffold {
    const exports = spec.props.map((p) =>
        `  export let ${p.name}${p.default ? ` = ${p.default}` : (p.required ? '' : ' = undefined')}: ${p.type};`,
    ).join('\n');

    const svelteInner = buildMinimalContent(spec, 'svelte-template');
    const code = [
        `<script lang="ts">`,
        `  /** ${spec.description} */`,
        exports,
        spec.hasState ? `  let state: unknown = null;` : '',
        `</script>`,
        '',
        `<div${spec.styling === 'tailwind' ? ' class="flex flex-col"' : ''}>`,
        `  ${svelteInner}`,
        `</div>`,
        '',
        `<style>`,
        `  div {}`,
        `</style>`,
    ].filter((l) => l !== '').join('\n');

    const testCode = [
        `import { render } from '@testing-library/svelte';`,
        `import ${spec.name} from './${spec.name}.svelte';`,
        '',
        `test('renders ${spec.name}', () => {`,
        `  const { container } = render(${spec.name});`,
        `  expect(container).toBeTruthy();`,
        `});`,
    ].join('\n');

    return {
        filename:    `${spec.name}.svelte`,
        code,
        testFilename: `${spec.name}.test.ts`,
        testCode,
    };
}

// ── Solid ──────────────────────────────────────────────────────────────────

function buildSolidComponent(spec: ComponentSpec): ComponentScaffold {
    const propsType = buildTsPropsInterface(spec.name, spec.props);
    const solidInner = buildMinimalContent(spec, 'solid-jsx');
    const code = [
        `import { Component${spec.hasState ? ', createSignal' : ''} } from 'solid-js';`,
        '',
        propsType,
        '',
        `/** ${spec.description} */`,
        `const ${spec.name}: Component<${spec.name}Props> = (props) => {`,
        spec.hasState ? `  const [state, setState] = createSignal<unknown>(null);` : '',
        solidInner
            ? `  return <div>${solidInner}</div>;`
            : `  return <div />;`,
        `};`,
        '',
        `export default ${spec.name};`,
    ].join('\n');

    const testCode = `import { render } from 'solid-testing-library';\nimport ${spec.name} from './${spec.name}';\ntest('renders', () => { render(() => <${spec.name} />); });\n`;

    return { filename: `${spec.name}.tsx`, code, testFilename: `${spec.name}.test.tsx`, testCode };
}

// ---------------------------------------------------------------------------
// extractDesignTokens
// ---------------------------------------------------------------------------

/**
 * Extracts design tokens from raw Figma styles data or a CSS variables object.
 * Handles both Figma API style nodes and plain CSS custom-property maps.
 */
export function extractDesignTokens(raw: Record<string, unknown>): DesignToken[] {
    const tokens: DesignToken[] = [];

    // Figma-style node: { name, type, styleType, ... }
    if (Array.isArray(raw['styles'])) {
        for (const s of raw['styles'] as Record<string, unknown>[]) {
            const name  = String(s['name'] ?? '').toLowerCase().replace(/\s+/g, '-');
            const value = String(s['value'] ?? s['color'] ?? s['fills'] ?? '');
            const cat   = inferTokenCategory(name);
            if (name) tokens.push({ name, value, category: cat });
        }
        return tokens;
    }

    // Plain CSS var map: { '--color-primary': '#1a1a2e', ... }
    for (const [key, value] of Object.entries(raw)) {
        const name = key.replace(/^--/, '');
        tokens.push({ name, value: String(value), category: inferTokenCategory(name) });
    }

    return tokens;
}

/**
 * Converts an array of DesignTokens to CSS custom properties or Tailwind config.
 */
export function tokensToCSS(tokens: DesignToken[]): string {
    const lines = [':root {'];
    for (const t of tokens) {
        lines.push(`  --${t.name}: ${t.value};`);
    }
    lines.push('}');
    return lines.join('\n');
}

export function tokensToTailwindConfig(tokens: DesignToken[]): string {
    const colors  = tokens.filter((t) => t.category === 'color');
    const spacing = tokens.filter((t) => t.category === 'spacing');
    const lines = [
        `/** @type {import('tailwindcss').Config} */`,
        `module.exports = {`,
        `  theme: {`,
        `    extend: {`,
        `      colors: {`,
        ...colors.map((t) => `        '${t.name}': '${t.value}',`),
        `      },`,
        `      spacing: {`,
        ...spacing.map((t) => `        '${t.name}': '${t.value}',`),
        `      },`,
        `    },`,
        `  },`,
        `};`,
    ];
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildResponsiveReport
// ---------------------------------------------------------------------------

export function buildResponsiveReport(cssContent: string, filePath: string): ResponsiveReport {
    const issues: ResponsiveIssue[] = [];
    const lines = cssContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const lower = line.toLowerCase();

        // Fixed pixel widths that are likely to break on small screens
        const fixedWidthMatch = line.match(/width\s*:\s*(\d+)px/);
        if (fixedWidthMatch && parseInt(fixedWidthMatch[1] ?? '0', 10) > 480) {
            issues.push({
                line: i + 1,
                selector: extractSelector(lines, i),
                issue: `Fixed width ${fixedWidthMatch[0]} may break on small screens`,
                severity: 'warning',
                suggestion: `Use max-width or clamp() instead: max-width: ${fixedWidthMatch[1]}px; width: 100%;`,
            });
        }

        // Fixed pixel heights
        const fixedHeightMatch = line.match(/height\s*:\s*(\d+)px/);
        if (fixedHeightMatch && parseInt(fixedHeightMatch[1] ?? '0', 10) > 200) {
            issues.push({
                line: i + 1,
                selector: extractSelector(lines, i),
                issue: `Fixed height ${fixedHeightMatch[0]} may cause overflow on small screens`,
                severity: 'info',
                suggestion: `Consider min-height instead of height for flexible layouts`,
            });
        }

        // Missing media queries
        if (lower.includes('display: flex') || lower.includes('display: grid')) {
            const hasMediaQuery = cssContent.includes('@media');
            if (!hasMediaQuery) {
                issues.push({
                    line: i + 1,
                    selector: extractSelector(lines, i),
                    issue: 'Flex/Grid layout with no @media queries detected in file',
                    severity: 'warning',
                    suggestion: 'Add responsive breakpoints: @media (max-width: 768px)',
                });
                break; // only report once per file
            }
        }

        // Viewport-specific issues
        if (lower.includes('overflow: hidden') && !lower.includes('overflow-x')) {
            issues.push({
                line: i + 1,
                selector: extractSelector(lines, i),
                issue: '`overflow: hidden` can clip content on small screens',
                severity: 'info',
                suggestion: 'Check if overflow-x: hidden is more appropriate',
            });
        }
    }

    return {
        filePath,
        issueCount: issues.length,
        issues,
        summary: issues.length > 0
            ? `${issues.length} responsive issue(s) found in ${filePath}`
            : `No responsive issues found in ${filePath}`,
    };
}

// ---------------------------------------------------------------------------
// buildA11yReport
// ---------------------------------------------------------------------------

/**
 * Builds an A11y report from axe-core JSON results or a raw HTML/component string.
 */
export function buildA11yReport(input: Record<string, unknown> | string): A11yReport {
    const violations: A11yIssue[] = [];

    if (typeof input === 'string') {
        // Basic static analysis of HTML/JSX
        if (!/<img[^>]+alt=/i.test(input) && /<img/i.test(input)) {
            violations.push({
                rule:        'image-alt',
                description: 'Images are missing alt attributes',
                severity:    'critical',
                fix:         'Add descriptive alt text to all <img> elements: <img alt="description">',
            });
        }
        if (!/<button[^>]*>/.test(input) && /onClick=/i.test(input)) {
            violations.push({
                rule:        'interactive-element',
                description: 'onClick handler found on non-interactive element',
                severity:    'serious',
                fix:         'Use <button> or <a> for interactive elements instead of divs/spans with onClick',
            });
        }
        if (!/<label/i.test(input) && /<input/i.test(input)) {
            violations.push({
                rule:        'label',
                description: 'Form inputs are missing associated labels',
                severity:    'critical',
                fix:         'Add <label htmlFor="id"> or aria-label to all form inputs',
            });
        }
        if (!/role=/i.test(input) && !/aria-/i.test(input) && /<nav|<aside|<main/i.test(input)) {
            violations.push({
                rule:        'landmark-roles',
                description: 'Landmark elements missing aria roles',
                severity:    'moderate',
                fix:         'Add role="navigation", role="main", role="complementary" to landmark elements',
            });
        }
    } else {
        // axe-core JSON format: { violations: [...] }
        const axeViolations = Array.isArray(input['violations'])
            ? input['violations'] as Record<string, unknown>[]
            : [];
        for (const v of axeViolations) {
            violations.push({
                rule:        String(v['id'] ?? 'unknown'),
                description: String(v['description'] ?? ''),
                severity:    (v['impact'] as A11yIssue['severity']) ?? 'moderate',
                selector:    String((v['nodes'] as Record<string, unknown>[])?.[0]?.['target'] ?? ''),
                fix:         String(v['help'] ?? ''),
            });
        }
    }

    const criticalCount = violations.filter((v) => v.severity === 'critical').length;
    const score = Math.max(0, 100 - (criticalCount * 20) - (violations.length * 5));

    return {
        score:      Math.min(100, score),
        violations,
        summary:    violations.length === 0
            ? 'A11y: no violations found.'
            : `A11y: ${violations.length} violation(s) — ${criticalCount} critical. Score: ${score}/100.`,
    };
}

// ---------------------------------------------------------------------------
// buildSeoReport
// ---------------------------------------------------------------------------

export function buildSeoReport(htmlContent: string): SeoReport {
    const issues: SeoIssue[] = [];

    const titleMatch = htmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (!titleMatch) {
        issues.push({ type: 'missing', field: 'title', description: 'Page <title> tag is missing', fix: 'Add <title>Your Page Title</title> in <head>' });
    } else if (titleMatch[1] && titleMatch[1].length > 60) {
        issues.push({ type: 'too_long', field: 'title', description: `Title is ${titleMatch[1].length} chars (max 60)`, fix: 'Shorten title to 50–60 characters' });
    } else if (titleMatch[1] && titleMatch[1].length < 10) {
        issues.push({ type: 'too_short', field: 'title', description: 'Title is too short (< 10 chars)', fix: 'Write a descriptive title of 50–60 characters' });
    }

    if (!/<meta[^>]+name=["']description["']/i.test(htmlContent)) {
        issues.push({ type: 'missing', field: 'meta-description', description: 'Meta description is missing', fix: 'Add <meta name="description" content="...">' });
    }

    if (!/<meta[^>]+property=["']og:title["']/i.test(htmlContent)) {
        issues.push({ type: 'missing', field: 'og:title', description: 'Open Graph og:title is missing', fix: 'Add <meta property="og:title" content="...">' });
    }

    if (!/<meta[^>]+property=["']og:image["']/i.test(htmlContent)) {
        issues.push({ type: 'missing', field: 'og:image', description: 'Open Graph og:image is missing', fix: 'Add <meta property="og:image" content="https://...">' });
    }

    if (!/<h1/i.test(htmlContent)) {
        issues.push({ type: 'missing', field: 'h1', description: 'No H1 heading found on page', fix: 'Add exactly one <h1> tag per page' });
    }

    if (!/<link[^>]+rel=["']canonical["']/i.test(htmlContent)) {
        issues.push({ type: 'missing', field: 'canonical', description: 'Canonical URL tag missing', fix: 'Add <link rel="canonical" href="https://...">' });
    }

    const score = Math.max(0, 100 - issues.length * 12);
    return {
        score,
        issues,
        summary: issues.length === 0
            ? 'SEO: all checks passed.'
            : `SEO: ${issues.length} issue(s) found. Score: ${score}/100.`,
    };
}

// ---------------------------------------------------------------------------
// buildPerformanceReport
// ---------------------------------------------------------------------------

export function buildPerformanceReport(
    bundleData: Record<string, unknown>,
    budget: PerformanceBudget = {},
): PerformanceReport {
    const issues: PerformanceIssue[] = [];
    const maxBundle = budget.maxBundleKb ?? 500;
    const maxLcp    = budget.maxLcpMs    ?? 2500;
    const maxFid    = budget.maxFidMs    ?? 100;
    const maxCls    = budget.maxCls      ?? 0.1;

    const bundleKb = typeof bundleData['total_kb'] === 'number' ? bundleData['total_kb'] : 0;
    const lcpMs    = typeof bundleData['lcp_ms']   === 'number' ? bundleData['lcp_ms']   : 0;
    const fidMs    = typeof bundleData['fid_ms']   === 'number' ? bundleData['fid_ms']   : 0;
    const clsVal   = typeof bundleData['cls']      === 'number' ? bundleData['cls']      : 0;

    if (bundleKb > maxBundle) issues.push({ metric: 'Bundle size', actual: `${bundleKb}KB`, budget: `${maxBundle}KB`, severity: 'critical' });
    if (lcpMs    > maxLcp)    issues.push({ metric: 'LCP',         actual: `${lcpMs}ms`,    budget: `${maxLcp}ms`,    severity: lcpMs > 4000 ? 'critical' : 'warning' });
    if (fidMs    > maxFid)    issues.push({ metric: 'FID',         actual: `${fidMs}ms`,    budget: `${maxFid}ms`,    severity: fidMs > 300  ? 'critical' : 'warning' });
    if (clsVal   > maxCls)    issues.push({ metric: 'CLS',         actual: String(clsVal),  budget: String(maxCls),   severity: clsVal > 0.25 ? 'critical' : 'warning' });

    const score = Math.max(0, 100 - issues.filter((i) => i.severity === 'critical').length * 25 - issues.filter((i) => i.severity === 'warning').length * 10);
    return {
        score,
        issues,
        summary: issues.length === 0
            ? 'Performance: all metrics within budget.'
            : `Performance: ${issues.length} issue(s). Score: ${score}/100.`,
    };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildTsPropsInterface(name: string, props: ComponentProp[]): string {
    if (props.length === 0) return `export interface ${name}Props {}`;
    const lines = [`export interface ${name}Props {`];
    for (const p of props) lines.push(`  ${p.name}${p.required ? '' : '?'}: ${p.type};`);
    lines.push('}');
    return lines.join('\n');
}

function buildDefaultProps(spec: ComponentSpec): string {
    if (spec.props.length === 0) return '';
    const pairs = spec.props
        .filter((p) => p.default !== undefined)
        .map((p) => `${p.name}={${p.default}}`);
    return pairs.length > 0 ? ` ${pairs.join(' ')}` : '';
}

function buildStyleFile(spec: ComponentSpec): { styleFilename?: string; styleCode?: string } {
    if (spec.styling === 'css-modules') {
        return {
            styleFilename: `${spec.name}.module.css`,
            styleCode:     `.root {\n  /* ${spec.name} styles */\n}\n`,
        };
    }
    if (spec.styling === 'scss') {
        return {
            styleFilename: `${spec.name}.scss`,
            styleCode:     `.${kebab(spec.name)} {\n  // ${spec.name} styles\n}\n`,
        };
    }
    return {};
}

function kebab(name: string): string {
    return name.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`).replace(/^-/, '');
}

/**
 * Returns a minimal, non-TODO inner content string for a generated component.
 * Replaces TODO stubs with real code built from the component spec — no LLM needed.
 *
 * Priority:
 *   1. `children` prop  → framework slot/children expression
 *   2. First renderable string/number prop → inline binding
 *   3. No renderable props → framework default slot (Vue/Svelte) or empty (React/Solid)
 */
function buildMinimalContent(
    spec:   ComponentSpec,
    syntax: 'react-jsx' | 'vue-template' | 'angular-html' | 'svelte-template' | 'solid-jsx',
): string {
    const hasChildren = spec.props.some((p) => p.name === 'children');
    const textProp = spec.props.find(
        (p) =>
            p.name !== 'children' &&
            !['className', 'class', 'style', 'onClick', 'onChange', 'onSubmit', 'ref'].includes(p.name) &&
            ['string', 'number', 'String', 'Number', 'React.ReactNode', 'ReactNode'].includes(p.type),
    );

    switch (syntax) {
        case 'react-jsx':
            if (hasChildren) return '{children}';
            if (textProp)    return `{${textProp.name}}`;
            return '';

        case 'solid-jsx':
            if (hasChildren) return '{props.children}';
            if (textProp)    return `{props.${textProp.name}}`;
            return '';

        case 'vue-template':
            if (!textProp)   return '<slot />';
            return `{{ ${textProp.name} }}`;

        case 'svelte-template':
            if (!textProp)   return '<slot />';
            return `{${textProp.name}}`;

        case 'angular-html':
            if (textProp)    return `{{ ${textProp.name} }}`;
            return '<ng-content></ng-content>';
    }
}

function mapTypeToVue(tsType: string): string {
    const map: Record<string, string> = { string: 'String', number: 'Number', boolean: 'Boolean', object: 'Object', any: 'Object' };
    return map[tsType] ?? 'Object';
}

function inferTokenCategory(name: string): DesignToken['category'] {
    if (/color|colour|fill|background|bg|stroke|border-color/i.test(name)) return 'color';
    if (/spacing|margin|padding|gap|space/i.test(name))                      return 'spacing';
    if (/font|text|type|size|weight|line-height|letter/i.test(name))         return 'typography';
    if (/shadow|elevation/i.test(name))                                      return 'shadow';
    if (/radius|rounded|corner/i.test(name))                                 return 'radius';
    return 'other';
}

function extractSelector(lines: string[], currentLine: number): string {
    for (let i = currentLine; i >= 0; i--) {
        const line = (lines[i] ?? '').trim();
        if (line.endsWith('{')) return line.replace('{', '').trim();
    }
    return 'unknown';
}
