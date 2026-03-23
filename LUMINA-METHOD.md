# LUMINA METHOD — Human-AI Co-Building Framework

**Version:** 1.0  
**Origin:** Built during the LUMINA smart lighting session, March 2026  
**Companion:** LUMINA-METHOD.html (human-readable, print-ready)

---

## Purpose

This file is the machine-readable encoding of a build process that produced a complete,
polished PWA (LUMINA) in ~90 minutes. It is intended to be ingested by an orchestrator
agent (Tex) at the start of a new project to reproduce the process shape. The method
generalizes beyond smart home apps to any project where the output is a software product
and the collaborator is an AI agent with coding capability.

---

## The Three-Role Model

Every build using this method involves three distinct AI roles. **Do not collapse them.**

| Role | Agent | Function |
|---|---|---|
| **Orchestrator** | Tex (persistent session) | Holds project context, discovers materials, writes the spec prompt, manages files and git, delegates to sub-agents, handles deployment |
| **Design Intelligence** | Opus / most capable model + extended thinking | Receives the spec prompt, makes all aesthetic and architectural decisions, names the product, outputs the spec document |
| **Mechanical Builder** | Claude Code sub-agent | Receives spec + scaffold, wires everything together, fixes type errors, generates assets, runs the build — does NOT make design decisions |

**Rule:** No role crosses into another's lane. The builder executes the spec. It does not design. The orchestrator composes the brief. It does not design either. Design is a single, focused pass by the most capable available model.

---

## The Five-Phase Process

### Phase 1 — Discover the Material
**Goal:** Accumulate tacit knowledge before writing a single spec line.

- Interact with the raw substrate: hardware, data, user, API
- Use the simplest possible tooling (curl, a test script, a REPL)
- Document what you find: capabilities, constraints, exact values
- Do NOT skip this phase. A spec written without it is speculative.

**In LUMINA:** Raw UDP broadcast found the bulb. Python script confirmed the color/brightness protocol. Real values landed before any design decision was made.

### Phase 2 — Iterate in the Real Environment
**Goal:** Use embodied, real-time feedback to lock in ground truth.

- Work in the medium where feedback is fastest and most honest
- For hardware/physical products: be in the room
- For UI: use a real device, not a browser simulation
- For APIs: curl against the live endpoint
- Lock in values through iteration, not estimation
- Each iteration should be < 30 seconds from change to feedback

**In LUMINA:** Seven presets tuned live. Cody in the room. Each preset locked in ≤ 3 iterations. Velvet brightness went 40% → 32% because of physical perception, not a preference survey.

### Phase 3 — Write the Spec Prompt
**Goal:** Produce a brief comprehensive enough that the spec author needs no follow-up.

The spec prompt must include:

- [ ] Context: what exists, what tech stack, what constraints
- [ ] Preset/data table: exact values discovered in Phases 1–2
- [ ] Aesthetic brief: named design references (films, products, brands), NOT adjectives
- [ ] Anti-patterns: explicit list of what NOT to do
- [ ] Typography: named typefaces, not "something elegant"
- [ ] Color: exact hex values where known, ranges where not
- [ ] Component list: every UI component named
- [ ] Animation spec: what moves, easing, duration
- [ ] API contract: endpoints, request/response shapes
- [ ] File structure: exact paths
- [ ] Output format: numbered sections, what each must contain
- [ ] Tone note: opinionated, no hedging, source of truth

**Rule:** The prompt should be ~800–1500 words. A shorter prompt produces a weaker spec.  
**Rule:** The orchestrator (Tex) drafts the prompt. The human reviews and approves it. This is the one human checkpoint before building starts.

### Phase 4 — Generate and Review the Spec
**Goal:** Produce a complete, opinionated spec document. Review it once.

- Send the prompt to: Claude Opus (most capable available) with extended thinking enabled
- Output format: markdown document, saved to project directory as `[PRODUCT]-SPEC.md`
- Human review: one pass, focused on taste and correctness
- This is the **last point where human judgment intervenes**
- Everything downstream is execution against this document

