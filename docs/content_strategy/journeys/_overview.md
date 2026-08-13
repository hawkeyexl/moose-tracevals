---
type: journeys-index
journeys:
  - cuj-first-eval
  - cuj-declare-criteria
  - cuj-fill-criteria
  - cuj-cover-every-artifact
  - cuj-gate-ci
  - cuj-consume-results
  - cuj-calibrate-judge
  - cuj-evolve-criteria
  - cuj-triage-failure
  - cuj-extend
backbone: cuj-first-eval
---

# Critical user journeys

**Scope:** the ten end-to-end outcomes the documentation must let a persona reach, and which pages
carry each. The readers are defined in [`../personas/`](../personas/_overview.md); the structure
these journeys produce is in
[`../information_architecture/proposed-ia.md`](../information_architecture/proposed-ia.md).

A CUJ is a complete outcome a persona reaches *using the product*, not a topic. Each file maps its
steps to real site routes and marks each route `exists: true`, `partial`, or `false` — the `false`
ones are `[GAP]`s, and enumerating them is the point.

## The journeys

| CUJ | Outcome | Primary persona |
|---|---|---|
| [`cuj-first-eval`](cuj-first-eval.md) | **Backbone.** Evaluate a real past session and read the result | Priya |
| [`cuj-declare-criteria`](cuj-declare-criteria.md) | Turn one instruction into a testable criterion | Priya |
| [`cuj-fill-criteria`](cuj-fill-criteria.md) | Propose criteria across a project and review the diff | Priya |
| [`cuj-cover-every-artifact`](cuj-cover-every-artifact.md) | Account for every artifact a session used | Priya |
| [`cuj-gate-ci`](cuj-gate-ci.md) | Gate agent work in CI, offline | Devin |
| [`cuj-consume-results`](cuj-consume-results.md) | Feed results into your own tooling | Devin |
| [`cuj-calibrate-judge`](cuj-calibrate-judge.md) | Decide whether the judge can be trusted, then tune it | Sam |
| [`cuj-evolve-criteria`](cuj-evolve-criteria.md) | Evolve the criteria standard without breaking what exists | Sam |
| [`cuj-triage-failure`](cuj-triage-failure.md) | Read a failing eval and decide what to do | Theo |
| [`cuj-extend`](cuj-extend.md) | Build on moose-tracevals instead of around it | Rin |

## Persona → CUJ coverage matrix

● primary · ○ secondary

| CUJ | Priya | Devin | Sam | Theo | Rin |
|---|:---:|:---:|:---:|:---:|:---:|
| `cuj-first-eval` | ● | ○ | | | |
| `cuj-declare-criteria` | ● | | ○ | | |
| `cuj-fill-criteria` | ● | | | | |
| `cuj-cover-every-artifact` | ● | | | | |
| `cuj-gate-ci` | | ● | | | |
| `cuj-consume-results` | | ● | | | ○ |
| `cuj-calibrate-judge` | | | ● | | |
| `cuj-evolve-criteria` | | | ● | | |
| `cuj-triage-failure` | | | | ● | |
| `cuj-extend` | | | | | ● |

Every persona has at least one primary journey; every journey has at least one persona. Priya
carries four because she is the lead persona and touches every layer; Theo carries exactly one by
design — see [`run-triager`](../personas/run-triager.md).

## The backbone

[`cuj-first-eval`](cuj-first-eval.md) is the backbone journey. It is the first thing the lead
persona does, it threads install → trace discovery → artifact resolution → evaluation → report in a
single line, and every other journey either branches off it or presumes it has been completed.

It is also the only journey two personas walk together, and they leave by different doors: Priya
toward [`cuj-declare-criteria`](cuj-declare-criteria.md), Devin toward
[`cuj-gate-ci`](cuj-gate-ci.md). Its final section must be a fork, not a single next step.

## Journey walk-through test

Before declaring any launch CUJ complete, follow its linked pages start to finish and confirm:

1. The persona reaches the stated `success_criteria` without leaving the track, except for
   deliberate Reference lookups.
2. Every command shown runs offline — `--deterministic-only` or `--provider mock` — against a
   committed fixture, and is covered by a Doc Detective inline test that CI actually executes.
3. Every step whose route is marked `exists: true` resolves to a real page.
4. Every page has `title` and `description` frontmatter.
