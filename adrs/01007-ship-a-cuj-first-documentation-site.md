---
status: "accepted"
date: 2026-08-03
decision-makers: [hawkeyexl]
---

# Ship a CUJ-first documentation site, with a committed content strategy and mechanical drift gates

## Context and Problem Statement

agentevals had no documentation set. The entire user-facing corpus was a 202-line `README.md` that
documented the CLI as `node dist/cli.js` — a form that only works inside a clone of this repository,
leaving no install path at all for anyone consuming the published package. Substantial shipped
surface was documented nowhere: `--history` and the history file format, `--output`, the markdown
reporter, the `RunReport` structure, `AGENTEVALS_HOME`, the `type: capability | regression` field
added in artifact-evals 0.2, `registerGrader()`, the programmatic API, and every config key with no
CLI flag.

Two questions had to be answered together: **what structure should a documentation set for this
product have**, and **what stops it from drifting away from the code** the way a README does.

## Decision Drivers

- The product's audiences are genuinely distinct — someone authoring a `SKILL.md`, someone plumbing
  a CI gate, someone deciding whether an LLM verdict is evidence, and someone staring at one red
  line — and they need different content in a different order.
- Documentation of a CLI rots silently. A flag rename, a changed default, or a reworded failure
  message leaves prose that is confidently wrong.
- There is **no user research** for agentevals. Any audience model here is a hypothesis, and the
  documentation has to say so rather than present invented segments as findings.