**What a good spec contains:**
- Color system (tokens, hex values, all states)
- Typography scale (font, size, weight, tracking, transform for each role)
- Component breakdown (visual appearance, all states, tap behavior)
- Layout spec (viewport target, spacing system, grid math)
- Animation spec (keyframes, duration, easing, what triggers what)
- PWA/icon spec if applicable
- API contract (all endpoints, request/response shapes)
- Complete backend code (ready to run)
- Frontend scaffolding (root files complete, components stubbed with enough detail)
- Startup instructions (exact commands)

### Phase 5 — Execute Mechanically
**Goal:** Build the spec. Zero design decisions by the builder.

- Spawn a Claude Code sub-agent in the project directory
- Provide: the spec document, all scaffold files, and a detailed implementation brief
- The brief must state: "Do not deviate from the spec. Do not make design decisions."
- The brief must include: exact file paths, known issues to fix, verification steps
- Builder runs: install → build → verify clean pass → commit
- Commit message format: `feat: complete [product] — full build passing`

**Signs the build went wrong:**
- Builder made color or layout decisions not in the spec
- Builder added features not in the spec
- Build fails TypeScript/lint — must be fixed before declaring done
- Spec and code are out of sync

---

## Spec Prompt Template

Use this as the structural skeleton for any new project spec prompt:

```
# Prompt: [Product Name] — Design Spec & Build Brief

You are a senior product designer and full-stack engineer with exceptional taste.
Produce a complete, implementation-ready spec for: [one-sentence description].
This will be handed directly to a coding agent — leave nothing ambiguous.

## Context
[Existing tech, stack, related apps, constraints]

## Data / Presets
[Table of exact values discovered in Phase 2]

## Aesthetic Brief
[3–5 named design references. Specific typefaces. Specific colors. Anti-patterns.]

## Functional Requirements
[Numbered list. Every screen, every interaction.]

## Technical Stack
[Backend: language, framework, port. Frontend: library, bundler, port. Deployment.]

## File Layout
[Exact directory tree]

## Deliverable
[Numbered output sections matching the spec structure above]

Be opinionated. Make calls. Do not hedge. This spec is the source of truth.
```

---

## Critical Rules (do not violate)

1. **Discover before specifying.** Never write a spec for something you haven't touched.
2. **Real feedback beats imagined feedback.** Be in the room. Use the real device.
3. **Aesthetic precision is functional.** Named references > adjectives. Hex codes > "warm."
4. **The spec is the source of truth.** If it's not in the spec, the builder shouldn't decide it.
5. **Roles don't cross lanes.** Orchestrator briefs. Thinker specifies. Builder executes.
6. **One human checkpoint.** Review the spec prompt before sending. Review the spec before building. That's it.
7. **Proven stack = zero architecture debate.** Don't evaluate frameworks during a build sprint.
8. **Build clean or don't build.** TypeScript errors, lint failures, and missing assets are not "close enough."

---

## When to Use This Method

Use the LUMINA method when:
- You have a clear product idea but a blank codebase
- The project involves a UI and/or an API
- You have (or can establish) a proven tech stack
- You can get real feedback on the product in Phase 2

Do NOT use this method when:
- The project is exploratory research (no clear deliverable yet)
- The aesthetic or functional direction is genuinely unknown (do Phase 1–2 first, then return)
- The project is a one-file script or a trivial change (just build it)

---

## Artifacts This Method Produces

Every LUMINA-method build should produce these artifacts, committed to the repo:

| File | Contents |
|---|---|
| `[PRODUCT]-SPEC.md` | Complete design and technical spec from Phase 4 |
| `[PRODUCT]-METHOD.html` | Human-readable PDF-quality document (from Opus) |
| `[PRODUCT]-METHOD.md` | This file (machine-readable, agent-ingestible) |
| `docs/plans/YYYY-MM-DD-[feature].md` | Implementation plan for each feature |

---

*This file is the source of truth for the LUMINA method. Update it when the method evolves.*  
*Generated: March 2026 · Cody + Tex · San Francisco*
