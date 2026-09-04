---
id: cuj-calibrate-judge
type: cuj
title: Decide whether the judge can be trusted, then tune it
personas: [persona-eval-owner]
trigger: "Someone proposes letting a judged eval block a merge, and the eval owner has to decide whether the verdict is evidence."
entry_point: /moose-tracevals/judge/
success_criteria: "The reader can state why a given eval came out pass, fail, or needs-review with the arithmetic to back it, and can change a threshold and predict the effect."
steps:
  - { stage: "See how a judged verdict is produced", doc: /moose-tracevals/judge/, exists: true, note: "N independent runs at temperature 0" }
  - { stage: "Follow the consensus rule", doc: "/moose-tracevals/judge/#from-votes-to-consensus", exists: true, note: "errored runs count against consensus and can never produce a silent pass" }
  - { stage: "Locate the needs-review boundary", doc: "/moose-tracevals/judge/#confidence-zones", exists: true }
  - { stage: "Read the evidence behind a verdict", doc: "/moose-tracevals/judge/#what-the-judge-cites", exists: true }
  - { stage: "Write down the verdicts already judged by hand", doc: "/moose-tracevals/judge/calibrate/#write-down-what-you-decided", exists: true, note: "a labels sidecar, per corpus rather than per artifact" }
  - { stage: "Count false passes, false fails, and review volume", doc: "/moose-tracevals/judge/calibrate/#the-three-numbers", exists: true, note: "`moose-tracevals calibrate` computes what this journey used to ask a reader to count by eye" }
  - { stage: "See which eval disagreed, not just how many", doc: "/moose-tracevals/judge/calibrate/#which-eval-disagreed", exists: true }
  - { stage: "Tune runs, zones, and temperature", doc: /moose-tracevals/judge/calibrate/, exists: true }
  - { stage: "Try a different threshold without paying for it again", doc: "/moose-tracevals/judge/calibrate/#sweep-the-knobs-for-free", exists: true, note: "--sweep re-scores cached verdicts; a second sweep makes no model calls" }
  - { stage: "Cap spend per run", doc: /moose-tracevals/reference/configuration/, exists: true, note: "judge.maxCostUsd; and why a model with unknown pricing silently disables the budget" }
  - { stage: "Avoid stale cached verdicts", doc: /moose-tracevals/judge/calibrate/, exists: true }
  - { stage: "Choose a provider", doc: /moose-tracevals/reference/configuration/, exists: true }
---

# CUJ: Decide whether the judge can be trusted, then tune it

**Scope:** the trustworthiness of judged evals and the knobs that govern them. What an eval
should assert in the first place is [`cuj-declare-evals`](cuj-declare-evals.md); the schema
that carries it is [`cuj-evolve-evals`](cuj-evolve-evals.md).

**Trigger.** Someone proposes letting a judged eval block a merge. Sam now has to decide whether an
LLM verdict is evidence or decoration, and the answer determines whether judged evals are used at
all.

**Narrative.** This journey either establishes credibility or ends adoption for the eval owner, and
its content has a hard requirement: **show the arithmetic, not adjectives.** "Solid", "reliable",
and "high-confidence" are worth nothing to this reader. A worked example is worth everything: these
votes, this consensus value, this zone, therefore this outcome.

The design has three claims that must be demonstrated in order:

1. **A verdict is not one sample.** Independent runs at temperature 0, combined. A single sampled
   judgment is exactly the thing Sam already distrusts, and the ensemble is the answer to it.
2. **Errors count against consensus.** This is the invariant that matters most and the one most
   likely to be assumed backwards. A run that errored does not vanish from the tally and cannot be
   rounded away. It can only push an eval toward human review, never toward a silent pass. State
   it as an invariant, then show it.
3. **`needs-review` is a designed outcome, not a failure of the system.** Anything short of the
   confidence zone routes to a human deliberately. A tool that always answers is less trustworthy
   than one that declines to.

Only after those land does tuning make sense. Each knob trades something, and the content should
say what. Run count, zone thresholds, temperature and a cost ceiling are the knobs. More runs cost
more and narrow the review band. A lower auto-pass threshold converts reviews into passes and buys
throughput with accuracy.

Two operational traps deserve prominence because both fail silently. A **stale cache** can replay a
verdict produced by a prompt that no longer exists. The prompt version is part of the cache key
precisely to prevent this, and anyone changing prompts needs to know that. And a **cost budget is
only as good as the price table**. A model whose pricing is unknown is charged at zero, which
quietly disables the ceiling that was supposed to protect the run.

**The measurement, not the eyeball.** This journey used to end at a procedure: collect a dozen
sessions you have judged by hand, run them, and count three things. Every part of that is
mechanical, and the counting was the part most likely to be skipped. The numbers that decide
whether Sam trusts the tool were the numbers nobody had.
`moose-tracevals calibrate` computes them from a labels sidecar and names which eval disagreed.
`--sweep` answers "what would `autoPass: 0.9` have done?" over the same corpus at no further cost.
That is what turns the knob table above from a description into a decision.

Two properties of the command matter to this reader specifically, and the content states both.
Disagreement is **exit 0**, because a measurement that fails on its own findings is one nobody
runs. And a labelled eval that never armed is kept out of the agreement denominator, because a
check with no evidence is not evidence.

**Coverage.** No gaps. `judge/` carries the arithmetic: ensemble, consensus, zones, and a worked
example. `judge/calibrate/` carries the operating half. That is the labels sidecar and what it
refuses, plus the three numbers and the three more they need to be honest. It carries the sweep and
why it is free, what each knob trades, and the cost ceiling. It also carries the two silent failure
modes: a stale cache surviving a prompt revision, and a budget disabled by unknown model pricing.
