---
id: cuj-cover-every-artifact
type: cuj
title: Get coverage over every artifact a session used
personas: [persona-artifact-author]
trigger: "A report shows fewer evals than expected, or an artifact the reader knows was used does not appear at all."
entry_point: /tracevals/declare/coverage/
success_criteria: "The reader can account for every artifact the session touched — evaluated, unresolved, or deliberately skipped — and knows how to close the gap for each."
steps:
  - { stage: "Read the artifact coverage table", doc: /tracevals/declare/coverage/, exists: true }
  - { stage: "Understand how artifacts are resolved from a trace", doc: /tracevals/reference/traces/, exists: true }
  - { stage: "Fix an unresolved reference", doc: "/tracevals/declare/coverage/#fix-an-unresolved-reference", exists: true }
  - { stage: "Know what the implicit eval covers", doc: "/tracevals/declare/#the-implicit-eval", exists: true }
  - { stage: "Skip an artifact deliberately", doc: /tracevals/reference/criteria-schema/, exists: true, note: "the skip flag" }
  - { stage: "Confirm coverage in the report", doc: /tracevals/reference/report-and-exit-codes/, exists: true }
---

# CUJ: Get coverage over every artifact a session used

**Scope:** accounting for the *denominator*: every skill, agent definition, and project-rules file
a session touched, including the ones that could not be found. Declaring what to check on a
resolved artifact is [`cuj-declare-criteria`](cuj-declare-criteria.md).

**Trigger.** A report shows three evals where the reader expected five, or a skill they know the
session invoked does not appear anywhere in the output.

**Narrative.** This journey exists because of a design choice that stays invisible until it confuses
someone: **an artifact that cannot be resolved degrades to a warning and a coverage-table row, never
a crash and never a failing eval.** That is right, since a missing plugin skill is no kind of
adherence violation, but it leaves the coverage table as load-bearing output that no current
documentation explains.

The reader needs to be able to close a small, closed set of loops:

- **Resolved and evaluated.** The normal case.
- **Resolved, no declared criteria.** Still evaluated, via the implicit whole-artifact eval. Nothing
  to fix, but knowing it stops an author reading silence as absence.
- **Unresolved.** The reference was found in the trace but no file was. The coverage entry records
  every location that was tried, which is usually enough to diagnose it — a project-relative path,
  a user-level directory, or a plugin store.
- **Never resolvable by design.** Built-in agents have no definition file. It looks like a defect
  and it is not, so say it once, plainly.
- **Deliberately skipped.** An artifact can opt out via the `skip` flag and is then reported as
  skipped rather than silently absent.

The framing that makes this journey coherent: **coverage is the honest answer to "what did you not
check?"** Surfacing it is a feature.

**Coverage.** No gaps. `declare/coverage/` carries the five states a coverage row can be in, the
full resolution order for skills, agents, and project rules, and how to diagnose an unresolved
reference from the `tried` list. `reference/traces/` carries the discovery side.
