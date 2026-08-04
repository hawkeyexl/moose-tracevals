---
id: cuj-declare-criteria
type: cuj
title: Turn an instruction into a testable criterion
personas: [persona-artifact-author, persona-eval-owner]
trigger: "The implicit whole-artifact eval is too coarse — the reader wants a named check on one specific instruction."
entry_point: /agentevals/declare/
success_criteria: "A criterion is declared in an artifact's frontmatter, is picked up on the next run, and fails when the session violates it — with the right grader and the right severity."
steps:
  - { stage: "See why the implicit eval is not enough", doc: "/agentevals/declare/#from-implicit-to-declared", exists: true }
  - { stage: "Add the metadata.evals block", doc: "/agentevals/declare/#declare-your-first-criterion", exists: true, note: "string shorthand first, object form second" }
  - { stage: "Choose between a judged and a deterministic check", doc: "/agentevals/declare/#judged-or-deterministic", exists: true }
  - { stage: "Pick the grader that fits", doc: /agentevals/reference/graders/, exists: true }
  - { stage: "Set severity deliberately", doc: "/agentevals/declare/#severity", exists: true, note: "only error fails the eval" }
  - { stage: "Look up the full block shape", doc: /agentevals/reference/criteria-schema/, exists: true }
  - { stage: "Verify it fires", doc: "/agentevals/declare/#confirm-it-fires", exists: true }
  - { stage: "Mark probes apart from protections", doc: /agentevals/judge/schema-versioning/, exists: true }
---

# CUJ: Turn an instruction into a testable criterion

**Scope:** authoring one criterion by hand, deliberately. Proposing many at once is
[`cuj-fill-criteria`](cuj-fill-criteria.md); tuning how judged criteria are decided is
[`cuj-calibrate-judge`](cuj-calibrate-judge.md).

**Trigger.** The reader has run an evaluation and the implicit *"the session adhered to this
artifact"* verdict is too coarse to act on. They want a named check on the one instruction they
actually care about.

**Narrative.** This is where the product's central idea becomes concrete: **criteria live in the
artifact, next to the instruction they check.** Not in a separate suite, not in a config file — in
the frontmatter of the same `SKILL.md` a person edits when the instruction changes. That colocation
is what keeps the two from drifting, and saying so explicitly is what makes the frontmatter block
feel obvious rather than arbitrary.

The journey has one genuinely hard decision in the middle, and it is where readers stall: **is this
instruction decidable by a deterministic grader, judgeable by a model, or not testable at all?**
The content has to make that call easy, because getting it wrong produces the two worst outcomes in
the system — a criterion that can never fail, or a judged assertion so vague every verdict is noise.
The string shorthand is the right on-ramp precisely because it is one line, but it must not be
presented as the default answer: reaching for the judge when `tool-usage` would decide the same
question is a downgrade, not a shortcut.

Severity is the quiet trap. Only `error` findings fail an eval; `warning` and `info` report and
pass. A reader who declares everything at the default severity and then wonders why nothing fails
has misread a default nobody told them about.

**Coverage.** No gaps. `declare/` carries the judged-or-deterministic decision, the third answer
(not testable at all), and severity as a deliberate choice. `judge/schema-versioning/` carries
`type: capability | regression`, the field that separates a probe from a regression guard.
