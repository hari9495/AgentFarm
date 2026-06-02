# Output Format

> Specification for the style package that taste-create produces. This document tells you exactly what files to create, what goes in each, and how to map discovery outputs to the final package. The result is a complete Claude Code skill that can be installed and used as a visual taste companion.

---

## Directory Structure

```
{style-name}/
├── SKILL.md                    # Skill definition — behavioral instructions
├── references/
│   ├── soul.md                 # Philosophy and emotional foundation (Phase 1)
│   ├── principles.md           # Do's and don'ts (Phase 5)
│   ├── tokens.md               # Design tokens with prose context (Phase 4)
│   ├── components.md           # Component patterns with code (Phase 5)
│   ├── motion.md               # Motion rules and strategy (Phase 3 + 4)
│   └── imagery.md              # Image treatment guidelines (Phase 3 + 4)
├── assets/
│   ├── moodboard/              # Reference images from Phase 2
│   ├── css/                    # Base stylesheet (optional, web only)
│   │   └── {style-name}.css
│   └── examples/               # Visual examples
```

The `{style-name}` is in hyphen-case: lowercase, hyphens between words. Ask the user for a name if one has not been established during the discovery process.

---

## File Contents

### soul.md (from Phase 1)

The philosophy prose approved by the user in Phase 1, expanded into a full soul document.

**Structure:**

```markdown
# Soul

> [One-sentence summary of the emotional foundation.]

---

## The North Star

> [A quote, metaphor, or passage that captures the essence — drawn from the conversation.]

[2-3 paragraphs of philosophy prose from Phase 1. This is the approved text the user confirmed.]

---

## The Style's Voice

[One paragraph describing how the style speaks — its tone, its personality, its character. Derived from the Tone dimension (Phase 3) filtered through the soul.]

---

## Why Each Choice Exists

[For each major design decision (typography choice, color approach, shape language, etc.), write a subsection explaining the philosophical reason. Each subsection should be 2-4 sentences connecting the concrete choice to the emotional intent.]

### [Decision 1 — e.g., "Serif type — authority earned through history"]
[Explanation]

### [Decision 2 — e.g., "Warm earth colors — grounded, natural, honest"]
[Explanation]

[Continue for 4-6 major decisions]

---

## The Feeling Test

[A customized feeling test question specific to this style. It should be a question that can be asked after every design decision to check alignment with the soul.]

**[The question, bolded, specific to this style's values]**

[1-2 paragraphs explaining how to apply the test — what to look for, what to trust, when to override rules in favor of feeling.]
```

**Key points:**
- The "North Star" should come from the conversation — a quote the user said, a metaphor that emerged, or an external reference that captured the soul
- The "Why Each Choice Exists" section connects Phase 3/4 decisions back to Phase 1 emotions
- The feeling test is specific, not generic — "Does this feel like a well-set table?" is specific; "Does this feel right?" is generic

---

### principles.md (from Phase 5)

The do's and don'ts derived from component iteration in Phase 5.

**Structure:**

```markdown
# Principles

> [One sentence about what these rules are and where they come from.]

---

## Do

### [Principle name]
[One-sentence rationale connecting to soul.]

### [Principle name]
[One-sentence rationale.]

[8-12 "Do" principles]

---

## Never

### [Anti-principle name]
[One-sentence explanation of why this violates the style.]

### [Anti-principle name]
[One-sentence explanation.]

[6-10 "Never" principles]

---

## Edge Cases (Judgment Calls)

### [Situation 1]
[Guidance for a situation where the rules are ambiguous.]

### [Situation 2]
[Guidance.]

[3-5 edge cases specific to this style]
```

**Key points:**
- Every "Do" and "Never" traces to a specific moment in Phase 5 where the user approved or rejected something
- Rationales are one sentence, not paragraphs — principles should be scannable
- Edge cases come from moments where the user hesitated or where two principles seemed to conflict

---

