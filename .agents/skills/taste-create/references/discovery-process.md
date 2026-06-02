# Discovery Process

> The phase-by-phase collaborative workflow for creating a visual style from scratch. This is the core process document — follow it sequentially, one phase at a time, one question at a time. The goal is not efficiency; it is understanding. You are helping someone discover what they already feel but cannot yet articulate.

---

## Before You Begin

When the skill triggers, read this file first. It is your map.

**Ground rules:**
- One question at a time. Never ask two questions in a single message.
- Listen more than you suggest. The user's instincts are the raw material.
- Do not skip phases. The order matters — soul before eyes, eyes before dimensions, dimensions before tokens, tokens before validation.
- Name the phase you are in. Say "We're in Phase 1 — Soul" so the user knows where they are in the journey.
- If the user wants to go back to a previous phase, go back. Discovery is not linear even if the process is.

---

## Phase 1 — Soul (Emotional Intent)

### Goal

Understand what the project should *feel* like, not what it should look like. Every visual decision downstream flows from this emotional foundation. If the soul is wrong, everything built on it will be wrong — technically correct but spiritually empty.

### Process

1. **Open with feeling.** Your first question should be about emotion, not aesthetics. Do not ask about colors, fonts, or layouts. Ask about feelings, memories, places, voices.

2. **Present choices with every question.** Each question should come with 3-4 curated options that represent meaningfully different directions, plus always a way for the user to write their own answer. The choices help people who feel but cannot yet name what they feel — seeing options crystallizes instinct. Use the AskUserQuestion tool to present these. The "Other" option is always available automatically.

3. **Ask one question at a time.** Wait for the answer. Let the answer inform your next question. Do not use a fixed script — pull from the question bank (see `question-bank.md`) but adapt the choices based on what the user has already said.

4. **Follow up after each choice.** When the user picks an option, ask a brief deepening question: "You picked [choice]. Tell me more — what does that mean to you?" or "What made you pick that over [other option]?" This turns a selection into a conversation.

5. **Listen for the unsaid.** When someone says "I want it to feel professional," ask what professional means to them. When they say "clean," ask what clean feels like. Surface-level words hide deeper truths. Your job is to find those truths.

6. **After 3-5 exchanges, synthesize.** Write 2-3 paragraphs of philosophy prose that captures what you have heard. This is not a summary — it is an interpretation. Write it with conviction, as if you believe it. Use the user's own words where they were vivid. Add your own where the user was circling something they could not name.

7. **Read it back.** Present the prose to the user and ask: "Does this capture what you mean?" If not, ask what is wrong, what is missing, what is overstated. Revise until the user says yes.

### Key Questions

Pull from `question-bank.md`. Each question should be presented with curated choices. Example flow:

**Question:** "What should someone feel when they use this?"
**Choices:** Calm and grounded / Excited and energized / Intrigued and curious / Safe and cared for / *(user can always type their own)*

**Question:** "If this project were a physical place, what place would it be?"
**Choices:** A quiet library / A research lab / A sunlit kitchen / A gallery opening / *(user can always type their own)*

The choices are not exhaustive — they are starting points. Adapt them based on what the user has already said. If they mentioned "warmth" in a previous answer, offer choices that explore different flavors of warmth.

### How to Synthesize

The philosophy prose should:
- Begin with the core emotional truth — one sentence that could stand alone as the project's north star
- Explain *why* this feeling matters for this project, not just what the feeling is
- Connect the abstract (the feeling) to the concrete (what kind of decisions this feeling implies)
- Be written in second person or first-person plural ("we believe," "this project speaks in...") — it is a shared manifesto, not a report

**Example structure (not a template — every soul is different):**

> This is a project that believes [core emotional truth]. When someone arrives, they should feel [primary feeling] — not because we've told them to feel it, but because every surface, every word, every space communicates [quality]. We avoid [anti-feeling] because [reason]. The closest analogy is [metaphor from the conversation]: [one sentence connecting the metaphor to the project].

### When to Move On

The user confirms the prose captures their intent. They say some version of "yes, that's it." Do not move on if they say "close enough" — close enough is not enough. The soul must feel true.

### Output

