---
id: aud-eval-standard
type: audience
segment: Eval and quality owners
maturity: scaleup-to-enterprise
docs_owner: they own the evals standard, not the instruction artifacts
firmographics: [ml-quality-team, agent-platform-team, oss-framework-maintainer]
relationship_stages: [prospect, customer]
personas: [persona-eval-owner]
features_emphasized:
  - grader selection
  - severity
  - capability vs regression
  - artifact-evals schema versioning
  - ensembleRuns / zones / temperature
  - consensus and needs-review
  - maxCostUsd
  - PROMPT_VERSION and caching
---

# Audience: Eval and quality owners

**Scope:** people who own *what "adhered" means* — which graders are legitimate, what severity a
violation carries, how the evals schema evolves, and whether the judge can be trusted. It does
not cover authoring the instruction artifacts themselves (see
[`aud-artifact-authors`](artifact-authors.md)) or operating the gate (see
[`aud-platform-ci`](platform-ci.md)).

## Who they are

Quality, ML-evaluation, or agent-platform practitioners. In a large organization this is a distinct
role with a distinct mandate; in a small one it is the same person as the artifact author wearing a
second hat — but the job is different enough to need its own content. Some maintain an open-source
agent framework and set the evals conventions their downstream users inherit.

Unlike the lead audience, they arrive with eval vocabulary intact. They know what an LLM-as-judge
is, they are appropriately suspicious of one, and they will want to see the consensus rule before
they believe a verdict.

## What they're trying to do

Define a evals standard that is honest — one where a passing result means something and a
failing result is actionable — and evolve it without invalidating everything already declared.

Two sub-jobs, distinct enough that they generate separate journeys:

1. **Choose the right instrument.** For a given instruction, decide whether a deterministic grader
   can decide it and, if not, whether it is judgeable at all or simply untestable prose.
2. **Calibrate and version.** Tune the judge until its verdicts are trustworthy, and change the
   standard over time without a silent reinterpretation of existing evals.

## Defining pains

- **Judge trust.** A single sampled verdict is not evidence. They need to see the ensemble, the
  consensus arithmetic, what happens to errored runs, and where the `needs-review` boundary sits —
  before they will let a judged eval gate anything.
- **Grader selection is unguided.** Seven deterministic kinds exist with real scope differences
  (some are whole-session, some are per-artifact) and nothing tells you which fits.
- **Evals that are permanently green.** An eval that no session could fail inflates the pass
  rate and hides the fact that nothing is being checked.
- **Expected-to-fail checks are indistinguishable from regressions.** A probe at the boundary of
  what an agent can do should be reported differently from a protection on behavior that already
  works.
- **Silent replay from a stale cache.** A cached verdict that survives a prompt revision is a wrong
  answer delivered confidently.
- **Schema evolution.** Changing the evals block's shape breaks every artifact already declaring
  evals unless versions coexist.

## Buying constraints

- The consensus and zone rules must be documented arithmetic, not adjectives.
- The evals schema must be a published, versioned artifact they can pin.
- Grader options must be validated up front, so a malformed eval is an error rather than a
  silent pass.
- Cost must be boundable per run.

## Qualified reader (for docs targeting)

- **Prerequisites they bring:** JSON Schema; sampling and non-determinism in language models; the
  general LLM-as-judge pattern and its failure modes; precision/recall intuition for a classifier;
  semantic versioning of a published contract.
- **Subject dependencies:** *eval*, *grader*, and *finding* must be established first — this
  audience's content sits one level above the authoring vocabulary and assumes it. *Ensemble* →
  *consensus* → *zone* → *outcome* must be introduced in that order; a zone threshold is
  meaningless before consensus is defined. `capability` vs `regression` depends on the evals
  schema being introduced, so it follows the authoring pages rather than preceding them.
