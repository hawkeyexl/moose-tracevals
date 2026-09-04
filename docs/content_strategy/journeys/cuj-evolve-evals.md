---
id: cuj-evolve-evals
type: cuj
title: Evolve the evals standard without breaking what exists
personas: [persona-eval-owner]
trigger: "The evals block needs to change, whether a new field, a tightened rule, or a convention the team should adopt, and artifacts across many repositories already declare evals against the current shape."
entry_point: /moose-tracevals/judge/schema-versioning/
success_criteria: "The reader knows the block implements a shared docmeta vocabulary and where a shape change belongs, can adopt a new convention incrementally, and can distinguish an expected-to-fail probe from a regression guard in reports."
steps:
  - { stage: "See the evals block as a shared, versioned contract", doc: /moose-tracevals/reference/evals-schema/, exists: true }
  - { stage: "Learn where a shape change belongs, and what a version bump claims", doc: /moose-tracevals/judge/schema-versioning/, exists: true }
  - { stage: "Adopt capability vs regression", doc: "/moose-tracevals/judge/schema-versioning/#separate-probes-from-guards", exists: true }
  - { stage: "Roll out a new convention incrementally", doc: "/moose-tracevals/judge/schema-versioning/#roll-out-a-convention-in-stages", exists: true }
  - { stage: "Handle a malformed evals block", doc: /moose-tracevals/triage/, exists: true, note: "an invalid block is an error with a line number, never silently ignored" }
  - { stage: "Keep the vocabulary consistent across artifacts", doc: /moose-tracevals/reference/graders/, exists: true }
---

# CUJ: Evolve the evals standard without breaking what exists

**Scope:** the evals block as a versioned contract, and changing it safely over time. Tuning how
a judged eval is *decided* is [`cuj-calibrate-judge`](cuj-calibrate-judge.md).

**Trigger.** The standard needs to change. That may be a field the team wants to start using, or a
rule to tighten. It may be a convention to spread across repositories where artifacts already
declare evals against today's shape.

**Narrative.** The organizing idea is that **the evals block is a published contract, not an
internal format.** It has a resolvable schema URL, it ships with the package, and two versions
coexist so a consumer can pin one. That framing is what turns "we changed the schema" from a
breaking event into a versioned migration. It needs stating, because a reader who assumes the
block is an implementation detail will be surprised in the worst possible way.

The concrete change available today is the reason this journey exists. Version 0.2 adds exactly one
field, `type`, distinguishing a **capability** probe from a **regression** guard. A probe
deliberately tests the edge of what an agent can do, and is expected to fail sometimes. A guard
protects behavior that already works. Both appear in reports; neither changes enforcement. That
restraint is the interesting part and should be explained rather than glossed. A probe that fails
is information, and treating it identically to a regression would make the pass rate meaningless in
the other direction.
Newly written evals default to `regression`, which is the conservative choice and worth saying
out loud.

The transferable technique is the **staged ratchet**. Introduce a convention at a severity that
reports without failing, then drive coverage across the corpus. Promote it to error only once the
corpus is ready. It is the same move whether the change is a new field, a new grader convention, or
a tightened assertion. It is what makes a standard evolvable across repositories that do not
all move at the same speed.

One safety property belongs here rather than in triage. A malformed evals block is surfaced as
an error with a source line number, never silently ignored. For someone rolling out a change across
many repositories, "you will be told exactly where it broke" is the property that makes the rollout
survivable.

**Coverage.** No gaps. `judge/schema-versioning/` carries the block as a published contract, plus
both versions and which to pin. It carries `capability` against `regression` with the reason
enforcement deliberately does not change, and the staged ratchet for rolling a convention across a
corpus.
