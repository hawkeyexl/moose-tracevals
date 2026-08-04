---
id: cuj-gate-ci
type: cuj
title: Gate agent work in CI, offline
personas: [persona-platform-engineer]
trigger: "Agent-assisted work is routine and someone has asked whether any of it can be verified before merge."
entry_point: /agentevals/ci/
success_criteria: "A workflow runs agentevals on every push, makes no network call, and fails the build on a real adherence violation — with a stated policy for every exit code and for needs-review."
steps:
  - { stage: "Copy the GitHub Actions recipe", doc: /agentevals/ci/, exists: true }
  - { stage: "Run deterministic graders only", doc: "/agentevals/ci/#stay-offline", exists: true, note: "--deterministic-only makes no model call; --provider mock exercises the full pipeline" }
  - { stage: "Pin the session store on a shared runner", doc: "/agentevals/ci/#control-the-environment", exists: true, note: "AGENTEVALS_HOME" }
  - { stage: "Branch on the exit code", doc: /agentevals/ci/exit-codes-and-reports/, exists: true }
  - { stage: "Decide the needs-review policy", doc: "/agentevals/ci/exit-codes-and-reports/#the-third-outcome", exists: true, note: "failOnNeedsReview" }
  - { stage: "Cap spend if the judge does run", doc: /agentevals/reference/configuration/, exists: true, note: "judge.maxCostUsd" }
  - { stage: "Publish the report as an artifact", doc: "/agentevals/ci/exit-codes-and-reports/#keep-the-report", exists: true, note: "--format markdown, --output" }
  - { stage: "Add a second CI platform", doc: "/agentevals/ci/#other-ci-platforms", exists: true, note: "GitLab CI and pre-commit; the contract is identical, only the syntax changes" }
---

# CUJ: Gate agent work in CI, offline

**Scope:** getting a dependable gate into automation. Reading the results downstream is
[`cuj-consume-results`](cuj-consume-results.md); deciding what the checks assert belongs to
[`cuj-declare-criteria`](cuj-declare-criteria.md) and is somebody else's job.

**Trigger.** Agent-assisted work has moved past experiment, and the platform team has been asked
whether any of it can be verified before merge.

**Narrative.** Devin's entire evaluation of this product happens in the first thirty seconds and
turns on one question: **can this run in a build without a network call?** The answer is yes, and
the content must lead with it rather than arriving there after a tour of judge features. A page that
opens with ensembles has already lost him.

Three things carry the journey:

1. **The deterministic subset is a real, complete mode, not a degraded one.** Seven grader kinds
   decide their questions from the trace alone. `--deterministic-only` skips judged evals rather
   than failing them — skipped is a distinct outcome, which matters when he is reading exit codes.
   `--provider mock` is the second offline mode, exercising the whole pipeline for a smoke test.
2. **The exit-code contract is the API.** `0` pass, `1` a check failed, `2` the tool itself broke.
   The distinction between `1` and `2` is what lets him tell "the agent misbehaved" from "the trace
   was unreadable", and it is the single most important thing on the page.
3. **`needs-review` needs a decision, not a discovery.** It is a third outcome, it counts as a
   failure by default, and the config key that changes that must be introduced in the same breath —
   otherwise he meets it for the first time as a red build he cannot explain.

Environment control is the quiet requirement: trace discovery reads a session store under a home
directory, and on a shared runner that has to be pinned explicitly rather than inherited.

**Coverage.** No gaps. `ci/` carries where a trace comes from in CI, the offline modes,
`AGENTEVALS_HOME`, and recipes for three platforms; `ci/exit-codes-and-reports/` carries the
exit-code contract and the `needs-review` policy decision.