- The sibling [docmeta](https://github.com/hawkeyexl/docmeta) repo already solved this shape and
  the result is in production. Divergence should be earned, not accidental.
- The published package must stay `dist` + `schemas`. Docs tooling cannot leak into it.
- The offline-and-hermetic testing rule applies to any new gate: no gate may reach the network.

## Considered Options

- **Structure:** CUJ-first (nav groups are jobs) vs. Diátaxis (nav groups are document genres) vs.
  expanding the README in place.
- **Strategy artifacts:** committed and agent-readable vs. held informally.
- **Drift enforcement:** dogfooded frontmatter validation, Doc Detective inline tests, a CLI
  introspection check, or nothing.

## Decision Outcome

Chosen: **a CUJ-first Astro + Starlight site in a nested `docs/` project, driven by a committed
content strategy under `docs/content_strategy/`, gated by dogfooded frontmatter validation and Doc
Detective inline tests.**

**CUJ-first over Diátaxis.** Nav groups map to jobs — *Get started*, *Declare what to check*, *Run
it in CI*, *Trust the judge*, *Read a failing eval* — and every page is justified by the journey it
serves. Diátaxis sorts content by the writer's genre rather than the reader's task; it remains a
useful lens on a single page and a poor top-level structure. Reference is a flat lookup shelf that
journeys deep-link into: it supports navigation, it does not drive it.

**The strategy is a committed artifact, not a document.** `docs/content_strategy/` carries five
audiences (`aud-*`), five personas (`persona-*`), ten journeys (`cuj-*`), and the IA, cross-linked by
stable IDs with two invariants: no dangling references, and no persona without a journey or journey
without a persona. `CLAUDE.md` points at it so writing tasks are anchored rather than improvised.

**The evidence limitation is recorded in the artifact itself.** The audiences are derived from the
product surface, the ADR record, and docmeta's validated split — not from users. The strategy README
says so and names re-grounding as the first maintenance action. The alternative — presenting derived
segments as research — would make the strategy unfalsifiable.

**Two gates, not three.** Frontmatter validation dogfoods `docmeta`, already a runtime dependency,
so the library that reads `metadata.evals` from a `SKILL.md` also validates this site's pages and
blocks the Pages deploy on a missing `title` or `description`. Doc Detective runs the exact commands
the docs present against the freshly built CLI over `test/fixtures/`. A CLI-introspection check
(docmeta's `check-cli-reference.mjs`) was **considered and deferred**: Doc Detective already asserts
the documented flags via `--help`, so the marginal coverage did not justify a second mechanism.

### Consequences

- Good: the six largest undocumented surfaces get their first documentation, and the README becomes
  a hook plus a link table rather than the product's documentation.
- Good: a drifted example fails CI instead of misleading a reader. Sample output is *captured* from
  the CLI, never composed.
- Good: docs dependencies live in a nested `private` project, so `files` stays `dist` + `schemas`.
- Good: the docs tests are as hermetic as the unit suite — every tested command runs
  `--deterministic-only` or `--provider mock` with `AGENTEVALS_HOME` pinned to the fixture home.
- Bad: two npm projects means two lockfiles and two installs.
- Bad: adding a nav group requires an `astro.config.mjs` edit, because `autogenerate` throws on an
  empty directory. The `extend/` group is therefore absent until its first page lands.
- Bad: the gaps are now enumerated in public. `ia-gap-analysis.md` lists ten unwritten pages of a
  twenty-four page content set — which is the intent, not a defect.

### Confirmation

- `.github/workflows/docs.yml` — `npm run docs:validate` (dogfooded `docmeta`) gates the build,
  which gates the Pages deploy. A page missing `title` or `description` does not ship.
- `.github/workflows/doc-detective.yml` — runs every documented command against the local build.
  Two guards make it trustworthy: it verifies `npx agentevals --version` matches this package before
  running anything (see below), and it asserts `test/fixtures/project` is byte-identical afterwards,
  since the docs exercise `fill --dry-run` against the real corpus.
- `scripts/check-content-strategy.mjs`, run by the same workflow via `npm run docs:check-strategy`,
  enforces the invariants the strategy declares about itself: no dangling `aud-*`/`persona-*`/`cuj-*`
  reference, no persona without a journey or journey without a persona, every `exists: true` route
  resolving to a real page, and every internal site link pointing somewhere. Without it the
  ID-anchor model is decoration.

## Pros and Cons of the Options

### CUJ-first structure

- Good, because each nav group has one owner persona and one set of outcomes, so "does this page
  belong?" has an answer.
- Good, because it makes gaps visible: a journey step with no page is a `[GAP]` row rather than an
  absence nobody notices.
- Bad, because a page serving two personas needs a judgement call about where it lives.

### Diátaxis as the top-level structure

- Good, because it is widely understood and needs no local explanation.
- Bad, because it splits a single journey across four sections — install in Tutorial, CI in How-to,
  consensus in Explanation, flags in Reference — and the reader has to reassemble it.
- Bad, because it invites writing a genre to completeness rather than a journey to usefulness.

### Expanding the README

- Good, because it is one file with no build.
- Bad, because it cannot serve five audiences without becoming unreadable for all of them, and the
  README was already the largest thing nobody read to the end.

### A CLI introspection check (deferred)

- Good, because it mechanically compares the reference page against the real commander program.
- Neutral, because Doc Detective already asserts documented commands and flags through `--help`.
- Bad, because it is a second bespoke script to maintain for overlapping coverage. Revisit if the
  CLI reference drifts in practice.

## Note: `npx agentevals` is not a safe cold command

Discovered while writing the docs and worth recording, because
[CLAUDE.md](../CLAUDE.md#release-channels) previously implied otherwise. The `bin` name is
independent of the package name, but **`npx` resolves by package name**. The unscoped `agentevals`
on npm belongs to an unrelated project, so `npx agentevals` with nothing installed fetches that
package, not this one. It resolves correctly only once `@hawkeyexl/agentevals` is a local
dependency, since npm prefers `node_modules/.bin`.

The documentation therefore shows `npm install --save-dev @hawkeyexl/agentevals` before any
`npx agentevals`, and `npx @hawkeyexl/agentevals` for the zero-install path. The Doc Detective
workflow asserts the linked binary's version matches this package before running any test, so a
broken `npm link` fails loudly instead of silently testing somebody else's CLI.
