---
id: cuj-extend
type: cuj
title: Build on agentevals instead of around it
personas: [persona-toolsmith]
trigger: "A check is needed that no built-in grader performs, or results must be consumed as typed data, or a trace format other than Claude Code's needs reading."
entry_point: /agentevals/extend/
success_criteria: "A custom grader is registered and passing in the reader's own offline test suite, and they can name which exports are the intended entry points."
steps:
  - { stage: "Find the front door in the export surface", doc: /agentevals/extend/, exists: true }
  - { stage: "Understand the grader contract", doc: /agentevals/extend/custom-graders/, exists: true }
  - { stage: "See why option validation is not optional", doc: "/agentevals/extend/custom-graders/#the-contract-has-two-halves", exists: true }
  - { stage: "Study a built-in grader as the reference implementation", doc: /agentevals/reference/graders/, exists: true }
  - { stage: "Register the grader and plan against it", doc: "/agentevals/extend/custom-graders/#a-worked-example", exists: true }
  - { stage: "Keep your own suite offline", doc: "/agentevals/extend/#injection-seams", exists: true }
  - { stage: "Consume the typed report", doc: /agentevals/reference/report-and-exit-codes/, exists: true }
  - { stage: "Look up an export", doc: /agentevals/reference/api/, exists: true }
  - { stage: "Read a trace format that is not supported yet", doc: /agentevals/reference/traces/, exists: true }
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

**Coverage.** No gaps. `extend/` marks the intended entry points out of a large export surface,
documents the injection seams that keep a downstream suite offline, and states the trace-adapter
seam as a shape to conform to. `extend/custom-graders/` carries the two-part contract and why a
grader without `validateOptions` can never be proposed by `fill`. `reference/api/` is the map.
