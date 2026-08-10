---
id: aud-toolsmiths
type: audience
segment: Toolsmiths building on tracevals
maturity: cross-cutting
docs_owner: they own code that imports tracevals
firmographics: [platform-team, oss-framework-maintainer, internal-tooling]
relationship_stages: [prospect, customer]
personas: [persona-toolsmith]
features_emphasized:
  - programmatic API (src/index.ts exports)
  - registerGrader
  - TraceGrader / validateOptions contract
  - TraceSource adapter seam
  - RunReport type
  - injection seams (judge, provider, prompt)
cross_cutting: true
---

# Audience: Toolsmiths building on tracevals

**Scope:** people writing code that imports tracevals, beyond invoking its CLI: custom graders,
wrappers, dashboards, and eventually trace adapters for formats other than Claude Code's. This is a
**cross-cutting lens** rather than a fifth point on the ownership axis. It does not cover CLI usage,
which every other audience covers better.

## Overlap with the primary segments

This audience is defined by *what someone builds on top of the tool*, so by construction it
overlaps the others instead of sitting beside them:

| Overlaps | When |
|---|---|
| [`aud-platform-ci`](platform-ci.md) | Parsing `RunReport` into a dashboard, or embedding a run in a larger harness. |
| [`aud-eval-standard`](eval-standard.md) | Reaching for a check no built-in grader performs, and registering one. |
| [`aud-artifact-authors`](artifact-authors.md) | Maintaining an in-house agent framework that wraps the library directly. |

The same person moves in and out of this audience by task. What justifies a separate segment is
that the *content* they need (the export surface, the grader contract, the adapter seam) is disjoint
from everything the primaries read, and that content has no other home.

## Who they are

TypeScript engineers building internal tooling or maintaining an agent framework. They read types
before prose, will open `src/index.ts` before they open a guide, and treat an undocumented export as
an invitation.

## What they're trying to do

Extend tracevals instead of reimplementing it: add a check the built-ins do not cover, consume
results structurally, or teach it to read a trace format it does not know yet.

## Defining pains

- **A large public surface with no map.** The package exports a substantial API across traces,
  artifacts, criteria, graders, judge, config, engine, reporters, and commands. Nothing says which
  parts are the intended entry points and which are internals that happen to be reachable.
- **An undocumented extension point.** `registerGrader()` is exported and is exactly what a custom
  check needs, but a grader has a two-part contract, grading *and* option validation, and omitting
  the second half means the criterion can never be proposed by `fill`. None of that is discoverable
  from the type alone.
- **An adapter seam whose shape is implied.** Support for other trace formats is a deferred design
  decision, and someone attempting it needs to know what the normalized model requires and what
  degrades gracefully when a field is absent.
- **Report shape undocumented.** Building on a JSON structure discovered by inspection means every
  release is a gamble.
- **Testability.** Anything built on top needs to run offline in its own test suite, which requires
  knowing the injection seams exist.

## Buying constraints

- ESM-only, Node.js 24+, TypeScript types shipped. All already true.
- The extension points must be usable without forking.
- Whatever is documented as public needs to behave as public.

## Qualified reader (for docs targeting)

- **Prerequisites they bring:** TypeScript, ESM module resolution, npm package consumption, JSON
  Schema, and dependency injection for test seams. They will read a type signature as
  documentation.
- **Subject dependencies:** the entire domain vocabulary (*trace*, *artifact*, *criterion*, *plan*,
  *grader*, *finding*, *outcome*) must already be established. This audience's content sits
  at the top of the dependency stack and should assume the journey pages, linking back rather than
  restating. A custom grader cannot be explained before the built-in graders are.
