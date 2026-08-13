---
id: persona-platform-engineer
type: persona
name: "Devin — AI platform engineer"
audience: aud-platform-ci
role: Platform engineer who owns CI across many repositories
proficiency: [ci-configuration, exit-codes, json-processing, containers, secrets-management]
prerequisites:
  - configures GitHub Actions and at least one other CI system
  - reasons about process exit codes as a contract
  - parses JSON on the command line
  - configures tools through environment variables
goals:
  - one gate that behaves identically in every repository
  - no network calls and no secrets in a build
  - a documented output shape he can depend on across a fleet
  - an explicit policy for ambiguous outcomes
pains:
  - a check that can flip on identical input is not a gate
  - a paid API call per build is a cost line, a secret, and an outage surface
  - undocumented JSON shape cannot be depended on
  - tools that read from a developer home directory are hazards on shared runners
content_types: [copy-paste-recipe, contract-reference, worked-example]
journeys:
  - cuj-gate-ci
  - cuj-consume-results
  - cuj-first-eval
---

# Persona: Devin — AI platform engineer

**Scope:** the operator persona for [`aud-platform-ci`](../audiences/platform-ci.md). He installs
and plumbs the gate; he does not author the artifacts it checks.

Devin owns CI across a few dozen repositories. Agent-assisted work stopped being an experiment
some months ago, and he is now the person asked whether any of it can be verified before merge. He
did not write a single one of the skills he is being asked to check, and he does not intend to.

**Goal:** add one check that answers a mechanical question — *did this session follow the
instructions it was given?* — and route the answer into the reporting the organization already has.

**Pains:**

- **Non-determinism in a gate.** He needs to know precisely which part of this tool is
  deterministic and how to run only that part. If the answer is "mostly", it does not ship.
- **Network and spend in a build.** A judged eval calling a paid API on every push is three
  problems at once. The offline path has to be a documented first-class mode, not an escape hatch.
- **A third outcome he did not plan for.** `needs-review` is neither pass nor fail, and a pipeline
  needs a stated policy before it meets one, not after.
- **Environment leakage.** Anything reading from a home directory needs an override he controls on
  a shared runner.
- **Unspecified output.** He will parse the JSON report; he needs its shape documented well enough
  that he never opens the source to do it.

**How he uses moose-tracevals:** one recipe, copied into a workflow file, running deterministic graders
only, keyed off the exit code. If it stays quiet he never thinks about it again. Later, if someone
asks for trend data, he starts piping the JSON report and the history file somewhere.

**What success looks like for him:** the gate runs in seconds, makes no network call, and fails
loudly and specifically the first time a session violates a rule — with an exit code he can branch
on and JSON he can forward.

**Careful with:** Devin's journey must never require understanding criteria authoring or judge
calibration. He needs *trace*, *artifact*, and *outcome* only to the depth required to read a
result. Introduce `needs-review` and `failOnNeedsReview` in the same breath — the first is a trap
for him without the second.
