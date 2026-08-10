---
id: cuj-evolve-criteria
type: cuj
title: Evolve the criteria standard without breaking what exists
personas: [persona-eval-owner]
trigger: "The criteria block needs to change — a new field, a tightened rule, or a convention the team should adopt — and artifacts across many repositories already declare criteria against the current shape."
entry_point: /tracevals/judge/schema-versioning/
success_criteria: "The reader can pin a schema version, adopt a new field incrementally, and distinguish an expected-to-fail probe from a regression guard in reports."
steps:
  - { stage: "See the criteria block as a versioned contract", doc: /tracevals/reference/criteria-schema/, exists: true }
  - { stage: "Pin a schema version", doc: /tracevals/judge/schema-versioning/, exists: true }
  - { stage: "Adopt capability vs regression", doc: "/tracevals/judge/schema-versioning/#separate-probes-from-guards", exists: true }
  - { stage: "Roll out a new convention incrementally", doc: "/tracevals/judge/schema-versioning/#roll-out-a-convention-in-stages", exists: true }
  - { stage: "Handle a malformed criteria block", doc: /tracevals/triage/, exists: true, note: "an invalid block is an error with a line number, never silently ignored" }
  - { stage: "Keep the vocabulary consistent across artifacts", doc: /tracevals/reference/graders/, exists: true }
---

# CUJ: Evolve the criteria standard without breaking what exists

**Scope:** the criteria block as a versioned contract, and changing it safely over time. Tuning how
a judged criterion is *decided* is [`cuj-calibrate-judge`](cuj-calibrate-judge.md).

**Trigger.** The standard needs to change: a field the team wants to start using, a rule to tighten,
or a convention to spread across repositories where artifacts already declare criteria against
today's shape.

**Narrative.** The organizing idea is that **the criteria block is a published contract, not an
internal format.** It has a resolvable schema URL, it ships with the package, and two versions
coexist so a consumer can pin one. That framing is what turns "we changed the schema" from a
breaking event into a versioned migration — and it needs stating, because a reader who assumes the
block is an implementation detail will be surprised in the worst possible way.

The concrete change available today is the reason this journey exists. Version 0.2 adds exactly one
field, `type`, distinguishing a **capability** probe — a criterion deliberately testing the edge of
what an agent can do, expected to fail sometimes — from a **regression** guard protecting behavior
that already works. Both appear in reports; neither changes enforcement. That restraint is the
interesting part and should be explained rather than glossed: a probe that fails is information, and
treating it identically to a regression would make the pass rate meaningless in the other direction.
Newly written criteria default to `regression`, which is the conservative choice and worth saying
out loud.

The transferable technique is the **staged ratchet**: introduce a convention at a severity that
reports without failing, drive coverage across the corpus, and promote it to error only once the
corpus is ready. It is the same move whether the change is a new field, a new grader convention, or
a tightened assertion, and it is what makes a standard evolvable across repositories that do not
all move at the same speed.

One safety property belongs here rather than in triage: a malformed criteria block is surfaced as
an error with a source line number, never silently ignored. For someone rolling out a change across
many repositories, "you will be told exactly where it broke" is the property that makes the rollout
survivable.

**Coverage.** No gaps. `judge/schema-versioning/` carries the block as a published contract, both
versions and which to pin, `capability` vs `regression` with the reason enforcement deliberately
does not change, and the staged ratchet for rolling a convention across a corpus.
