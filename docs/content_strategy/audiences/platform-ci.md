---
id: aud-platform-ci
type: audience
segment: AI-platform and CI engineers
maturity: scaleup-to-enterprise
docs_owner: nobody on this team — they consume artifacts other teams own
firmographics: [platform-team, devex-team, multi-repo, regulated]
relationship_stages: [prospect, customer]
personas: [persona-platform-engineer]
features_emphasized:
  - --deterministic-only
  - exit codes
  - --format json
  - --output
  - --history
  - TRACEVALS_HOME
  - failOnNeedsReview
---

# Audience: AI-platform and CI engineers

**Scope:** people who run tracevals as a gate in automation across repositories they do not
author. It does not cover writing the instruction artifacts (see
[`aud-artifact-authors`](artifact-authors.md)) or deciding what the criteria should assert (see
[`aud-eval-standard`](eval-standard.md)) — this audience plumbs a check whose content someone else
owns.

## Who they are

Platform, DevEx, or CI engineers at organizations where agent-assisted work has moved from
experiment to routine. They own pipelines across many repositories and are accustomed to installing
a gate once and never thinking about it again. Some sit in regulated environments where "an agent
did the work" needs an artifact trail.

They are fluent in CI configuration, exit-code contracts, and JSON pipelines. They have low
tolerance for a tool that needs per-repository configuration, and near-zero tolerance for one that
makes a network call from a build.

## What they're trying to do

Add a check to automation that answers one question mechanically — *did this agent session follow
the instructions it was given?* — and route the answer into whatever the organization already uses
for reporting.

## Defining pains

- **Non-determinism in a gate.** A check that can flip on identical input is not a gate. They need
  to know exactly which part of the tool is deterministic and how to run only that part.
- **Network calls and secrets in CI.** A judge that calls a paid API from every build is a cost
  line, a secret to provision, and an outage surface. They need the offline path documented as a
  first-class mode, not a footnote.
- **Unbounded cost.** If judged evals do run, spend must be capped and the cap must be observable.
- **Ambiguous outcomes.** `needs-review` is a third state, and a pipeline needs an explicit policy
  for it rather than a surprise.
- **Machine-readable output that is actually specified.** A JSON blob with no documented shape
  cannot be depended on across a fleet.
- **Environment assumptions.** Anything that reads from a developer's home directory is a hazard on
  a shared runner.

## Buying constraints

- A fully offline mode must exist and be the documented default for CI.
- The exit-code contract must be stable and distinguish "a check failed" from "the tool broke".
- Output shape must be documented well enough to parse without reading source.
- Installation is one package plus a Node runtime. No sibling checkouts, no service.

## Qualified reader (for docs targeting)

- **Prerequisites they bring:** CI configuration (GitHub Actions at minimum); process exit-code
  semantics; JSON processing on the command line; environment-variable-based configuration;
  npm/npx installation.
- **Subject dependencies:** they need *trace*, *artifact*, and *eval outcome* defined, but only to
  the depth required to read a report — they do not need to understand criteria authoring to install
  the gate. The `needs-review` outcome and `failOnNeedsReview` must be introduced together, because
  the first is meaningless to them without the second. Judge calibration is explicitly **not** a
  dependency: their recommended path avoids the judge entirely.
