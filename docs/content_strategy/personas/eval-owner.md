---
id: persona-eval-owner
type: persona
name: "Sam, eval standard owner"
audience: aud-eval-standard
role: Quality engineer who owns what "adhered" means
proficiency: [json-schema, llm-evaluation, sampling-and-nondeterminism, classifier-calibration, semver]
prerequisites:
  - writes and reads JSON Schema
  - knows the LLM-as-judge pattern and distrusts a single sampled verdict
  - reasons about precision and recall in a classifier
  - versions a published contract
goals:
  - a standard where passing means something and failing is actionable
  - judge verdicts backed by documented arithmetic, not adjectives
  - checks that probe a boundary reported separately from checks that protect working behavior
  - evolve the evals standard without silently reinterpreting what exists
pains:
  - a single sampled verdict is not evidence
  - nothing guides which of seven graders fits a given instruction
  - evals that no session could fail inflate the pass rate
  - a cached verdict surviving a prompt revision is a confident wrong answer
  - changing the schema breaks everything already declared
content_types: [explanation, contract-reference, decision-table, versioning-guide]
journeys:
  - cuj-calibrate-judge
  - cuj-evolve-evals
  - cuj-declare-evals
---

# Persona: Sam, eval standard owner

**Scope:** the standard-setting persona for
[`aud-eval-standard`](../audiences/eval-standard.md). Sam decides what an eval is allowed to
assert, and whether a verdict can be believed. That is not what the instructions say, and not how
the gate is wired.

Sam does evaluation work for an agent platform team. In a smaller organization this is Priya on a
different day, and the job is distinct enough to need its own content either way. Unlike Priya, Sam
arrives with the vocabulary already intact and a well-earned suspicion of anything that lets a
language model grade work.

**Goal:** define an evals standard that is honest, where a green run is evidence rather than
decoration. Then change it over time without invalidating everything already declared.

**Pains:**

- **Judge trust is the gate on everything else.** Sam will not let a judged eval block anything
  before seeing how many runs there are and how their votes combine. He also wants to know what
  happens when a run errors, and where the boundary that produces `needs-review` sits. "Errors can never produce a silent
  pass" is the specific claim that has to be demonstrated rather than asserted.
- **Grader selection is unguided.** Seven deterministic kinds exist with real scope differences.
  Some judge the whole session, some a single artifact, and nothing tells you which one fits the
  instruction in front of you.
- **Permanently green evals.** A check no session could fail is worse than no check: it inflates
  the pass rate and disguises the absence of coverage.
- **Probes and protections look identical.** An eval testing the edge of what an agent can do
  should not read the same way as one guarding behavior that already works.
- **Stale caches.** A cached verdict that outlives a prompt revision is a wrong answer delivered
  with full confidence.

**How they use moose-tracevals:** Sam reads the consensus and zone rules before running anything.
Then they tune runs, zones, temperature, and a cost ceiling against a corpus of sessions with known
outcomes. That checks whether the tool agrees with their own judgment. Once calibrated, they set the
conventions the rest of the team's evals follow, and they own the schema version those evals
are pinned to.

**What success looks like for them:** they can say, with the arithmetic behind it, why an eval came
out `needs-review` rather than `pass`. They can also change a threshold and watch that answer change
predictably.

**Careful with:** the concept order carries weight. *Ensemble* → *consensus* → *zone* → *outcome*,
in that sequence: a zone threshold is meaningless before consensus is defined. `capability` vs
`regression` depends on the evals schema, so it follows the authoring pages instead of preceding
them.