### tokens.md (from Phase 4)

Design tokens with prose context. Platform-agnostic — no CSS custom properties here (those go in `web-implementation.md`).

**Structure:**

```markdown
# Tokens

> [One sentence about what tokens are and the relationship between prose and values.]

---

## Colors

[2-3 sentences of prose explaining the color philosophy — why these colors, what they mean.]

| Token | Value | Purpose |
|-------|-------|---------|
| `color.primary` | [hex] | [Purpose] |
| `color.background` | [hex] | [Purpose] |
| `color.surface` | [hex] | [Purpose] |
| `color.border` | [hex] | [Purpose] |
| `color.text` | [hex] | [Purpose] |
| `color.text-muted` | [hex] | [Purpose] |
| `color.text-subtle` | [hex] | [Purpose] |
| [any accent colors] | [hex] | [Purpose] |
| `color.error` | [hex] | [Purpose] |

[Optional: dark mode variants table]

---

## Typography

[Prose about the typography philosophy.]

| Token | Value | Notes |
|-------|-------|-------|
| `type.family` | [font stack] | [Notes] |
| `type.size.xs` | [value] | [Notes] |
| `type.size.sm` | [value] | [Notes] |
| `type.size.base` | [value] | [Notes] |
| `type.size.lg` | [value] | [Notes] |
| `type.size.xl` | [value] | [Notes] |
| `type.size.2xl` | [value] | [Notes] |
| `type.size.3xl` | [value] | [Notes] |
| `type.weight.normal` | [value] | [Notes] |
| `type.weight.medium` | [value] | [Notes] |
| `type.weight.bold` | [value] | [Notes] |
| `type.lineHeight` | [value] | [Notes] |

---

## Spacing

[Prose about the spacing philosophy.]

| Token | Value | Notes |
|-------|-------|-------|
| `space.xs` | [value] | [Notes] |
| `space.sm` | [value] | [Notes] |
| `space.md` | [value] | [Notes] |
| `space.lg` | [value] | [Notes] |
| `space.xl` | [value] | [Notes] |
| `space.2xl` | [value] | [Notes] |

---

## Shape

[Prose about the shape philosophy.]

| Token | Value | Notes |
|-------|-------|-------|
| `shape.radius` | [value] | [Notes] |
| `shape.borderWidth` | [value] | [Notes] |
| `shape.borderStyle` | [value] | [Notes] |
| `shape.borderColor` | [reference] | [Notes] |
| `shape.shadow` | [value] | [Notes] |

---

## Motion

[Prose about the motion philosophy.]

| Token | Value | Notes |
|-------|-------|-------|
| `motion.easing` | [value] | [Notes] |
| `motion.duration.fast` | [value] | [Notes] |
| `motion.duration.base` | [value] | [Notes] |
| `motion.duration.slow` | [value] | [Notes] |

[Scope: what animates and what does not]
```

**Key points:**
- Every token group starts with prose before the table — the prose explains the philosophy, the table provides the values
- The token names are abstract (e.g., `color.primary`, not `--taste-color-primary`) — CSS-specific naming lives in `web-implementation.md`
- Purpose/Notes columns connect values to the soul
- Not every style needs every token — if a style has no motion, the motion section can say "This style does not animate"

---

### components.md (from Phase 5)

The approved component patterns with code examples.

**Structure:**

```markdown
# Components

> [One sentence about what these patterns represent.]

---

## Button

### Primary

[Prose about what the primary button feels like — 2-3 sentences.]

**Properties:**
[Bulleted list of token references for each property]

[HTML + CSS code block]

### Secondary

[Same structure as primary]

---

## Card

[Prose + properties + code]

---

## Heading + Subtext

[Prose + properties + code]

---

## Text Input + Label

[Prose + properties + code]

---

## Navigation

[Prose + properties + code]

---

## [Optional: Layout Patterns]

[If layout conventions emerged during validation]
```