Save the approved prose as `soul.md` in the style package. This file becomes the emotional foundation that every subsequent decision references.

### Showcase Update

After the soul is confirmed, create the showcase page. Read `showcase-guide.md` — "Progressive Building" section for details. Create the HTML file with the Hero and Footer filled in, all other sections as placeholders. Open it in the browser so the user can see the soul taking shape. Say: "Here's your taste's showcase — right now it only has the soul. It will fill in as we go."

---

## Phase 2 — Eyes (Visual References)

### Goal

Build a shared visual vocabulary. Words are imprecise — "warm" means different things to different people. References make the abstract concrete. By the end of this phase, you and the user should be able to point at specific things and say "like that, but not like that."

### Process

1. **Prompt for visual references immediately.** Open Phase 2 by explicitly asking the user to share images. Say something like:

   > "Now I need to see what you see. Share anything visual that has the feeling we just described — URLs of websites you love, screenshots, moodboard images, photos of places or objects. Drop them here and I'll analyze each one. The more you share, the better I'll understand your eye."

   Be direct: tell them they can paste URLs, upload screenshots, or share file paths to images. Do not wait for them to figure out what to share — prompt them.

2. **For each reference, ask two questions:**
   - "What do you love about this?"
   - "What would you change?"

   Both answers matter equally. What they love tells you what to move toward. What they would change tells you where the reference diverges from their vision.

3. **Annotate each reference.** After the user responds, write a brief annotation: what this reference embodies from the soul, and what it does not. This creates a curated, interpreted reference list — not just a pile of links.

4. **Suggest your own references.** Based on the soul prose and the user's first few references, use WebSearch or WebFetch to find examples that match the emotional direction. Present them one at a time: "Based on what you've described, I think [reference] might resonate — it has [quality from the soul]. What do you think?"

5. **Note patterns.** After several references, tell the user what patterns you see: "I'm noticing you're drawn to [pattern] — does that feel right?" This helps them see their own taste.

**Analyzing URLs:**
- When user shares a URL, use WebFetch to fetch and analyze the page
- Describe what you observe: color palette, typography choices, spacing patterns, shape language, motion behavior, image treatment, overall tone
- Ask: "What do you love about this?" and "What would you change?"
- Note specific elements worth carrying forward or avoiding

**Analyzing Screenshots/Moodboards:**
- When user shares an image file path, use Read to view it
- Describe the visual style you observe in detail
- For moodboards with multiple images: identify common threads (shared colors, textures, feelings, typography patterns)
- Ask the user to confirm or correct your observations

**Proactive Suggestions:**
- Based on Phase 1 soul answers, suggest websites that might match the direction
- Use WebSearch to find examples if the user's metaphor suggests a direction (e.g., "Japanese garden" → search for minimal Japanese-inspired web design)

### When to Move On

You have 5-10 references with clear annotations. Each reference has both a "love" and a "change" note. The user feels the collection represents their direction. Quality matters more than quantity — 5 well-annotated references are better than 10 vague ones.

### Output

A curated reference list with annotations. Each entry includes:
- The reference (URL, description, or screenshot path)
- What the user loves about it
- What they would change
- Your annotation: what it embodies, what it does not

This list informs every subsequent phase. Store reference images in the `assets/moodboard/` directory if the user provides screenshots.

### Showcase Update

No showcase update after Phase 2. References are gathered, not rendered.

---

## Phase 3 — Dimensions (Positioning on Taste Axes)

### Goal

Position the style on each of the 7 axes of visual taste. This transforms vague preferences into specific coordinates. Each dimension is a spectrum, and the user's position on each spectrum directly maps to concrete tokens in Phase 4.

### Process

1. **Present one dimension at a time.** Read `style-dimensions.md` for the full specification of each dimension. Do not present all 7 at once — that is overwhelming.

2. **For each dimension:**
   - Name the dimension and briefly explain what it governs
   - Present the spectrum positions as options (use the positions from `style-dimensions.md`)
   - Ask the user where they fall
   - Ask *why* — the rationale matters as much as the position, because it connects back to the soul
   - Confirm the choice before moving to the next dimension

3. **Connect to the soul.** After the user picks a position, reflect it back through the lens of the soul: "You chose [position] for [dimension]. That aligns with the soul's emphasis on [quality] — [explanation]." This keeps the emotional foundation alive through the technical work.

