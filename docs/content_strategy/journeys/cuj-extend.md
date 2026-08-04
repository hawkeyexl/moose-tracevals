---
id: cuj-extend
type: cuj
title: Build on agentevals instead of around it
personas: [persona-toolsmith]
trigger: "A check is needed that no built-in grader performs, or results must be consumed as typed data, or a trace format other than Claude Code's needs reading."
entry_point: /agentevals/extend/
success_criteria: "A custom grader is registered and passing in the reader's own offline test suite, and they can name which exports are the intended entry points."
steps:
  - { stage: "Find the front door in the export surface", doc: /agentevals/extend/, exists: false, note: "[GAP] a large public API with nothing marking intended entry points" }
  - { stage: "Understand the grader contract", doc: /agentevals/extend/custom-graders/, exists: false, note: "[GAP] grading and option validation are both required" }
  - { stage: "See why option validation is not optional", doc: "/agentevals/extend/custom-graders/#why-validateoptions-is-required", exists: false, note: "[GAP] a grader without it can never be proposed by fill" }
  - { stage: "Study a built-in grader as the reference implementation", doc: /agentevals/reference/graders/, exists: true }
  - { stage: "Register the grader and plan against it", doc: "/agentevals/extend/custom-graders/#register-it", exists: false, note: "[GAP] registerGrader" }
  - { stage: "Keep your own suite offline", doc: "/agentevals/extend/#injection-seams", exists: false, note: "[GAP] the judge, provider, and prompt seams that make downstream tests hermetic" }
  - { stage: "Consume the typed report", doc: /agentevals/reference/report-and-exit-codes/, exists: true }
  - { stage: "Look up an export", doc: /agentevals/reference/api/, exists: false, note: "[GAP] the export map" }
  - { stage: "Read a trace format that is not supported yet", doc: /agentevals/reference/traces/, exists: false, note: "[GAP] the normalized trace model and the adapter seam" }
---

# CUJ: Build on agentevals instead of around it

**Scope:** consuming agentevals as a library: custom graders, the typed report, and the trace
adapter seam. Using the CLI is covered better by every other journey.

**Trigger.** Rin needs a check no built-in grader performs, wants results as typed data instead of
scraped text, or has traces from something other than Claude Code.

**Narrative.** The gap this journey closes is unusual: the capability is **already shipped and
already public**. A substantial API is exported with types, the grader registry accepts new kinds at
runtime, and the trace model was built with an adapter seam instead of being hardcoded to one
format. None of it is documented, which means the extension points exist and nobody can find
them.

What Rin needs is a **map and a contract**. Two specific things carry the journey:

1. **Which exports are the front door.** A large surface with no marked entry points means every
   import is a bet on stability. Naming the handful that are intended (register a grader, run the
   engine, read the report, parse a trace) is worth more than exhaustively listing the rest.
2. **The grader contract has two halves and looks like one.** A grader must both grade *and*
   validate its own options, and the second half has a consequence invisible in the type signature:
   a grader that cannot validate its options can never be proposed by `fill`, because a proposal
   with no way to be ground-checked is refused. That is the single most
   important thing on the custom-grader page, and it is exactly what someone will get wrong by
   implementing only the obvious method.

The built-in graders are the reference implementation, so the content should send readers to them
instead of inventing a parallel example: seven working models of the contract already ship.

Two things are deliberately scoped down. **Offline testability** matters because anything built on
top needs its own hermetic suite, and the injection seams that make that possible are worth one
section, and it does not need a page. The **adapter seam** is documented as a shape to conform to.
Adding a trace source is a deferred design decision, and the honest framing is "here is what the
normalized model requires and what degrades gracefully when a field is absent."

**Current friction / gap.** Total: every step here is a `[GAP]`. This is the least-served journey
in the set and the most self-contained. It touches no other persona's content, which is why it
follows the primaries instead of competing with them for launch scope.