**Key points:**
- The code should be real and runnable — HTML + CSS minimum, framework-specific if the user prefers
- CSS values reference token names (abstract for the properties list, CSS custom properties in the code blocks)
- Prose comes before code — explain what the component should feel like before showing how it is built
- The component list can be extended if the user validated additional components

---

### motion.md (from Phase 3 + 4)

Expanded motion rules from the Motion dimension and motion tokens.

**Structure:**

```markdown
# Motion

> [One sentence about the motion philosophy.]

---

## What Animates

[Description of what is permitted to animate, with code examples.]

### [Category 1 — e.g., Illustrations]
[Description + CSS example]

### [Category 2 — e.g., Data Visualizations]
[Description + CSS example]

---

## What Never Animates

[Explicit list of structural elements that must not animate.]

### [Category 1 — e.g., Buttons]
[Why not]

### [Category 2 — e.g., Modals]
[Why not]

---

## Motion Properties

### Easing
[Description + value]

### Performance
[Guidelines]

### Reduced Motion
[prefers-reduced-motion handling]

---

## The Motion Test

[A question to ask before adding any animation.]
```

**Key points:**
- If the style's motion position is "Still," this file should still exist but should say clearly: "This style does not animate. Stillness is the design choice. The only exception is loading indicators."
- The "What Never Animates" section is important even for fluid/playful styles — there should always be some restraint
- Include `prefers-reduced-motion` handling regardless of the style's position

---

### imagery.md (from Phase 3 + 4)

Image treatment rules from the Image dimension.

**Structure:**

```markdown
# Imagery

> [One sentence about the imagery philosophy.]

---

## Treatment

[How images are visually processed — filter, color, effects.]

[CSS example]

---

## Positioning

[How images are placed within the layout — tethered, floating, background, etc.]

[Good/bad examples described in prose]

---

## Aspect Ratio

[How to handle images that do not match container proportions.]

[CSS example]

---

## CSS Patterns

### Base Image Treatment
[Standard code pattern]

### [Variant 1 — e.g., Full-Bleed Image]
[Code pattern]

### [Variant 2 — e.g., Image in Card]
[Code pattern]

---

## Captions

[How captions are styled and positioned.]

[CSS example]
```

---

### SKILL.md

The behavioral document. This tells Claude how to act when the style skill is active.

**Structure:**

```markdown
---
name: {style-name}
description: |
  {{STYLE_DESCRIPTION}}
---

# {Style Name}

## Overview

{{STYLE_VOICE}}

You do not contain the style itself — the style lives in the reference files. Your job is to know *when* to read *which* reference, and to apply what you find with good judgment.

## How to Determine Your Mode

[Three modes: Review, Guide, Generate — same structure as taste-quiet/SKILL.md]

### Review Mode
[When triggered, what to read, how to respond]

### Guide Mode
[When triggered, what to read, how to respond]

### Generate Mode
[When triggered, what to read, how to respond]

## Reference File Guide

| When you need... | Read... |
|------------------|---------|
| Emotional intent | `references/soul.md` |
| Do's and don'ts | `references/principles.md` |
| Token values | `references/tokens.md` |
| Component patterns | `references/components.md` |
| Motion rules | `references/motion.md` |
| Image treatment | `references/imagery.md` |
| CSS implementation | `references/web-implementation.md` |
| Base stylesheet | `assets/css/{style-name}.css` |

## The Review Checklist

1. **Tokens:** Are the right values used?
2. **Principles:** Are the do's followed and don'ts avoided?
3. **Motion:** Is motion appropriate?
4. **Imagery:** Are images treated correctly?
5. **Soul:** Does it *feel* right?

## The Judgment Instruction

{{FEELING_TEST}}

[Guidance on how to resolve ambiguity — what to choose when two valid options exist, what to trust when rules and feeling disagree.]
```