4. **Use the reference list.** When a dimension is ambiguous, point to a reference: "In [reference], the spacing is [position]. Is that the density you want, or more/less?"

### Dimension Order

Walk through all 7 dimensions in this order:
1. **Tone** — Start here because it is the most abstract and closest to the soul. It sets the emotional frame for all other dimensions.
2. **Color** — The most immediately visible dimension.
3. **Typography** — The voice of the interface.
4. **Space** — How generous or dense the layout feels.
5. **Shape** — The physical character of elements.
6. **Motion** — Where life lives (or does not).
7. **Image** — How imagery is treated.

This order moves from abstract to concrete, keeping the soul present throughout.

### When to Move On

All 7 dimensions are positioned with rationale. Each position has a connection to the soul. If a dimension feels unresolved, revisit it — do not leave ambiguity for Phase 4 to resolve.

### Output

A style dimensions map: for each dimension, the position, the rationale, and how it connects to the soul. This becomes the blueprint for token derivation.

### Showcase Update

After all 7 dimensions are confirmed, update the showcase with directional previews. Read `showcase-guide.md` — "Progressive Building" section for details. Add rough color swatches, font family preview, spacing direction, shape preview, motion philosophy, and image treatment direction. Label these as "preview — values are approximate." Open in browser: "The dimensions are in — your showcase now has a preview of the visual direction. These values will sharpen in Phase 4."

---

## Phase 4 — Tokens (Concrete Values)

### Goal

Convert dimension positions into concrete design values. This is where the abstract becomes buildable. Every token should feel inevitable — as if the soul, the references, and the dimensions left no other choice.

### Process

1. **Derive, do not invent.** Each token should trace back to a dimension position, which traces back to the soul. If you cannot explain why a specific value was chosen, it is arbitrary, and arbitrary is wrong.

2. **Work through token groups in order:**

   **a. Colors**
   - Derive from the Color dimension position + soul
   - Define: primary, background, surface, border, text, text-muted, text-subtle, and any accent or functional colors
   - Present the palette to the user. Ask: "Does this palette feel like the soul we wrote?"

   **b. Typography**
   - Derive from the Typography dimension position
   - Select font family (or families, if the style calls for it)
   - Define size scale, weight range, line-height
   - Present a type specimen. Ask: "Does this font feel like the voice we described?"

   **c. Spacing**
   - Derive from the Space dimension position
   - Build the spacing scale (base unit and multiplier)
   - Present spacing in context (e.g., "This is how much breathing room a card would have"). Ask: "Too tight? Too loose? Just right?"

   **d. Shape**
   - Derive from the Shape dimension position
   - Define border-radius, border-width, border-style, shadow strategy
   - Present shape tokens applied to a simple rectangle. Ask: "Does this shape feel right?"

   **e. Motion**
   - Derive from the Motion dimension position
   - Define easing, duration scale, which elements animate
   - Describe the motion strategy in words. Ask: "Does this motion philosophy feel right?"

3. **Iterate each group.** Do not present all groups at once. Present one group, get approval, move to the next. If the user says "too dark" or "too tight," adjust and re-present.

4. **Cross-check against references.** When a token value is debatable, refer back to the references from Phase 2: "In [reference], the spacing was about [value]. Should we aim for that density?"

### When to Move On

The user has approved all token groups. Each group has been presented, discussed, and confirmed. No token feels arbitrary — each connects to a dimension, which connects to the soul.

### Output

A complete token set, organized by group:
- Colors (with hex values and purpose descriptions)
- Typography (family, sizes, weights, line-height)
- Spacing (scale with values)
- Shape (radius, borders, shadows)
- Motion (easing, durations, animation scope)

Each token includes prose context connecting it back to the soul. This becomes `tokens.md` in the style package.

### Showcase Update

After all token groups are approved, update the showcase with real values. Read `showcase-guide.md` — "Progressive Building" section for details. Replace all "preview" sections with exact token values. Restyle the showcase page itself using the taste's tokens — now the page *is* the taste. Open in browser: "Now the showcase is styled by the taste itself. These are the real values."

---

