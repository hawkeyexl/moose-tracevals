---
id: cuj-consume-results
type: cuj
title: Feed results into your own tooling
personas: [persona-platform-engineer, persona-toolsmith]
trigger: "The gate is green and someone now wants trend data, a dashboard, or a regression alert."
entry_point: /agentevals/ci/consume-results/
success_criteria: "Run results are parsed from a documented structure rather than scraped from rendered output, and a regression between two runs of the same session can be detected automatically."
steps:
  - { stage: "Emit machine-readable output", doc: /agentevals/ci/consume-results/, exists: false, note: "[GAP] --format json, --output" }
  - { stage: "Parse the report structure", doc: /agentevals/reference/report-and-exit-codes/, exists: true }
  - { stage: "Track runs over time", doc: "/agentevals/ci/consume-results/#history", exists: false, note: "[GAP] --history and the history JSONL format are undocumented" }
  - { stage: "Detect a regression between runs", doc: "/agentevals/ci/consume-results/#regressions", exists: false, note: "[GAP] prior pass now failing, compared per session" }
  - { stage: "Publish a human-readable summary", doc: "/agentevals/ci/exit-codes-and-reports/#keep-the-report", exists: true, note: "the markdown reporter" }
  - { stage: "Call the library instead of the CLI", doc: /agentevals/extend/, exists: false, note: "[GAP] programmatic API" }
---

# CUJ: Feed results into your own tooling

**Scope:** everything downstream of a run — structured output, history, and regression detection.
Getting the gate installed in the first place is [`cuj-gate-ci`](cuj-gate-ci.md).

**Trigger.** The gate has been quiet for a few weeks and someone asks the obvious follow-up: is
adherence getting better or worse, and can we be told when it regresses?

**Narrative.** This is the journey where agentevals stops being a pass/fail gate and becomes a
source of data, and it is currently the largest undocumented surface in the product relative to how
finished the underlying features are. Three capabilities exist and are described nowhere:

- **A structured report.** Every run can emit its full result — trace metadata, per-eval outcomes
  with findings and consensus, artifact coverage, warnings, summary counts, cost, duration — as
  JSON. Anyone building on it needs the shape documented well enough that they never open the
  source to parse it.
- **History.** Runs can be appended to a local log and each run compared against the previous one
  for the same session. This is what turns "did it pass?" into "did it get worse?", which is the
  question a platform team actually wants answered.
- **A regression is a specific, defined event**: a check that passed before and does not now — and
  that definition is what makes an alert trustworthy rather than noisy.

Two personas share this journey and want different endings. Devin wants a file he can forward.
Rin wants to skip the CLI and call the library. The content should serve Devin's path in full and
hand off to [`cuj-extend`](cuj-extend.md) rather than trying to serve both to the end.

**Current friction / gap.** Nearly total. `--history`, the history file format, `--output`, and the
markdown reporter are undocumented; the report structure is discoverable only by running the tool
and reading what comes out. This is the highest-value gap for the platform persona after launch, and
the one most likely to be hit by someone who has already adopted the tool successfully.
