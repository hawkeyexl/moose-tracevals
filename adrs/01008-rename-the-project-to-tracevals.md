---
status: "accepted"
date: 2026-08-10
decision-makers: [hawkeyexl]
consulted: []
informed: []
---

# Rename the project to `tracevals` and publish it unscoped

## Context and Problem Statement

The project shipped as `@hawkeyexl/agentevals` with a `bin` of `agentevals`. The scope was not a choice — the unscoped `agentevals` on npm belongs to an unrelated project (LangChain's), so the name the CLI answers to was owned by someone else. That split is a standing footgun, because `npx` resolves by *package* name: `npx agentevals` on a machine with nothing installed fetches LangChain's package and runs it. Every install path in the docs had to carry a caution box explaining the hazard, and CI needed a version assertion to prove `npm link` had taken.

The name was also imprecise. This tool does not evaluate agents; it evaluates *traces* — it reads a session that already happened and asks whether that session adhered to the skills, agent definitions, and project rules it used. "agentevals" describes agent benchmarking, which is what the package that owns the name actually does. `trace` is already the noun at the center of the architecture: the `Trace` model, the `TraceSource` adapter seam (ADR 01003), and the `TraceGrader` registry (ADR 01004).

## Decision Drivers

- The CLI should own the name it is invoked by, so `npx <name>` is never someone else's code.
- The name should describe the input the tool actually takes, and stay true as trace adapters beyond Claude Code arrive (ADR 01003).
- Nothing was ever published: `@hawkeyexl/agentevals` has no versions on npm and therefore no consumers. The rename is free now and expensive after the first release.
- Sibling naming should stay legible: `docmeta`, `docevals`, `tracevals`.

## Considered Options

- Rename to `tracevals`, published unscoped
- Rename to `@hawkeyexl/tracevals`, keeping the scope
- Keep `@hawkeyexl/agentevals`

## Decision Outcome

Chosen option: **rename to `tracevals`, published unscoped**, because it is the only option that makes the package name, the `bin` name, and the invoked command the same string. `tracevals` and `@hawkeyexl/tracevals` were both unregistered at the time of the decision; taking the unscoped name removes the split rather than relocating it.

The rename is total, not cosmetic. It covers the package name and `bin`, the `TRACEVALS_HOME` and `TRACEVALS_LIVE` environment variables, the `tracevals.config.yaml` config filename, the `.tracevals/` runtime directory (cache and `history.jsonl`), the `TracevalsError` and `TracevalsConfig` exported types, the default `tracevals-report.{json,md}` output names, the internal schema `$id`s (`tracevals:config:0.1`, `tracevals:verdict:0.1`), the published `artifact-evals-*.json` `$id` URLs, the GitHub repository, and the documentation site's base path.

**No compatibility shim ships.** The old environment variables, config filename, and state directory are not read as fallbacks. With zero published versions there is no installed base to be compatible with, and a silent fallback would be a permanent maintenance surface bought for no one.

### Consequences

- Good, because `npx tracevals` resolves to this CLI cold, with or without a local install — the hazard the docs kept warning about is gone rather than documented.
- Good, because the name describes the input (a trace) instead of overclaiming the subject (an agent), and survives the addition of non-Claude trace adapters.
- Good, because it removed three caution asides from the docs and simplified the install instructions to a single path.
- Bad, because "agent evals" is the phrase people search for and "trace" is a term this tool teaches rather than one users arrive with. Mitigated by keeping `agents`, `claude-code`, and `evals` in the package `keywords` and naming agent sessions in the package description — not by the name itself.
- Bad, because `trace` collides with distributed tracing (OpenTelemetry spans, latency), so the name can suggest performance analysis. Judged a milder collision than shipping under a name owned by a live, adjacent package.
- Bad, because the docs site moves from `/agentevals` to `/tracevals` and the published schema `$id` URLs change host path. GitHub redirects the renamed repository, so existing `$id` URLs continue to resolve; the `$id`s were never referenced by a published package.
- Neutral, because the repository rename, the npm trusted-publishing configuration, and the GitHub Pages source are one-time manual steps outside this change.

### Confirmation

`grep -ri agentevals` over the tree (excluding `node_modules/`, `.git/`, and `dist/`) returns only deliberate historical references — this ADR and the paragraph in `CLAUDE.md` that explains why the name changed. Any other hit is a missed rename. The unit and integration suites assert the new environment variable and state-directory names, [ci.yml](../.github/workflows/ci.yml) dogfoods the renamed binary against `test/fixtures/`, and [doc-detective.yml](../.github/workflows/doc-detective.yml) still asserts that `npx tracevals --version` matches this package's version before running the documented commands.

## Pros and Cons of the Options

### Rename to `tracevals`, published unscoped

- Good, because package name, `bin` name, and invoked command are one string, so `npx` cannot resolve elsewhere.
- Good, because it matches the unscoped sibling `docmeta`.
- Neutral, because an unscoped name is squattable until first publish; the window is the time to trusted-publishing setup.
- Bad, because it forfeits the `@hawkeyexl/*` grouping that `@hawkeyexl/inference` uses.

### Rename to `@hawkeyexl/tracevals`, keeping the scope

- Good, because it groups with `@hawkeyexl/inference` and the scope guarantees the name cannot be taken.
- Bad, because it reproduces the exact problem being solved: `npx tracevals` would still resolve to whoever registers the unscoped name, and every install path would still need the caution box.

### Keep `@hawkeyexl/agentevals`

- Good, because it costs nothing and the docs already describe the hazard accurately.
- Bad, because the hazard is permanent, gets worse with adoption, and cannot be fixed later — the unscoped name is not obtainable.
- Bad, because the name keeps describing agent benchmarking rather than trace adherence.
