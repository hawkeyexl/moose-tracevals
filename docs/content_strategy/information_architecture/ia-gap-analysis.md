---
id: ia-gap-analysis
type: information-architecture
scope: Gaps between the CUJ-driven proposed IA and the documentation that exists today
companion: proposed-ia.md
current_source: README.md
---

# IA gap analysis

**Scope:** what exists today, where it lands in the proposed structure, and what the journeys
require that does not exist. The structure itself is in [`proposed-ia.md`](proposed-ia.md).

**Enumerating the gaps is the deliverable.** This file is expected to list content that has not been
written; that list is the roadmap.

## 1. Current → proposed mapping

There is no documentation site today. The entire user-facing corpus is one 202-line `README.md`,
whose sections re-home like this:

| Current README section | Proposed home | Disposition |
|---|---|---|
| Opening value proposition | `/` | Rewrite as a router with a runnable proof; keep a one-paragraph version in the README. |
| "How it works" pipeline diagram | `/` and `get-started/` | Keep the diagram; move the four supporting bullets into the pages that need them. |
| "Quick start" | `get-started/` | Rewrite. Every command shown uses `node dist/cli.js`, which only works inside a clone; the site shows the installed binary. |
| "Declaring criteria" | `declare/` | Expand into a journey. The block example survives; grader choice and severity are new. |
| "Deterministic grader kinds" table | `reference/graders/` | Move and expand — options, validation rules, and the actual failure messages. |
| "Filling in criteria" | `declare/fill` | Expand into a workflow with a worked proposal report. The rejection-reason table moves with it. |
| "Configuration" YAML sample | `reference/configuration/` | Move. The sample stays; a per-key table with types and defaults is new. |
| "Exit codes" table | `reference/report-and-exit-codes/` and `ci/exit-codes-and-reports` | Move; the CI page carries the policy discussion, reference carries the table. |
| "Development" | `README.md` | Stays in the repository. Contributor content is not published to the site. |
| "License" | `README.md` | Stays. |

**Nothing in the README is dropped.** Two things it does *not* currently contain but must gain: an
install line for the published package, and a link table into the site.

## 2. `[NEW]`: content the CUJs require that does not exist

Everything below is unwritten. P0 ships at launch; P1 and P2 follow.

| Gap | Serves | Why it matters | Priority |
|---|---|---|---|
| Landing router + offline proof | all | No entry point exists; the first thing a reader needs is "what is this and does it work". | P0 |
| Install and first run against a real session | `cuj-first-eval` | There is no install path at all for the published package, and `agentevals list` — the only practical way to find a trace — appears only in `--help`. | P0 |
| Criterion authoring as a decision, not a syntax | `cuj-declare-criteria` | The block shape is shown; choosing judged vs deterministic, and choosing a severity, is where readers stall. | P0 |
| `fill` as a workflow with a worked proposal report | `cuj-fill-criteria` | The gate order — mechanical checks first, confidence last — is only legible against real output. | P0 |
| GitHub Actions recipe, plus GitLab and pre-commit | `cuj-gate-ci` | No CI recipe exists anywhere, and CI is the platform persona's entire journey. The contract is identical across platforms, so breadth is cheap and ships at launch. | P0 |
| Exit-code contract and `needs-review` policy | `cuj-gate-ci` | `needs-review` counts as failure by default; meeting that for the first time as a red build is avoidable. | P0 |
| Ensemble → consensus → zones, with the arithmetic | `cuj-calibrate-judge` | The invariant that errored runs can never produce a silent pass is stated only in contributor notes. It is the claim the eval owner needs demonstrated. | P0 |
| One-page triage of a result | `cuj-triage-failure` | Highest-traffic journey; nothing serves it. Five outcomes, and `SKIP` alone has four unrelated causes. | P0 |
| Reference shelf: CLI, configuration, graders, criteria schema, reports & exit codes | all | Every journey deep-links into these; without them journey pages inflate with tables. | P0 |
| Artifact coverage explained | `cuj-cover-every-artifact` | Every reporter renders a coverage section and nothing explains it. Resolution order lives only in source. | P1 |
| `--format json` report structure in use, `--output`, `--history`, regressions | `cuj-consume-results` | Three shipped features documented nowhere; the history file format is undiscoverable. | P1 |
| Judge calibration: runs, zones, temperature, cost ceiling, cache keys | `cuj-calibrate-judge` | Two silent failure modes live here — a stale cache replaying a superseded prompt, and a cost budget disabled by unknown model pricing. | P1 |
| Criteria schema versioning; `capability` vs `regression` | `cuj-evolve-criteria` | Two schema versions ship with no explanation of which to pin. The `type` field is the whole point of 0.2 and is documented nowhere, making it unusable. | P1 |
| Triage FAQ | `cuj-triage-failure` | Keeps the main triage page short enough to stay effective. | P2 |
| Programmatic API map and injection seams | `cuj-extend` | A large public export surface with nothing marking the intended entry points. | P2 |
| `registerGrader` and the two-part grader contract | `cuj-extend` | A grader without option validation can never be proposed by `fill` — a consequence invisible in the type signature. | P2 |
| Trace formats, discovery, project slug, `AGENTEVALS_HOME` | `cuj-cover-every-artifact`, `cuj-extend` | `AGENTEVALS_HOME` is required for a reproducible CI run and is documented only in contributor notes. | P2 |
| Export-surface reference | `cuj-extend` | A separate page from the `extend/` tour: the map of what is exported, so an import is not a bet on stability. | P2 |
| Glossary | all | Vocabulary is assumed across every page; one authority prevents drift between them. | P2 |

