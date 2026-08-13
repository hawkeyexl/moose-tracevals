# Content strategy

**Scope:** the durable audience, persona, critical-user-journey, and information-architecture
strategy for the moose-tracevals documentation site. Every writing task consults this directory before
drafting. It does **not** contain user-facing documentation; that lives in `docs/src/content/docs/`.

These files sit inside `docs/` but outside `docs/src/content/docs/**`, so they are never built into
the published site. They are internal working documents for agents and contributors.

## Layout

| Directory | Contents |
|---|---|
| [`audiences/`](audiences/_overview.md) | The five target segments (`aud-*`), one file each, plus the segmentation axis. |
| [`personas/`](personas/_overview.md) | One minimal persona per audience (`persona-*`), on the qualified-reader model. |
| [`journeys/`](journeys/_overview.md) | The ten critical user journeys (`cuj-*`), each mapped to real doc routes, plus the persona → CUJ coverage matrix. |
| [`information_architecture/`](information_architecture/proposed-ia.md) | The CUJ-driven site structure and the gap analysis that enumerates what is still missing. |

## The ID-linking model

Stable IDs are the glue. Every artifact declares an `id:` and references others by ID:

```
audience ──< persona ──< journey ──> doc touchpoint
 aud-*        persona-*    cuj-*        /moose-tracevals/<route>
```

| Artifact | ID prefix | References |
|---|---|---|
| Audience | `aud-*` | — |
| Persona | `persona-*` | `audience:` → one `aud-*` |
| CUJ | `cuj-*` | `personas:` → one or more `persona-*`; `steps[].doc` → real site routes |
| IA | (none) | derives from `cuj-*` |

Two invariants hold across the whole directory:

- **No dangling references.** Every `aud-*`, `persona-*`, and `cuj-*` mentioned in frontmatter
  resolves to a file that declares that `id:`.
- **No orphans.** Every persona has at least one CUJ; every CUJ has at least one persona.

IDs are stable once published, because they are referenced across files and from
[`CLAUDE.md`](../../CLAUDE.md).

## How to use this during writing tasks

Before drafting or editing any page under `docs/src/content/docs/**`:

1. **Identify the persona the page serves.** See [`personas/_overview.md`](personas/_overview.md). A
   page may serve more than one, but there is usually a primary.
2. **Find the matching CUJ.** See [`journeys/_overview.md`](journeys/_overview.md). Understand the
   end-to-end outcome the persona needs to reach.
3. **Structure the content around that journey, not by document type.** Do not impose a
   Diátaxis-style tutorial/how-to/explanation/reference split as the organizing principle. Ask:
   what does this persona need to know, and in what order, to reach the outcome?
4. **Link into the Reference shelf for lookups.** Exhaustive flag tables, config keys, and grader
   options belong in `reference/`. Journey pages explain the path and link into reference without
   duplicating it.
5. **Check the IA map.** [`information_architecture/proposed-ia.md`](information_architecture/proposed-ia.md)
   lists every planned page and the CUJ it serves. If you add a page, record it there and update
   [`ia-gap-analysis.md`](information_architecture/ia-gap-analysis.md).
6. **Frontmatter.** Every page needs `title` and `description`. CI enforces it; see below.

## Verifying technical claims

moose-tracevals documents a real CLI, so every flag, exit code, output string, config default, and grader
rule must match the code, never the writer's assumption.

- **Source files are the contract for behavior.** `information_architecture/ia-gap-analysis.md`
  carries a source-of-truth table naming the `src/` file each reference page must be cross-read
  against.
- **The test suite is the contract for exact emitted strings.** Type definitions describe the
  *shape* of output; the assertions in `test/` encode what the tool actually prints.
- **Capture real sample output** by building once (`npm run build`) and running the built CLI
  against `test/fixtures/`, instead of hand-writing it. That keeps docs and CI in lockstep, and
  the Doc Detective inline tests in each page then run those same commands on every push.
- **Two gates enforce this mechanically.** `.github/workflows/docs.yml` blocks the Pages deploy
  unless every page's frontmatter validates (moose-tracevals dogfoods its own `docmeta` dependency to do
  it), and `.github/workflows/doc-detective.yml` runs every documented command against the fixture
  corpus.

## Evidence basis, and its limitation

**These segments are not derived from user research.** The usual method for this strategy, which is
to cluster recorded customer and prospect calls into segments bottom-up, was unavailable: moose-tracevals
has no call evidence. What is written here is derived from three real but indirect sources:

1. **The product's own surface**: the CLI in `src/cli.ts`, the config schema, the grader registry,
   the artifact-evals schema, and the export surface in `src/index.ts`. Every knob implies someone
   who turns it.
2. **The seven accepted ADRs in [`adrs/`](../../adrs/)**, which record who each decision was made
   for and what it deliberately refuses to do.
3. **The validated segmentation of the sibling [docmeta](https://github.com/hawkeyexl/docmeta)
   project**, whose audience of teams running a metadata gate in a docs-as-code repo is adjacent
   enough that its four-way split transferred cleanly.

Treat every audience and persona here as a **falsifiable hypothesis**. The first
maintenance action is to re-ground them against real users: interview adopters, then re-cluster
bottom-up and revise. Until then, the parts most likely to be wrong are the *relative weight* of
the segments (which is the lead? is `aud-run-triagers` really the highest-traffic one?) than their
existence: each one maps to a real, shipped part of the product.

## Maintenance

- **Refresh by re-interviewing.** Editing in place from intuition does not count. See above.
- **Keep IDs stable.** Renaming an `id:` breaks references across this directory and `CLAUDE.md`.
- **Keep the IA current.** A new page that is absent from the content set is a page no CUJ asked
  for. Either justify it against a journey or reconsider it.
- **Gaps are the deliverable.** `ia-gap-analysis.md` is expected to list content that does not
  exist yet; that list is the roadmap.
