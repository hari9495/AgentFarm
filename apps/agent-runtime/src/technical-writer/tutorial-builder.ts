// ============================================================================
// TUTORIAL BUILDER
// Technical Writer Role
//
// Generates step-by-step tutorial documents and multi-tutorial learning paths.
//
// buildTutorialMarkdown   — single tutorial with prerequisites, steps, checkpoints
// buildTutorialSeries     — ordered learning path across multiple tutorials
// buildTutorialTemplate   — skeleton tutorial for a given level and step count
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TutorialLevel = 'beginner' | 'intermediate' | 'advanced';

export interface TutorialCodeBlock {
    language: string;
    content: string;
    /** Short label shown above the code block, e.g. "bash", "config.yaml". */
    filename?: string;
}

export interface TutorialStep {
    stepNumber: number;
    title: string;
    /** Explanation of what this step does and why. */
    description: string;
    /** Optional code to execute or paste. */
    code?: TutorialCodeBlock;
    /** What the reader should see after completing the step. */
    expectedOutput?: string;
    /** Common mistakes and how to resolve them. */
    troubleshooting?: string[];
    /** Confirmation statement: "You should now be able to..." */
    checkpoint?: string;
}

export interface Tutorial {
    title: string;
    level: TutorialLevel;
    /** Human-readable estimate, e.g. "15 minutes". */
    estimatedTime: string;
    /** Statements of what the reader will know or be able to do. */
    learningObjectives: string[];
    prerequisites: string[];
    steps: TutorialStep[];
    /** What to try or read after completing this tutorial. */
    nextSteps?: string[];
    /** Optional product/feature context. */
    product?: string;
}

