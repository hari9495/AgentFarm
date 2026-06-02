# Showcase Guide

> How to build a showcase page for a taste. The showcase is a single HTML page built using the taste's own CSS — it demonstrates every aspect of the style while being styled by it. It is both the documentation and the proof.

---

## What the Showcase Is

A standalone HTML file that someone can open in a browser and immediately *feel* the taste. It shows every token, every component, every principle — rendered live in the taste itself. If the taste is about dark surfaces and glowing data, the showcase page is dark with glowing data. If the taste is about quiet monospace honesty, the showcase page is quiet and monospace.

The showcase serves three purposes:
1. **Proof** — does the taste actually work as a cohesive system?
2. **Communication** — show someone the taste in 30 seconds
3. **Reference** — a living document developers can inspect (view source) to understand how components are built

---

## Structure of the Showcase Page

The page is a single `index.html` file that inlines the taste's CSS (or links to it). It has these sections in order:

### 1. Hero — The Soul

The taste's name in display typography, the one-paragraph voice description, and the feeling test question. This is the first thing someone sees. It should immediately communicate the taste's personality.

```html
<section class="showcase-hero">
  <h1 class="showcase-title">{Taste Name}</h1>
  <p class="showcase-voice">{The style's voice paragraph}</p>
  <p class="showcase-feeling">{The feeling test question}</p>
</section>
```

### 2. Color Palette

Visual swatches of every color token. Each swatch shows:
- The color as a filled rectangle
- The token name
- The hex value
- The purpose (one line)

Arrange as a grid. Group: base colors, then text colors, then accent colors (if any).

```html
<section class="showcase-section">
  <h2>Colors</h2>
  <div class="showcase-palette">
    <div class="showcase-swatch" style="--swatch: {hex}">
      <div class="showcase-swatch-color"></div>
      <span class="showcase-swatch-name">{token name}</span>
      <span class="showcase-swatch-value">{hex}</span>
    </div>
    <!-- repeat for each color -->
  </div>
</section>
```

### 3. Typography Specimen

Show every type size, weight, and the font family in action:
- The font name and stack
- Each size rendered with its name and rem/px value
- Weight variations (normal, medium, bold)
- A paragraph of body text at the base size
- A heading + subtext pair

```html
<section class="showcase-section">
  <h2>Typography</h2>
  <div class="showcase-type-scale">
    <div class="showcase-type-sample" style="font-size: {value}">
      <span class="showcase-type-label">{token name} — {value}</span>
      The quick brown fox jumps over the lazy dog
    </div>
    <!-- repeat for each size -->
  </div>
</section>
```

### 4. Spacing Scale

Visual representation of the spacing tokens. Show each space value as:
- A horizontal bar whose width matches the value
- The token name and value beside it

```html
<section class="showcase-section">
  <h2>Spacing</h2>
  <div class="showcase-spacing">
    <div class="showcase-space-row">
      <span class="showcase-space-label">{token name} — {value}</span>
      <div class="showcase-space-bar" style="width: {value}"></div>
    </div>
    <!-- repeat for each space token -->
  </div>
</section>
```

### 5. Component Gallery

Every validated component rendered live. Each component gets:
- Its name as a heading
- The prose description (one sentence)
- The live rendered component
- All interactive states visible (show hover state alongside default, or let the user hover)

Components to show:
- Button (primary, secondary, text link)
- Card (with and without image)
- Text input + label
- Heading + subtext
- Navigation
- Any additional components from Phase 5

```html
<section class="showcase-section">
  <h2>Components</h2>

  <div class="showcase-component">
    <h3>Button</h3>
    <p class="showcase-component-desc">{prose description}</p>
    <div class="showcase-component-demo">
      <button class="btn btn-primary">Primary</button>
      <button class="btn btn-secondary">Secondary</button>
      <a class="btn-text" href="#">Text Link ></a>
    </div>
  </div>

  <!-- repeat for each component -->
</section>
```

### 6. Motion (if the taste has motion)

Demonstrate motion principles. Include:
- Interactive elements the user can hover/click to see motion
- A description of what animates and what doesn't
- If the taste has ambient motion, show a small example

For tastes with no motion (like taste-quiet), this section says: "This style is still. Nothing animates. Stillness is the design choice."

### 7. Image Treatment

Show how images are treated in this taste:
- A sample image with the taste's filter/treatment applied
- Before/after if the treatment is transformative (e.g., halftone, scan-line, wireframe)
- An image inside a card component
- An image in a full-bleed layout

Use a placeholder image or a simple photograph. The treatment should be visibly applied via CSS.

### 8. Principles (Do / Don't)

A two-column layout showing:
- Left: "Do" examples — small visual demonstrations of correct choices
- Right: "Don't" examples — small visual demonstrations of violations

Each pair shows the same element done right and done wrong. For example:
- Do: Square button with 0px radius / Don't: Rounded button with 8px radius
- Do: Monospace heading / Don't: Sans-serif heading

Use actual rendered HTML, not descriptions. The viewer should *see* the difference.

```html
<section class="showcase-section">
  <h2>Principles</h2>
  <div class="showcase-principles">
    <div class="showcase-principle">
      <div class="showcase-do">
        <span class="showcase-label">Do</span>
        <!-- correct example rendered -->
      </div>
      <div class="showcase-dont">
        <span class="showcase-label">Don't</span>
        <!-- incorrect example rendered -->
      </div>
      <p class="showcase-principle-why">{rationale}</p>
    </div>
    <!-- repeat for 4-6 key principles -->
  </div>
</section>
```

### 9. Footer

