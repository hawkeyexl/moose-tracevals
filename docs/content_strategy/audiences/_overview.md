---
type: audiences-index
audiences:
  - aud-artifact-authors
  - aud-platform-ci
  - aud-eval-standard
  - aud-run-triagers
  - aud-toolsmiths
lead: aud-artifact-authors
axis: who owns the agent instruction artifacts × how agent behavior is governed
---

# Audiences

**Scope:** the five target segments for the agentevals documentation set and the axis that
separates them. Per-segment detail lives in the individual files; the readers themselves are
modelled in [`../personas/`](../personas/_overview.md).

## Segmentation axis

**Who owns the agent instruction artifacts × how agent behavior is governed.**

agentevals exists because instructions and behavior have drifted apart. Someone writes a `SKILL.md`,
an agent definition, or a `CLAUDE.md`; something else — an agent session — is supposed to follow it;
and nothing checks. The segments fall out of *which end of that gap a person stands on*:

- Write the instructions, and you want to know whether sessions honored them → **artifact authors**.
- Run the pipeline, and you want a gate that says yes or no without a network call →
  **platform / CI**.
- Own what "adhered" even means, and you are choosing graders, severities, and judge calibration →
  **eval standard owners**.
- Have neither written nor configured anything, and you just hit one red line →
  **run triagers**.

Team size and company maturity are *not* the axis here. A solo maintainer with three skills and a
platform team with three hundred hit the same wall in the same order; what differs is which end of
the gap they own. Maturity shows up only as a secondary signal — it predicts how many artifacts
exist and whether anyone owns the standard as a distinct job, not what the person is trying to do.

## The segments

| id | Segment | Owns | Depth of coverage |
|---|---|---|---|
| [`aud-artifact-authors`](artifact-authors.md) | Agent-instruction authors — **lead** | `.claude/skills/`, agent definitions, `CLAUDE.md` / `AGENTS.md` | Deepest. Touches every layer. |
| [`aud-platform-ci`](platform-ci.md) | AI-platform and CI engineers | Pipelines, runners, the merge gate | Focused: exit codes, offline mode, machine-readable output. |
| [`aud-eval-standard`](eval-standard.md) | Eval and quality owners | The criteria standard itself | Deep but narrow: graders, severity, schema versioning, judge calibration. |
| [`aud-run-triagers`](run-triagers.md) | Session triagers | Nothing — they arrive at one failure | Shallow, highest traffic. One page carries the whole journey. |
| [`aud-toolsmiths`](toolsmiths.md) | Toolsmiths — **cross-cutting** | Code built on top of agentevals | Narrow: the programmatic API and the extension seams. |

## Why `aud-artifact-authors` leads

They are the primary adopter and the only segment that touches every layer of the product: they
install it, discover which artifacts a session used, declare criteria (by hand or via `fill`),
choose graders, read reports, and eventually wire CI. Their backbone journey
[`cuj-first-eval`](../journeys/cuj-first-eval.md) threads through install, artifact resolution,
criteria, and reporting in one line. Every other segment either serves them or intersects them.

## The cross-cutting lens

[`aud-toolsmiths`](toolsmiths.md) is marked `cross_cutting: true`. It is not a fifth point on the
ownership axis — it is defined by *what someone builds on top of agentevals* rather than by which
artifacts they own, and it overlaps all four primaries:

- A **platform engineer** who parses `RunReport` JSON into a dashboard is a toolsmith for that task.
- An **eval standard owner** who needs a check no built-in grader performs writes a custom grader.
- An **artifact author** maintaining an in-house skill framework may wrap the library directly.

It gets its own audience because the content it needs — the export surface, `registerGrader()`, the
trace-adapter seam — is disjoint from everything the primaries read, and because that surface is
currently the least documented part of a shipped, public API. It is deliberately created despite
being the least evidenced segment: the exports exist and are public, so someone is the reader for
them whether or not we have met them yet.

## Signals that cut across every segment

Three concerns show up in every segment's needs and should be addressed inline on journey pages
rather than quarantined:

- **Cost and network posture.** Judged evals cost money and require a provider. Every segment wants
  to know how to not spend, which is why `--deterministic-only` and `--provider mock` belong early
  in the story, not in an appendix.
- **Trust in a non-deterministic judge.** "An LLM graded my work" invites suspicion from all four
  primaries. The ensemble, the consensus rule that errors can never produce a silent pass, and the
  `needs-review` zone are the answer, and they need stating wherever a verdict is shown.
- **Read-only safety.** `run` never mutates anything; `fill` is the single write path and never
  touches project rules. Authors and platform owners both need this stated plainly before they
  point the tool at a real repo.