**Template variables:**
- `{{STYLE_NAME}}`: The style name in hyphen-case (e.g., `warm-editorial`)
- `{{STYLE_DESCRIPTION}}`: A multi-line description for the frontmatter. Should explain what the skill does, when to trigger it, and what visual scenarios it covers. Be specific about the aesthetic so Claude knows when to activate.
- `{{STYLE_VOICE}}`: A one-paragraph description of the style's personality. Comes from the soul prose + tone dimension. This is the first thing Claude reads when the skill activates.
- `{{FEELING_TEST}}`: The customized feeling test from soul.md. A specific question (not "does this feel right?" — something tied to the style's metaphor or core emotion).

---

## Web Output (Optional)

If the user wants web-specific implementation, also generate these files:

### references/web-implementation.md

Maps abstract tokens to CSS custom properties, provides framework configuration, and covers practical web concerns.

**Must include:**
- All tokens as CSS custom properties on `:root` (naming convention: `--{style-name}-{category}-{name}`)
- Dark mode variant (if applicable) via `prefers-color-scheme`
- Tailwind CSS configuration (if user uses Tailwind)
- Font loading strategy (Google Fonts link, self-hosted `@font-face`, or system font note)
- Utility classes for common patterns
- Reset/normalization notes
- Import order guidance

### assets/css/{style-name}.css

A complete base stylesheet that implements the tokens as CSS. This is a ready-to-use file the user can drop into a project.

**Must include:**
- CSS custom properties for all tokens
- Base element styles (body, headings, paragraphs, links, lists, code, pre)
- Button styles (primary + secondary)
- Form element styles (input, textarea, select, label)
- Card styles
- Image treatment (filter + positioning)
- Layout utilities (content width, section spacing, grid)
- Reduced motion media query
- Dark mode media query (if applicable)

---

## Validation Checklist

Before declaring the style package complete, verify:

- [ ] All files in the directory structure exist
- [ ] `SKILL.md` has valid YAML frontmatter with `name` and `description`
- [ ] `soul.md` contains the approved philosophy prose
- [ ] `principles.md` has both "Do" and "Never" sections
- [ ] `tokens.md` has all 5 token groups (colors, typography, spacing, shape, motion)
- [ ] `components.md` has at least 5 component patterns with code
- [ ] `motion.md` has both "what animates" and "what never animates"
- [ ] `imagery.md` has treatment, positioning, and CSS patterns
- [ ] No template variables remain (no `{{PLACEHOLDER}}` text in any file)
- [ ] All CSS code blocks use the style's custom property naming convention
- [ ] The feeling test in `SKILL.md` and `soul.md` is specific to this style
- [ ] Token values in `tokens.md` match values used in component code in `components.md`
- [ ] Web output (if generated) has correct custom property prefix matching the style name

---

## Showcase Page (Progressive)

The showcase page is built progressively during discovery, not after packaging. It grows with each phase so the user can feel their taste taking shape.

Read `showcase-guide.md` for the full specification, including the progressive build schedule.

### Output

```
{style-name}/
├── assets/
│   └── showcase/
│       └── index.html          # Standalone showcase page
```

The showcase page:
- Inlines the taste's CSS or links to `assets/css/{style-name}.css`
- Loads the taste's fonts (Google Fonts link in `<head>`)
- Works standalone — no build step, no framework, just open in a browser
- Is responsive (works on mobile)
- Uses the taste's own tokens and components to demonstrate the taste

### Build Schedule

| After Phase | What Gets Added |
|-------------|----------------|
| Phase 1 (Soul) | HTML file created. Hero + Footer. Placeholders for other sections. |
| Phase 3 (Dimensions) | Directional previews: rough colors, font family, spacing, motion, imagery. |
| Phase 4 (Tokens) | Real values replace previews. Page restyled with the taste's own tokens. |
| Phase 5 (Validation) | Component gallery + principles do/don't comparisons. Showcase complete. |

Every update opens the page in the browser.