## Phase 5 — Validation (Test Against Components)

### Goal

Verify the style works in practice. Tokens on paper can feel right but look wrong when assembled into real components. This phase catches that gap.

### Process

1. **Generate 5 key components** using the tokens from Phase 4. These components test different aspects of the style:

   | Component | What it tests |
   |-----------|--------------|
   | **Button** (primary + secondary) | Color, typography, shape, spacing, interaction |
   | **Card** (with image and text) | Shape, spacing, typography hierarchy, image treatment |
   | **Heading + subtext** | Typography scale, weight, color hierarchy |
   | **Text input + label** | Shape, typography, spacing, focus state |
   | **Navigation bar** | Layout, typography, active/inactive states, spacing |

2. **Present each component as code.** Use HTML/CSS (or the user's preferred framework) with the token values applied. The code should be real and runnable, not pseudocode.

3. **For each component, ask:** "Does this feel right?" If the answer is no:
   - Ask: "What feels wrong? What's off?"
   - Identify whether the issue is a token problem (wrong value) or a principle problem (wrong approach)
   - Adjust the relevant tokens or approach
   - Regenerate and re-present
   - Repeat until approved

4. **Compile principles from the iteration.** Every rejection teaches something. Every approval confirms something. From the pattern of approvals and rejections, derive a list of do's and don'ts:
   - "Do: [thing that was consistently approved or explicitly requested]"
   - "Don't: [thing that was consistently rejected or explicitly called out]"

   Present the principles list to the user: "Based on what we've approved and rejected, here are the emerging rules. Anything to add or change?"

5. **Test the feeling.** After all 5 components are approved, ask: "Look at all five together. Do they feel like they belong to the same family? Do they feel like the soul we wrote?"

### When to Move On

All 5 components are approved. The principles list is confirmed. The user feels the components belong together and embody the soul.

### Output

- Component examples with code (becomes `components.md`)
- Principles list — do's and don'ts (becomes `principles.md`)

### Showcase Update

After all components are approved and principles confirmed, add the component gallery and do/don't comparisons to the showcase. Read `showcase-guide.md` — "Progressive Building" section for details. This is the final showcase update — every section is now complete. Open in browser: "The showcase is complete. Every section is filled. Open it and feel it."

---

## Final Packaging

After all 5 phases are complete, assemble the style package. Read `output-format.md` for the exact file structure and contents.

### Steps

1. **Create the style directory.** Name it using the style name in hyphen-case (ask the user for the name if not already established).

2. **Fill in the template files** from `assets/style-template/`:
   - `SKILL.md` from `SKILL.md.template` — fill in style name, description, voice, and feeling test
   - `references/soul.md` from Phase 1 output
   - `references/principles.md` from Phase 5 principles
   - `references/tokens.md` from Phase 4 tokens (with prose context)
   - `references/components.md` from Phase 5 components
   - `references/motion.md` from Phase 3 motion dimension + Phase 4 motion tokens
   - `references/imagery.md` from Phase 3 image dimension + concrete treatment rules

3. **Generate web output** (if the user wants web-specific implementation):
   - `references/web-implementation.md` — CSS custom properties, Tailwind config, utility classes
   - `assets/css/{style-name}.css` — complete base stylesheet

4. **Copy moodboard assets** from Phase 2 into `assets/moodboard/`.

5. **Write the SKILL.md.** This is the behavioral document — it tells Claude how to use the style. Use the same structure as `taste-quiet/SKILL.md`: modes (review, guide, generate), reference file guide, review checklist, judgment instruction. Customize the feeling test to match this style's soul.

6. **Validate.** Run the package validation script if available. Check that all referenced files exist, all template variables are filled, and the directory structure is correct.

7. **Offer to install.** Ask the user if they want to install the style as a Claude Code skill. If yes, provide instructions for installation.

### The Handoff

When packaging is complete, tell the user:

> "Your style is ready. It has a soul, a set of principles, concrete tokens, and tested components. The showcase page you've been watching grow is complete — open it to see the full picture. You can install this as a Claude Code skill, and it will accompany your development — reviewing your visual output, guiding your decisions, and generating code in your style. The style is yours. It came from your feelings, your references, your choices. I just helped you find the words."
