---
id: proposed-ia
type: information-architecture
scope: Proposed IA for the agentevals documentation site (content under docs/src/content/docs/), designed CUJ-first
covers_nav_tab: the whole site
excludes: [README.md, CLAUDE.md, adrs/, docs/content_strategy/, docs/maintainers/]
derived_from: ../journeys/
companion: ia-gap-analysis.md
base_path: /agentevals
---

# Proposed information architecture

**Scope:** the structure of the published site — everything under `docs/src/content/docs/`. It
excludes the repository's contributor-facing files (`README.md`, `CLAUDE.md`, `adrs/`) and this
strategy directory, none of which are built into the site. The gaps this structure exposes are
enumerated in [`ia-gap-analysis.md`](ia-gap-analysis.md).

Unusually for this method, the scope is the *entire* published subtree rather than one nav section:
the docset is new, so there is no adjacent section to leave alone.

## Method — CUJ-first, not content-first

The structure is derived from [`../journeys/`](../journeys/_overview.md): each top-level nav group
carries one persona's set of journeys, and **every page is justified by the CUJ it serves**. Pages
were not inventoried from what the code happens to contain and then grouped by topic.

Two consequences follow, and both are deliberate:

- **No Diátaxis split at the top level.** Tutorial / how-to / explanation / reference is a useful
  lens on a single page and a poor organizing principle for a site, because it sorts content by the
  writer's genre instead of the reader's job. Nav groups here are jobs.
- **Reference is a flat lookup shelf.** It supports every journey and drives none.
  Journey pages explain the path and deep-link into reference for exhaustive detail; reference pages
  never carry navigational chrome, because nobody arrives at one except from a link or a search.

The landing page is a **router**: "what do you want to do?" plus a proof that runs in thirty
seconds.

## Navigation tree

```
Home — router + a proof that runs offline
│
├─ Get started            (universal on-ramp)     → cuj-first-eval
│
├─ Declare what to check  (Priya)                 → cuj-declare-criteria, cuj-fill-criteria,
│                                                    cuj-cover-every-artifact
│
├─ Run it in CI           (Devin)                 → cuj-gate-ci, cuj-consume-results
│
├─ Trust the judge        (Sam)                   → cuj-calibrate-judge, cuj-evolve-criteria
│
├─ Read a failing eval    (Theo)                  → cuj-triage-failure   (highest traffic)
│
├─ Build on agentevals    (Rin)                   → cuj-extend
│
└─ Reference (lookup shelf)                       → CLI · Configuration · Graders ·
                                                     Criteria schema · Reports & exit codes ·
                                                     Traces · API · Glossary
```

### Directory mapping

| Nav group | Directory | Route prefix |
|---|---|---|
| Get started | `get-started/` | `/agentevals/get-started/` |
| Declare what to check | `declare/` | `/agentevals/declare/` |
| Run it in CI | `ci/` | `/agentevals/ci/` |
| Trust the judge | `judge/` | `/agentevals/judge/` |
| Read a failing eval | `triage/` | `/agentevals/triage/` |
| Build on agentevals | `extend/` | `/agentevals/extend/` |
| Reference | `reference/` | `/agentevals/reference/` |

Each group is a single `autogenerate` directory in the Starlight sidebar — no page is enumerated in
config. Ordering inside a group is controlled by `sidebar.order` frontmatter, used only where
sequence carries meaning.

## Proposed structure

★ = written at launch. `[NEW]` marks a section the CUJs require that does not exist yet — which,
because this docset is new, is every page; the marker is kept on post-launch pages only, where it
stays meaningful.

