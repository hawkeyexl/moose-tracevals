---
id: persona-artifact-author
type: persona
name: "Priya — Skill & agent author"
audience: aud-artifact-authors
role: Senior engineer who maintains her team's agent instruction artifacts
proficiency: [markdown, yaml-frontmatter, git, cli, agent-skill-authoring]
prerequisites:
  - reads and writes YAML frontmatter
  - reviews a Git diff before accepting it
  - has authored a SKILL.md, an agent definition, or a project rules file
  - runs a CLI and reads its output
goals:
  - know whether sessions followed the instructions they were given
  - get told when an instruction quietly stops being obeyed
  - turn prose instructions into checks without writing them all by hand
  - keep instruction files under her own review
pains:
  - no feedback loop between instructions and behavior
  - silent drift after a model or prompt change
  - half her instructions are untestable and she cannot tell which half
  - authoring evals by hand is slow enough to stall adoption
  - will not install a tool that edits her files without a diff
content_types: [quickstart, task-guide, worked-example, reference-lookup]
journeys:
  - cuj-first-eval
  - cuj-declare-evals
  - cuj-fill-evals
  - cuj-cover-every-artifact
lead: true
---

# Persona: Priya — Skill & agent author

**Scope:** the owner persona for [`aud-artifact-authors`](../audiences/artifact-authors.md), and the
**lead persona** for the documentation set.

Priya maintains her team's agent instruction artifacts: eight skills under `.claude/skills/`, three
subagent definitions, and a `CLAUDE.md` that has grown past the point anyone rereads it. She wrote
most of it herself over six months, in response to specific things going wrong. She is a strong
engineer and a complete novice at evaluation: she has heard "LLM-as-judge" and is mildly suspicious
of it.

**Goal:** close the loop between the instructions she wrote and what her agents actually did — and
be told when a rule she added months ago quietly stops being followed.

**Pains:**

- She wrote *"reproduce the bug with a failing test before applying the fix"* and has no idea
  whether it happens. Reading transcripts is the only mechanism, and it does not scale past the
  first few.
- Nothing tells her when behavior drifts. An instruction that worked when written can stop being
  followed after a model change and produce no signal at all.
- She suspects a good fraction of what she wrote cannot be checked by anything. Being told *which*
  parts is more useful to her than being given a soft assertion that always passes.
- Hand-writing evals for eleven artifacts is the step most likely to end her adoption right
  after her first successful run.

**How she uses moose-tracevals:** she runs it against a session that already happened — no
instrumentation, no re-running work — and reads the report. Once convinced, she runs `fill
--dry-run` across the project, reviews what it proposes, and keeps the evals that are honest.
Later she wires it into CI, at which point she hands the pipeline half to Devin. She returns when
she adds a skill or when a report surprises her.

**What success looks like for her:** an artifact she edited last week shows an eval that fails,
and the failure names the tool call that broke the rule. That is the moment the tool stops being a
demo.

**Why she is the lead persona:** she is the primary adopter and the only persona who touches every
layer — install, artifact resolution, evals authoring, grader choice, reporting, and eventually
CI. Her backbone journey [`cuj-first-eval`](../journeys/cuj-first-eval.md) threads through all of
them in a single line, and every other persona either serves her or intersects her.

**Careful with:** Priya's main path must not be gated on judge internals. Ensembles, consensus, and
confidence zones are one link away from her journey, never a prerequisite inside it — the moment
she has to understand consensus arithmetic to read her first report, the on-ramp has failed.