## 3. Existing pages that map to no CUJ

None. There are no existing pages.

Two repository files are **not** published. That is a decision, recorded here so it reads as one:

| File | Disposition |
|---|---|
| `CLAUDE.md` | Keep in the repository. Contributor working agreements are not user documentation; it gains a pointer block to this strategy directory. |
| `adrs/` | Keep in the repository. Decision records are reviewable history, not a user-facing surface. Journey pages may link to a specific ADR when a reader benefits from the reasoning — the `fill` page linking the decision that project rules are never written is the model. |

## 4. Source-of-truth mapping

Reference pages must never contradict the code. Cross-read the corresponding source before writing
or revising one:

| Page | Source of truth |
|---|---|
| `reference/cli` | `src/cli.ts` |
| `reference/configuration` | `src/core/config-schema.json`, `src/core/config.ts` |
| `reference/graders` | `src/graders/` — one file per kind, plus `registry.ts` and `util.ts` for the shared validators and their exact messages |
| `reference/criteria-schema` | `schemas/artifact-evals-0.2.json`, `schemas/artifact-evals-0.1.json`, `src/criteria/` |
| `reference/report-and-exit-codes` | `src/types.ts`, `src/reporters/`, `src/history.ts` |
| `reference/traces` | `src/trace/` — `detect.ts`, `claude.ts`, `discover.ts` |
| `reference/api` | `src/index.ts` |
| `declare/coverage` | `src/artifacts/resolve.ts` |
| `declare/fill` | `src/fill/gate.ts`, `src/commands/fill.ts` |
| `judge/*` | `src/judge/` — `trace-judge.ts`, `prompt.ts`, `cache.ts`, `provider.ts` |

Two cautions carried over from the sibling project, both learned the hard way:

- **Types describe shape; they do not promise population.** A field can be declared and never set.
  Verify against the assertions in `test/` before documenting a concrete value.
- **Capture output, do not compose it.** Build once and run the CLI against `test/fixtures/` rather
  than hand-writing sample output. The Doc Detective inline tests then execute those same commands
  on every push, so a drifted example fails CI instead of misleading a reader.

## 5. Maintenance

When a page lands, remove its row from §2 and drop its `[NEW]` marker in
[`proposed-ia.md`](proposed-ia.md). When a page is added that no journey asked for, either justify it
against a CUJ or reconsider it. An unjustified page is how a CUJ-first structure quietly becomes a
content-first one.
