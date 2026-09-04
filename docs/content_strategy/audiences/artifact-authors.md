---
id: aud-artifact-authors
type: audience
segment: Agent-instruction authors
maturity: cross-cutting
docs_owner: the person who wrote the skill, agent definition, or project rules
firmographics: [solo-maintainer, small-eng-team, platform-team, oss-project]
relationship_stages: [prospect, customer]
personas: [persona-artifact-author]
features_emphasized:
  - artifact resolution
  - declared evals (metadata.evals)
  - fill
  - deterministic graders
  - implicit whole-artifact eval
  - human report
lead: true
---

# Audience: Agent-instruction authors

**Scope:** people who write and maintain the instruction artifacts an agent reads, meaning
`SKILL.md` files, agent definitions, and `CLAUDE.md` / `AGENTS.md`. This is the **lead audience**. It does not
cover people who only *run* those artifacts in a pipeline (see
[`aud-platform-ci`](platform-ci.md)) or who own the evals standard as a distinct job (see
[`aud-eval-standard`](eval-standard.md)).

## Who they are

Engineers and technical writers who have accumulated agent instructions in a repository. That means
a handful of skills, a few subagent definitions, and a project rules file that has grown past the
point anyone rereads it. They range from a solo maintainer with three skills to a platform team
curating a shared library of fifty. The shape of the problem does not change with scale.

They are comfortable with Markdown, YAML frontmatter, Git, and a terminal. They have used an agent
CLI enough to have opinions about it. They are **not** eval practitioners: terms like "ensemble",
"consensus", "confidence zone", and "LLM-as-judge" are things they have heard, not things they have
configured.

## What they're trying to do

Find out whether the sessions their agents actually ran followed the instructions those agents were
given. And get told when a new instruction quietly stops being obeyed.

The job has a distinctive shape. They already have a corpus of instructions and a corpus of session
traces sitting on disk. They are not building an eval suite from nothing; they are trying to close
a loop between two things they already own.

## Defining pains

- **No feedback loop.** They wrote "always reproduce the bug with a failing test first" and have no
  idea whether it happened. Review is the only mechanism, and it does not scale past the first few
  sessions.
- **Silent drift.** An instruction that worked when written stops being followed, with no signal.
  The cause is a model change, a prompt edit, or an unrelated skill starting to shadow it.
- **Instructions that cannot fail.** Much of what they wrote is untestable prose. They do not
  necessarily know which half is which, and being told is more useful than being papered over.
- **Authoring cost.** Writing evals by hand for every artifact is the slow part. It is the
  step most likely to stop adoption cold after the first successful run.
- **Fear of a tool that edits their repo.** Instruction files are hand-tuned and load-bearing. A
  tool that rewrites them without a reviewable diff is not installable.

## Buying constraints

- Must work against sessions that **already happened**, with no instrumentation and no re-running work.
- Must not require an API key to try. The local agent CLI's own auth, or a mock provider, has to
  carry the first run.
- Must be reviewable, so everything written lands in a diff they approve.
- Node.js 24+ and a package install is the acceptable ceiling of setup.

## Qualified reader (for docs targeting)

- **Prerequisites they bring:** Markdown and YAML frontmatter; Git and reading a diff; running a
  CLI and reading its output. They also bring the concept of an agent skill, subagent, or project
  rules file, because they authored one.
- **Subject dependencies.** What a *trace* is and where it lives on disk must be established before
  anything else, because every other concept hangs off it. *Eval*, *grader*, and *finding*
  must be defined before the report output is shown. Judge internals, meaning ensemble, consensus
  and zones, are **not** a dependency for their main journey and must not gate it. They belong one
  link away.