The philosophy quote or north star. A quiet ending.

---

## Building the Showcase

When generating the showcase page:

1. **Read the taste's CSS file** — use it as the stylesheet for the showcase page
2. **Read tokens.md** — use exact values for swatches, type specimens, spacing bars
3. **Read components.md** — copy the component HTML/CSS directly into the gallery
4. **Read soul.md** — use the voice paragraph and feeling test for the hero
5. **Read principles.md** — select 4-6 key do/don't pairs for the principles section
6. **Read motion.md** — determine what to show for motion
7. **Read imagery.md** — determine image treatment to demonstrate

The page should:
- Be a single HTML file with all CSS inlined or linked to the taste's stylesheet
- Load the taste's fonts (Google Fonts link in `<head>`)
- Work standalone — no build step, no framework, just open in a browser
- Be responsive (works on mobile)
- Include a `<meta name="viewport">` tag
- Use semantic HTML

Save to: `{taste-name}/assets/showcase/index.html`

---

## Showcase CSS

The showcase page uses the taste's own CSS for all components. But it also needs some showcase-specific layout CSS for the sections, swatches, specimens, etc. This showcase CSS should:

- Be minimal — just enough to lay out the showcase sections
- Not conflict with the taste's CSS
- Use `.showcase-` prefixed classes to avoid collisions
- Be inlined in a `<style>` block at the top of the page

Key showcase layout styles:
- `.showcase-hero`: full-viewport-height intro section
- `.showcase-section`: padded section with max-width content
- `.showcase-palette`: CSS grid of color swatches
- `.showcase-type-scale`: vertical stack of type samples
- `.showcase-spacing`: vertical stack of space bars
- `.showcase-component`: component demo with heading and live example
- `.showcase-principles`: two-column do/don't grid
- `.showcase-swatch-color`: square of the swatch color (use inline style for the background)

---

## Progressive Building

The showcase is not built at the end — it grows with the discovery process. After each phase, update the showcase with what was just discovered and open it in the browser. The user sees their taste taking shape in real time.

### Build Schedule

| After Phase | What to Add | What the User Sees |
|-------------|-------------|-------------------|
| **Phase 1 — Soul** | Create the HTML file. Add Hero (name, voice, feeling test) + Footer (philosophy quote). All other sections show as labeled placeholders. | The soul of the taste, rendered in a default monospace style. The page exists. |
| **Phase 2 — Eyes** | No showcase update. References are gathered, not rendered. | — |
| **Phase 3 — Dimensions** | Add directional previews for each dimension: rough color palette based on position, font family preview, spacing direction, motion philosophy statement, image treatment direction. Sections are labeled "preview — values are approximate." | The shape of the taste emerging. Colors, type, and space are visible but not final. |
| **Phase 4 — Tokens** | Replace all previews with exact token values. Real hex colors, real font sizes, real spacing scale, real shape values. Remove "preview" labels. Style the page itself with the taste's tokens. | The taste's real visual identity. Every section is now precise. |
| **Phase 5 — Validation** | Add component gallery with approved components. Add principles do/don't comparisons with live rendered examples. | The complete showcase — every aspect of the taste, demonstrated by the taste itself. |

### How to Build Progressively

**Phase 1 — Create the file:**
1. Create `{taste-name}/assets/showcase/index.html`
2. Set up the full HTML structure with all 9 section containers
3. Fill in Hero and Footer from the approved soul prose
4. For unfilled sections (2–8), render a quiet placeholder: the section label and a single line like "Discovered in Phase 3" or "Discovered in Phase 4"
5. Use a clean default style — monospace font, black on white, generous spacing. This is a safe starting point that will be replaced by the taste's own tokens later.
6. Open in browser: "Here's your taste's showcase — right now it only has the soul. It will fill in as we go."

**Phase 3 — Add dimension previews:**
1. Read the dimension positions just confirmed
2. For Color: generate a rough 4–6 swatch palette based on the position (e.g., "Muted earth" → sample ochre, sage, clay, stone swatches). Label as "preview."
3. For Typography: load the font family from the position and show a specimen. Label as "preview."
4. For Spacing: show a rough scale based on the position (generous vs. dense). Label as "preview."
5. For Shape: show a sample rectangle with the position's character.
6. For Motion: write the motion philosophy statement.
7. For Image: describe the treatment direction.
8. Open in browser: "The dimensions are in — your showcase now has a preview of the visual direction. These values are approximate; they'll sharpen in Phase 4."

**Phase 4 — Replace with real tokens:**
1. Read the approved token values
2. Replace every preview section with exact values: real hex swatches, real type specimen, real spacing bars
3. Update the page's own CSS to use the taste's tokens — now the showcase *is* the taste
4. Remove all "preview" labels
5. Open in browser: "Now the showcase is styled by the taste itself. These are the real values."

**Phase 5 — Add components and principles:**
1. Add the component gallery with approved component code
2. Add principles do/don't with live rendered examples
3. Final polish: ensure all sections are complete and the page is cohesive
4. Open in browser: "The showcase is complete. Every section is filled. Open it and feel it."

### Key Principle

Every time the showcase is updated, open it in the browser. The user should *see* their taste growing. This is not a report generated at the end — it is a living document that evolves with the conversation.

---

## When to Build (Outside Discovery)

The showcase can also be built or rebuilt:
- When the user asks to "see the taste", "show me", "build a demo", or "create a showcase"
- After packaging, if no progressive showcase was built: "Want me to build a showcase page so you can see your taste in action?"
- When the user says "update the showcase" after changing tokens or principles
