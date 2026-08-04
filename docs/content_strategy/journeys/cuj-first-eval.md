---
id: cuj-first-eval
type: cuj
title: Evaluate your first session end to end
personas: [persona-artifact-author, persona-platform-engineer]
backbone: true
trigger: "Someone suspects their agent is not following the instructions it was given, and wants proof either way."
entry_point: /agentevals/get-started/
success_criteria: "A real past session is evaluated and the reader can say, per artifact, which instructions held and which did not — without an API key and without re-running any work."
steps:
  - { stage: "Understand what is being checked", doc: /agentevals/, exists: true }
  - { stage: "Install and confirm the CLI runs", doc: /agentevals/get-started/, exists: true }
  - { stage: "Find an evaluable session", doc: "/agentevals/get-started/#find-a-session", exists: true, note: "agentevals list; where the session store lives" }
  - { stage: "Run the first evaluation offline", doc: "/agentevals/get-started/#run-your-first-evaluation", exists: true, note: "--deterministic-only, then --provider mock" }
  - { stage: "Read the report", doc: "/agentevals/get-started/#read-the-report", exists: true }
  - { stage: "Understand artifact coverage", doc: /agentevals/declare/coverage/, exists: false, note: "[GAP] why an artifact appears in the coverage table instead of as an eval" }
  - { stage: "Look up a flag", doc: /agentevals/reference/cli/, exists: true }
---

# CUJ: Evaluate your first session end to end

**Scope:** the **backbone journey** — first contact through a real, readable result. It stops at the
moment the reader trusts the output. Making the checks say something specific is
[`cuj-declare-criteria`](cuj-declare-criteria.md); putting it in a pipeline is
[`cuj-gate-ci`](cuj-gate-ci.md).

**Trigger.** Someone has a repository full of agent instructions and a growing suspicion that some
of them are decorative. They want evidence before investing further.

**Narrative.** This journey is short by construction, and its length is the product's main claim:
because artifacts are resolved deterministically from the trace and the filesystem, and because
artifacts with no declared criteria still get one implicit whole-artifact eval, a first run produces
something meaningful with **zero configuration**. Nothing needs authoring before the first result.

Three things must land in order, and each is a place the journey can be lost:

1. **A trace is a session that already happened.** It is a file on disk. No instrumentation, no
   re-running work. Readers who expect to install a wrapper and re-run their agent stop here.
2. **The first run costs nothing.** `--deterministic-only` makes no model call at all, and
   `--provider mock` exercises the full pipeline offline. A first-run experience that demands an API
   key loses both personas at once — which is why the default provider uses the local agent CLI's
   own auth rather than a key anyone has to provision.
3. **The report is legible without a glossary.** Outcome, artifact, criterion, finding. If reading
   the first report requires understanding consensus arithmetic, the on-ramp has failed.

Priya and Devin both walk this journey but leave it by different doors — she toward declaring
criteria, he toward CI — so it must end with a fork, not a single next step.

**Current friction / gap.** Today this journey does not exist in any form: the README shows
`node dist/cli.js`, so there is no install path at all for someone consuming the published package,
and `agentevals list` — the only practical way to find a trace — is undocumented outside of
`--help`. The one `[GAP]` here is artifact coverage: an unresolved skill reference shows up in a
coverage table rather than as a failing eval, and a first-time reader has no way to know that is
working as designed.
