---
id: cuj-calibrate-judge
type: cuj
title: Decide whether the judge can be trusted, then tune it
personas: [persona-eval-owner]
trigger: "Someone proposes letting a judged eval block a merge, and the eval owner has to decide whether the verdict is evidence."
entry_point: /agentevals/judge/
success_criteria: "The reader can state why a given eval came out pass, fail, or needs-review with the arithmetic to back it — and can change a threshold and predict the effect."
steps:
  - { stage: "See how a judged verdict is produced", doc: /agentevals/judge/, exists: true, note: "N independent runs at temperature 0" }
  - { stage: "Follow the consensus rule", doc: "/agentevals/judge/#from-votes-to-consensus", exists: true, note: "errored runs count against consensus and can never produce a silent pass" }
  - { stage: "Locate the needs-review boundary", doc: "/agentevals/judge/#confidence-zones", exists: true }
  - { stage: "Read the evidence behind a verdict", doc: "/agentevals/judge/#what-the-judge-cites", exists: true }
  - { stage: "Tune runs, zones, and temperature", doc: /agentevals/judge/calibrate/, exists: true }
  - { stage: "Cap spend per run", doc: /agentevals/reference/configuration/, exists: true, note: "judge.maxCostUsd; and why a model with unknown pricing silently disables the budget" }
  - { stage: "Avoid stale cached verdicts", doc: /agentevals/judge/calibrate/, exists: true }
  - { stage: "Choose a provider", doc: /agentevals/reference/configuration/, exists: true }
---

# CUJ: Decide whether the judge can be trusted, then tune it

**Scope:** the trustworthiness of judged evals and the knobs that govern them. What a criterion
should assert in the first place is [`cuj-declare-criteria`](cuj-declare-criteria.md); the schema
that carries it is [`cuj-evolve-criteria`](cuj-evolve-criteria.md).

**Trigger.** Someone proposes letting a judged eval block a merge. Sam now has to decide whether an
LLM verdict is evidence or decoration, and the answer determines whether judged evals are used at
all.

**Narrative.** This journey either establishes credibility or ends adoption for the eval owner, and
its content has a hard requirement: **show the arithmetic, not adjectives.** "Robust", "reliable",
and "high-confidence" are worth nothing to this reader. A worked example — these votes, this
consensus value, this zone, therefore this outcome — is worth everything.

The design has three claims that must be demonstrated in order:

1. **A verdict is not one sample.** Independent runs at temperature 0, combined. A single sampled
   judgment is exactly the thing Sam already distrusts, and the ensemble is the answer to it.
2. **Errors count against consensus.** This is the invariant that matters most and the one most
   likely to be assumed backwards. A run that errored does not vanish from the tally and cannot be
   rounded away — it can only push an eval toward human review, never toward a silent pass. State
   it as an invariant, then show it.
3. **`needs-review` is a designed outcome, not a failure of the system.** Anything short of the
   confidence zone routes to a human deliberately. A tool that always answers is less trustworthy
   than one that declines to.

Only after those land does tuning make sense. The knobs — run count, zone thresholds, temperature,
a cost ceiling — each trade something, and the content should say what: more runs cost more and
narrow the review band; a lower auto-pass threshold converts reviews into passes and buys throughput
with accuracy.

Two operational traps deserve prominence because both fail silently. A **stale cache** can replay a
verdict produced by a prompt that no longer exists — the prompt version is part of the cache key
precisely to prevent this, and anyone changing prompts needs to know that. And a **cost budget is
only as good as the price table**: a model whose pricing is unknown is charged at zero, which
quietly disables the ceiling that was supposed to protect the run.

**Coverage.** No gaps. `judge/` carries the arithmetic — ensemble, consensus, zones, and a worked
example; `judge/calibrate/` carries the operating half: what each knob trades, how to tune against a
corpus with known answers, the cost ceiling, and the two silent failure modes (a stale cache
surviving a prompt revision, and a budget disabled by unknown model pricing).
