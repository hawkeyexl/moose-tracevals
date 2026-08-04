---
id: cuj-fill-criteria
type: cuj
title: Propose criteria across a whole project and review the diff
personas: [persona-artifact-author]
trigger: "There are more artifacts than anyone will hand-write criteria for, and adoption is about to stall on authoring cost."
entry_point: /agentevals/declare/fill/
success_criteria: "Every instruction artifact in the project has been offered criteria, the reader has reviewed a real diff, and only criteria they accept have been written — with project rules left untouched."
steps:
  - { stage: "See what fill is for and what it refuses to do", doc: "/agentevals/declare/fill/#what-fill-does", exists: true }
  - { stage: "Dry-run across the project", doc: "/agentevals/declare/fill/#dry-run-first", exists: true, note: "--dry-run is the recommended first invocation, always" }
  - { stage: "Read the proposal report", doc: "/agentevals/declare/fill/#read-the-proposals", exists: true }
  - { stage: "Understand why a proposal was rejected", doc: "/agentevals/declare/fill/#why-a-proposal-was-rejected", exists: true, note: "the gate order — confidence is last, not first" }
  - { stage: "Act on needs-sharpening notes", doc: "/agentevals/declare/fill/#instructions-that-cannot-be-tested", exists: true }
  - { stage: "Write, then review the diff", doc: "/agentevals/declare/fill/#write-and-review", exists: true }
  - { stage: "Copy project-rules proposals by hand", doc: "/agentevals/declare/fill/#project-rules-are-never-written", exists: true }
  - { stage: "Tune the threshold and the cap", doc: /agentevals/reference/cli/, exists: true }
---

# CUJ: Propose criteria across a whole project and review the diff

**Scope:** bulk authoring with `fill`, the product's one write path. Authoring a single criterion by
hand is [`cuj-declare-criteria`](cuj-declare-criteria.md); this journey assumes that vocabulary and
is about volume and trust.

**Trigger.** The reader has declared one criterion, likes the result, and has counted the artifacts
in their repository. Hand-writing criteria for all of them is the step that ends adoption.

**Narrative.** `fill` is the only command that writes, which makes trust the whole journey. Three
claims have to be made early and made credibly, because a tool that edits hand-tuned instruction
files without earning that right is uninstallable:

- **`--dry-run` first, always.** It is the recommended first invocation and the fastest way to see
  what the tool thinks of your artifacts without consequence.
- **Everything lands in a reviewable diff.** Existing criteria are never modified; a name collision
  is an error rather than an overwrite; only the frontmatter block is rewritten.
- **Project rules are proposed but never written.** Criteria inside a file the agent reads *before*
  it acts would be teaching to the test. The proposals are printed to copy by hand. This is a
  design decision worth stating as one, not a limitation to apologize for.

The subtler content problem is the **gate**. A reader's instinct is that confidence is the filter,
so a low threshold means "more criteria". It is not: proposals are checked mechanically first —
duplicate name, grader allowed for this artifact type, options the grader itself accepts, a target
that actually exists in this project — and **no confidence score overrides any of those**.
Confidence is the last gate, not the only one. Explaining the order is what makes a rejection
report readable instead of arbitrary.

The **needs-sharpening** output is the part most likely to be skimmed and is arguably the most
valuable thing the command produces. An instruction too vague to test is a defect in the artifact,
and naming it beats silently converting it into an assertion that can never fail. Content should
treat those notes as a to-do list for the artifact author, not as a diagnostic footnote.

**Current friction / gap.** The README covers `fill` reasonably well but shows it as a single
command rather than a workflow, and gives no worked example of a real proposal report — which is
where the gate order actually becomes legible. No gap pages here; this journey is fully served at
launch.
