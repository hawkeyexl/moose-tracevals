---
id: persona-toolsmith
type: persona
name: "Rin, toolsmith"
audience: aud-toolsmiths
role: TypeScript engineer building tooling on top of moose-tracevals
proficiency: [typescript, esm, json-schema, dependency-injection, npm-packaging]
prerequisites:
  - reads a type signature as documentation
  - consumes an ESM-only package on Node 24+
  - writes JSON Schema
  - injects dependencies to keep a test suite offline
  - already holds the domain vocabulary of trace, artifact, eval, plan, grader, outcome
goals:
  - add a check the built-in graders do not cover
  - consume run results structurally instead of scraping output
  - teach the tool a trace format it does not know yet
  - keep everything built on top testable offline
pains:
  - a large export surface with nothing marking the intended entry points
  - registerGrader is exported but its two-part contract is not discoverable from the type
  - the adapter seam's requirements are implied
  - building on a JSON shape discovered by inspection makes every release a gamble
content_types: [api-reference, annotated-example, contract-explanation]
journeys:
  - cuj-extend
  - cuj-consume-results
cross_cutting: true
---

# Persona: Rin, toolsmith

**Scope:** the builder persona for [`aud-toolsmiths`](../audiences/toolsmiths.md), the cross-cutting
audience. Rin imports the library; the CLI is incidental to them.

Rin maintains internal tooling, or an open-source agent framework. They have decided moose-tracevals
is close enough to what they need that extending it beats rebuilding it. They opened `src/index.ts`
before they opened any guide, and treat an undocumented export as an invitation.

**Goal:** extend instead of reimplementing. Add the check the built-ins miss, consume results as data,
and eventually read a trace format the tool does not support yet.

**Pains:**

- **A large surface with no map.** The package exports across traces, artifacts, evals, graders,
  judge, config, engine, reporters, and commands. Nothing distinguishes an intended entry point
  from an internal that happens to be reachable, so every import is a guess about stability.
- **A two-part contract that looks like one part.** A custom grader must both grade *and* validate
  its own options, and one that skips the second half can never be proposed by `fill`. That
  consequence is invisible in the type signature.
- **A seam whose shape is implied.** Support for other trace formats is a deliberate, deferred
  decision, not an oversight. Someone attempting one needs to know what the normalized model
  requires and which fields degrade gracefully when absent.
- **Undocumented report shape.** Parsing a structure they reverse-engineered means every release
  is a gamble.

**How they use moose-tracevals:** as a dependency. They register a grader at startup, and run the
engine with an injected judge so their own suite stays offline. They read the typed report instead
of the rendered one. They will contribute upstream if the seam is clear enough to make it obvious where
their change belongs.

**What success looks like for them:** a custom grader written, registered, and passing in their
own test suite inside an afternoon. No fork, and no import from a deep path.

**Careful with:** Rin sits at the top of the dependency stack. Their content should assume the
journey pages and link back instead of restating. A custom grader cannot be explained before the
built-in graders are. Resist the pull to make this content an exhaustive symbol dump. Rin needs a
*map* of which exports are the front door. Rin also needs the *contracts* of what a grader owes its
caller, not a list of every name.