export interface TutorialSeries {
    title: string;
    description: string;
    /** Ordered list of tutorials in the series. */
    tutorials: Tutorial[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const LEVEL_LABELS: Record<TutorialLevel, string> = {
    beginner: '🟢 Beginner',
    intermediate: '🟡 Intermediate',
    advanced: '🔴 Advanced',
};

function renderCodeBlock(code: TutorialCodeBlock): string {
    const label = code.filename ? `**\`${code.filename}\`**\n` : '';
    return `${label}\`\`\`${code.language}\n${code.content.trim()}\n\`\`\``;
}

// ---------------------------------------------------------------------------
// buildTutorialMarkdown
// ---------------------------------------------------------------------------

/**
 * Render a single tutorial as a complete Markdown document.
 * Includes: header, objectives, prerequisites, steps with checkpoints,
 * a troubleshooting summary, and next-steps links.
 */
export function buildTutorialMarkdown(tutorial: Tutorial): string {
    const date = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    // Header
    lines.push(`# ${tutorial.title}`);
    lines.push('');
    lines.push(`**Level:** ${LEVEL_LABELS[tutorial.level]}  `);
    lines.push(`**Time:** ${tutorial.estimatedTime}  `);
    if (tutorial.product) lines.push(`**Product:** ${tutorial.product}  `);
    lines.push(`**Updated:** ${date}`);
    lines.push('');

    // Learning objectives
    if (tutorial.learningObjectives.length > 0) {
        lines.push('## What You\'ll Learn\n');
        tutorial.learningObjectives.forEach((obj) => lines.push(`- ${obj}`));
        lines.push('');
    }

    // Prerequisites
    if (tutorial.prerequisites.length > 0) {
        lines.push('## Before You Begin\n');
        lines.push('Make sure you have completed or have the following:\n');
        tutorial.prerequisites.forEach((p) => lines.push(`- ${p}`));
        lines.push('');
    }

    lines.push('---');
    lines.push('');

    // Steps
    lines.push('## Steps\n');

    for (const step of tutorial.steps) {
        lines.push(`### Step ${step.stepNumber}: ${step.title}\n`);
        lines.push(step.description.trim());
        lines.push('');

        if (step.code) {
            lines.push(renderCodeBlock(step.code));
            lines.push('');
        }

        if (step.expectedOutput) {
            lines.push('**Expected output:**');
            lines.push('');
            lines.push('```');
            lines.push(step.expectedOutput.trim());
            lines.push('```');
            lines.push('');
        }

        if (step.checkpoint) {
            lines.push(`> ✅ **Checkpoint:** ${step.checkpoint}`);
            lines.push('');
        }

        if (step.troubleshooting && step.troubleshooting.length > 0) {
            lines.push('<details>');
            lines.push('<summary>Troubleshooting this step</summary>');
            lines.push('');
            step.troubleshooting.forEach((t) => lines.push(`- ${t}`));
            lines.push('');
            lines.push('</details>');
            lines.push('');
        }
    }

    // Collect all troubleshooting items for summary
    const allTroubleshooting = tutorial.steps.flatMap((s) =>
        (s.troubleshooting ?? []).map((t) => ({ step: s.stepNumber, title: s.title, tip: t })),
    );
    if (allTroubleshooting.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('## Troubleshooting Summary\n');
        lines.push('| Step | Issue / Tip |');
        lines.push('|------|-------------|');
        for (const t of allTroubleshooting) {
            lines.push(`| Step ${t.step}: ${t.title} | ${t.tip} |`);
        }
        lines.push('');
    }

    // Next steps
    if (tutorial.nextSteps && tutorial.nextSteps.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('## What\'s Next\n');
        tutorial.nextSteps.forEach((ns) => lines.push(`- ${ns}`));
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildTutorialSeries
// ---------------------------------------------------------------------------

/**
 * Render an ordered learning path from multiple Tutorial objects.
 * Produces a series overview page followed by individual tutorial content,
 * separated by clear dividers with progression indicators.
 */
export function buildTutorialSeries(series: TutorialSeries): string {
    const lines: string[] = [];
    const date = new Date().toISOString().split('T')[0];

    // Series overview
    lines.push(`# ${series.title}`);
    lines.push('');
    lines.push(`_${series.description.trim()}_`);
    lines.push('');
    lines.push(`**Updated:** ${date}  `);
    lines.push(`**Tutorials in series:** ${series.tutorials.length}  `);

    const totalTime = series.tutorials.reduce((sum, t) => {
        const m = t.estimatedTime.match(/(\d+)/);
        return sum + (m ? parseInt(m[1]!, 10) : 0);
    }, 0);
    if (totalTime > 0) lines.push(`**Total estimated time:** ~${totalTime} minutes`);
    lines.push('');

    // Learning path table
    lines.push('## Learning Path\n');
    lines.push('| # | Tutorial | Level | Time |');
    lines.push('|---|----------|-------|------|');
    series.tutorials.forEach((t, i) => {
        lines.push(`| ${i + 1} | ${t.title} | ${LEVEL_LABELS[t.level]} | ${t.estimatedTime} |`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');

    // Individual tutorials
    series.tutorials.forEach((t, i) => {
        lines.push(`## Part ${i + 1} of ${series.tutorials.length}: ${t.title}`);
        lines.push('');
        // Inline the tutorial content, de-duping the H1 title
        const tutorialMd = buildTutorialMarkdown(t)
            .split('\n')
            .filter((_, lineIdx) => lineIdx > 0) // skip the H1 — we already rendered it as H2
            .join('\n');
        lines.push(tutorialMd);
        lines.push('');
        if (i < series.tutorials.length - 1) {
            lines.push(`---\n\n_Continue to Part ${i + 2}: **${series.tutorials[i + 1]!.title}**_`);
            lines.push('');
            lines.push('---');
            lines.push('');
        }
    });

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildTutorialTemplate
// ---------------------------------------------------------------------------

/**
 * Generate a skeleton tutorial with placeholder content.
 * Use as a starting point before the TW agent fills in details.
 */
export function buildTutorialTemplate(
    title: string,
    level: TutorialLevel,
    stepCount: number,
    product?: string,
): Tutorial {
    const timeMins = level === 'beginner' ? 10 : level === 'intermediate' ? 20 : 30;

    const steps: TutorialStep[] = Array.from({ length: Math.max(1, stepCount) }, (_, i) => ({
        stepNumber: i + 1,
        title: `_[Step ${i + 1} title]_`,
        description: `_[Explain what the reader does in this step and why it is necessary.]_`,
        code: {
            language: 'bash',
            content: `# [Add the command or code for step ${i + 1}]`,
        },
        expectedOutput: `_[Describe what success looks like — output, UI state, or log message.]_`,
        checkpoint: `_[Complete this sentence: "You should now be able to..."]_`,
        troubleshooting: ['_[Common mistake and how to fix it]_'],
    }));

    return {
        title,
        level,
        product,
        estimatedTime: `${timeMins} minutes`,
        learningObjectives: [
            '_[Learning objective 1 — start with a verb: "Create", "Configure", "Understand"]_',
            '_[Learning objective 2]_',
        ],
        prerequisites: [
            '_[Required knowledge or completed tutorial]_',
            '_[Required software version or account access]_',
        ],
        steps,
        nextSteps: [
            '_[Related tutorial or deeper-dive documentation]_',
            '_[Feature to explore next]_',
        ],
    };
}