```
/                                        ★ router + 30-second proof
get-started/
  index                                  ★ install → find a session → first run → read the report
declare/
  index                                  ★ instruction → criterion; judged or deterministic; severity
  fill                                   ★ propose across a project, the gate, review the diff
  coverage                         [NEW]   the coverage table, unresolved refs, skip
ci/
  index                                  ★ GitHub Actions recipe, offline mode, AGENTEVALS_HOME
  exit-codes-and-reports                 ★ the 0/1/2 contract, needs-review policy, output formats
  consume-results                  [NEW]   JSON report, history, regression detection
judge/
  index                                  ★ ensemble → consensus → zones → outcome
  calibrate                        [NEW]   tuning runs/zones/temperature, cost budget, cache keys
  schema-versioning                [NEW]   0.1 vs 0.2, capability vs regression, staged rollout
triage/
  index                                  ★ one page: read a result, weigh it, decide
  faq                              [NEW]   short answers to what survives the main page
extend/
  index                            [NEW]   the export map and the injection seams
  custom-graders                   [NEW]   registerGrader and the two-part grader contract
reference/
  index                                  ★ shelf hub
  cli                                    ★ run / fill / list, every flag and default
  configuration                          ★ every config key, including the ones with no CLI flag
  graders                                ★ seven kinds: options, validation rules, failure messages
  criteria-schema                        ★ the metadata.evals block, both published versions
  report-and-exit-codes                  ★ human / json / markdown shapes, exit codes, history
  traces                           [NEW]   formats, discovery, project slug, AGENTEVALS_HOME
  api                              [NEW]   the export surface, mapped
  glossary                         [NEW]   trace, artifact, criterion, plan, consensus, zone…
```

**24 pages: 14 at launch, 10 following.** The launch set is chosen so that:

- Two journeys are **gap-free** — [`cuj-fill-criteria`](../journeys/cuj-fill-criteria.md) and
  [`cuj-gate-ci`](../journeys/cuj-gate-ci.md).
- Three more reach their stated outcome with only an optional step outstanding:
  [`cuj-first-eval`](../journeys/cuj-first-eval.md) (missing the coverage explainer),
  [`cuj-declare-criteria`](../journeys/cuj-declare-criteria.md) (missing schema versioning), and the
  highest-traffic [`cuj-triage-failure`](../journeys/cuj-triage-failure.md), whose one required page
  ships and whose FAQ follows.
- The two least-served journeys — [`cuj-extend`](../journeys/cuj-extend.md) and
  [`cuj-consume-results`](../journeys/cuj-consume-results.md) — are the most self-contained, so
  deferring them strands nobody mid-track.

The remaining two, [`cuj-cover-every-artifact`](../journeys/cuj-cover-every-artifact.md) and
[`cuj-evolve-criteria`](../journeys/cuj-evolve-criteria.md), are deliberately unserved at launch:
both are things a reader reaches for *after* adopting the tool, not while evaluating it.

## CUJ → section coverage

| CUJ | Primary section | Also uses |
|---|---|---|
| `cuj-first-eval` | `get-started/` | `/`, `declare/coverage`, `reference/cli` |
| `cuj-declare-criteria` | `declare/` | `reference/graders`, `reference/criteria-schema` |
| `cuj-fill-criteria` | `declare/fill` | `reference/cli` |
| `cuj-cover-every-artifact` | `declare/coverage` | `reference/traces`, `reference/report-and-exit-codes` |
| `cuj-gate-ci` | `ci/` | `reference/configuration` |
| `cuj-consume-results` | `ci/consume-results` | `reference/report-and-exit-codes`, `extend/` |
| `cuj-calibrate-judge` | `judge/` | `reference/configuration` |
| `cuj-evolve-criteria` | `judge/schema-versioning` | `reference/criteria-schema`, `triage/` |
| `cuj-triage-failure` | `triage/` | `triage/faq` |
| `cuj-extend` | `extend/` | `reference/graders`, `reference/api`, `reference/traces` |

Every journey has a primary home, and no page belongs to zero journeys.

## What changes versus today

- **A site exists.** Today there is one 202-line README and nothing else user-facing.
- **The README stops being the product's documentation** and becomes a hook, an install, one worked
  example, and a link table into the site.
- **Commands are shown as the installed binary**, not as `node dist/cli.js` — a form that only works
  inside a clone of this repository and is unusable by anyone consuming the published package.
- **Six substantial surfaces get their first documentation**: artifact coverage, the report
  structure, history and regressions, judge calibration, criteria-schema versioning, and the
  programmatic API.

## Conventions for pages in this structure

- **Frontmatter:** `title` and `description` on every page, no exceptions. CI blocks the deploy
  otherwise.
- **Every page opens with its scope**: one or two sentences on what it covers and what it does not,
  cross-linking the page that does.
- **Journey pages end with a fork or a next step**; reference pages end without navigation.
- **Every command shown must run offline** against a committed fixture, and should be covered by a
  Doc Detective inline test. A sample output that was hand-written rather than captured is a defect.
- **Do not duplicate reference detail into a journey page.** Explain the path, link for the table.
