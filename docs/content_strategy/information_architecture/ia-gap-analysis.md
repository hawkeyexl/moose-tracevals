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
| "Declaring evals" | `declare/` | Expand into a journey. The block example survives; grader choice and severity are new. |
| "Deterministic grader kinds" table | `reference/graders/` | Move and expand, to cover options, validation rules, and the actual failure messages. |
| "Filling in evals" | `declare/fill` | Expand into a workflow with a worked proposal report. The rejection-reason table moves with it. |
| "Configuration" YAML sample | `reference/configuration/` | Move. The sample stays; a per-key table with types and defaults is new. |
| "Exit codes" table | `reference/report-and-exit-codes/` and `ci/exit-codes-and-reports` | Move; the CI page carries the policy discussion, reference carries the table. |
| "Development" | `README.md` | Stays in the repository. Contributor content is not published to the site. |
| "License" | `README.md` | Stays. |

**Nothing in the README is dropped.** Two things it does *not* currently contain but must gain: an
install line for the published package, and a link table into the site.

## 2. `[NEW]`: content the CUJs require that does not exist

**None.** All 24 pages in the content set are written, and no CUJ step carries an `exists: false`.

That is the state to defend, not a finish line. This section exists so a gap can be recorded the
moment a journey outgrows its pages. Add a row here the same day you notice one.

### What closed, and in what order

Kept because the sequencing reasoning is the useful part, not the list.

| Wave | Pages | Reasoning |
|---|---|---|
| **Launch (14)** | landing, get-started, declare + fill, ci + exit-codes, judge, triage, and the five-page reference shelf | Chosen to make four journeys usable end to end, and to serve the highest-traffic journey (`cuj-triage-failure`) with its one required page. Reference came in whole because every journey deep-links into it; without it the journey pages inflate with tables. |
| **P1 (4)** | `declare/coverage`, `ci/consume-results`, `judge/calibrate`, `judge/schema-versioning` | Each closed a journey that dead-ended. Two journeys, `cuj-cover-every-artifact` and `cuj-evolve-evals`, had no page at all until this wave. |
| **P2 (6)** | `triage/faq`, `extend/` ×2, `reference/traces`, `reference/api`, `reference/glossary` | Four of the six are the toolsmith journey, which was 100% gaps and entirely self-contained. Deferring it stranded nobody. |

Two things learned in the P2 wave, worth remembering:

- **A new nav group costs a config edit.** Starlight's `autogenerate` throws on an empty directory,
  so `extend/` could only be added to `astro.config.mjs` in the same change as its first page.
- **Anchors written before their page is written will be wrong.** Seven CUJ steps deep-linked to
  `#fragment`s that the eventual headings did not match. The strategy gate's anchor check caught
  every one. Prefer linking a page and adding the fragment once the heading exists.

## 3. Existing pages that map to no CUJ

None. There are no existing pages.

Two repository files are **not** published. That is a decision, recorded here so it reads as one:

| File | Disposition |
|---|---|
| `CLAUDE.md` | Keep in the repository. Contributor working agreements are not user documentation; it gains a pointer block to this strategy directory. |
| `adrs/` | Keep in the repository. Decision records are reviewable history, not a user-facing surface. Journey pages may link to a specific ADR when a reader benefits from the reasoning. The `fill` page linking the decision that project rules are never written is the model. |

## 4. Source-of-truth mapping

Reference pages must never contradict the code. Cross-read the corresponding source before writing
or revising one:

| Page | Source of truth |
|---|---|
| `reference/cli` | `src/cli.ts` |
| `reference/configuration` | `src/core/config-schema.json`, `src/core/config.ts` |
| `reference/graders` | `src/graders/`, one file per kind, plus `registry.ts` and `util.ts` for the shared validators and their exact messages |
| `reference/evals-schema` | `schemas/artifact-evals-1.0.0-proposal.1.json` (vendored from docmeta), `src/evals/` |
| `reference/report-and-exit-codes` | `src/types.ts`, `src/reporters/`, `src/history.ts` |
| `reference/traces` | `src/trace/`, in `detect.ts`, `claude.ts`, and `discover.ts` |
| `reference/api` | `src/index.ts` |
| `declare/coverage` | `src/artifacts/resolve.ts` |
| `declare/fill` | `src/fill/gate.ts`, `src/commands/fill.ts` |
| `judge/*` | `src/judge/`, in `trace-judge.ts`, `prompt.ts`, `cache.ts`, and `provider.ts` |

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
