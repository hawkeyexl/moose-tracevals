---
status: accepted
date: 2026-08-29
decision-makers: [hawkeyexl, Claude]
---

# Grade each artifact against the window it governed

## Context and Problem Statement

Every eval graded the whole session regardless of where its artifact came from, so a skill's
`expect: not-used` on `Bash` failed on a shell command that ran *before* the skill was ever invoked,
and an agent definition's evals judged the parent transcript rather than the branch that agent
actually ran. Both are confident verdicts about turns the artifact had no part in — the failure mode
this tool exists to avoid, wearing a feature's clothes. ADR 01013 gave every record an ordinal and
ADR 01014 made a branch and its subtree a contiguous span, so the slice is now expressible: what
should the slice be, where should it come from, and what happens when it is empty?

## Decision Drivers

- The false failure is the visible half; the false **pass** is the dangerous half. An agent that
  never ran can be "proved" compliant by the parent session's work.
- `schemas/artifact-evals-1.0.0-proposal.1.json` is docmeta's, vendored byte-identical (ADR 01010),
  and `inlineEval` is `additionalProperties: false`. A declared `scope:` field is not available and
  would be an upstream proposal, not a local change.
- The existing invariant — an errored judge run may push an eval to human review, never to a silent
  pass — has to extend to this new way of having no evidence.
- `project-rules` genuinely does govern the whole session, so whatever rule is chosen must not
  change its verdicts at all.
- The judge is billed per token. Whatever the graders count, the digest should match, and a skill's
  window is usually a fraction of a session.
- Not everything an eval can measure is attributable to a slice.

## Considered Options

Where the window comes from:

- Derive it from the artifact's type
- Declare it per eval, as a new schema member
- Declare it per eval inside grader `options`, which the schema leaves open

What an empty window produces:

- `skipped`, with the reason stated
- `pass` — nothing was violated
- `fail` — the artifact was resolved and did nothing

Which graders are windowed:

- Every grader that counts events; `cost` and `json-output` stay session-level
- All of them, including `cost`

## Decision Outcome

Chosen option: **derive the window from the artifact type, skip an empty window with its reason, and
leave `cost` and `json-output` session-level.**

`windowFor(trace, plan)` in `src/graders/util.ts` returns the sliced `events`, `toolCalls`,
`fileAccesses`, `skillInvocations`, `userMessages`, `assistantTexts`, and `turnCount` for one plan's
artifact, by three rules:

| Artifact type | Window |
|---|---|
| `skill` | Each invocation of that skill, up to the next skill invocation — its own included, which simply reopens the window — or to the end of the session |
| `agent` | The branches whose `agentType` is that `subagent_type`, plus every branch nested inside them |
| `project-rules` | The whole session, handed back by reference |

**The type is the declaration.** A skill is a set of instructions that loads at an invocation and
stops mattering when the next one takes over; an agent definition is the brief for one branch;
`CLAUDE.md` is in force from the first turn. Nothing about that is a per-eval choice, so asking an
author to state it would be asking them to restate their artifact's own kind — and to get it wrong
occasionally, on a field the vendored schema cannot even carry. Deriving it also means every eval
already written is scoped correctly with no edit, including the implicit whole-artifact one.

**An empty window is `skipped`, never a verdict.** A skill that resolved but was never invoked, and
an agent that was spawned but recorded no turns, governed nothing; the reason names which case it
was. This is the errored-runs-never-pass invariant applied to a new way of having no evidence, and
it is the single way this change could have quietly weakened the tool: unwindowed,
`doc-writer-wrote-docs` **passes** on a file the parent session wrote, for an agent whose branch does
not exist. The engine applies the same gate to `ai` and `human` before dispatch, so an empty window
never reaches the judge — which would otherwise answer about the parent session — and never queues a
person to review nothing.

**Agent windows are exact, not merely contiguous.** ADR 01014 makes a sidecar branch's span exactly
its own records but an inline branch's span a bounding range that can enclose interleaved main-chain
turns, so within the span the branch-id set (the matching branches plus everything nested under
them, found by span containment) drops what does not belong. For a sidecar branch that filter
removes nothing, which is what keeps the two origins indistinguishable.

**A window's turns come from its own chain.** Prompts and assistant text are read from the chain the
window is anchored to — the main chain for a skill invoked there, the branch for an agent — so a
subagent spawned inside a window contributes tool calls and file accesses but not turns. Without
that, an agent's `turn-count` would count its children's briefs as its own.

**`cost` and `json-output` stay session-level, and say why in the source.** Every other deterministic
grader counts events, which are attributable to whichever artifact was governing when they happened.
Tokens are not: usage is reported per assistant message for the whole context, so charging a slice of
it to one skill would be an invented number. `json-output` asks about the session's final message,
which is the session's regardless of who declared the eval. Both therefore grade the session even
when the declaring artifact's window is empty — a session that blew its budget must still fail rather
than skip.

`src/judge/render.ts` renders the window for a scoped eval, prefixed with a `scope:` line naming it,
and `TraceJudge`'s second parameter became `(plan) => string` rather than a single pre-rendered
string. Keeping the whole batch inside one judge call is what keeps `maxCostUsd` a budget for the run
instead of a budget per group.

### Consequences

- Good, because the false failure the phase set out to fix is gone: two `Bash` calls in the fixture
  session, one before `fix-bug` was invoked, and `forbidden-tool` now reports `used 1 time(s)`.
- Good, because the false *pass* is gone too, which matters more: an agent with no branch can no
  longer be certified by work it did not do.
- Good, because judged skill evals get materially cheaper — the digest is the window, and its cache
  entries invalidate themselves since `sha256(renderedTrace)` is already a cache-key component
  (so no `PROMPT_VERSION` bump, for the third time and the same reason as ADR 01013 and 01014).
- Good, because no artifact had to change: existing evals are scoped by what they are attached to.
- Good, because `project-rules` verdicts are bit-for-bit what they were — the session window is the
  trace's own arrays by reference and the session digest is byte-identical.
- Bad, because a skipped eval is easy to skim past, and an artifact that is never exercised now
  reports a row of skips where it used to report passes. That is the honest reading, but a report
  full of skips looks like coverage until you read the reasons.
- Bad, because `skill-invoked` declared on a *skill* is now nearly vacuous: the window closes at the
  next skill invocation, so no other skill can appear inside it. `fill` already refuses to propose
  that combination, and the grader is documented as a project-rules tool, but nothing rejects it.
- Bad, because a skill invoked twice gets a window that is a union of disjoint spans, so "the
  window" is not always one range and a reader of a scoped digest sees a discontinuity.
- Neutral, because `src/fill/gate.ts`'s `ALLOWED_GRADERS` is unchanged. Its reason for excluding
  `turn-count` from skills — that a bound inside one artifact constrains the whole session — no
  longer holds now that `turn-count` is windowed, but widening the allowlist changes what `fill`
  writes and is its own decision. The stale half of that reasoning is corrected in the docs.
- Neutral, because a background subagent that ran concurrently with the parent is windowed where it
  was commissioned, not where its turns interleaved — inherited from ADR 01014's splice rule.

### Confirmation

`test/unit/graders/window.test.ts` pins each rule directly: the session window handed back whole, a
skill's window running to the next invocation and the last one running to the end, the union across
repeated invocations, an agent window excluding a main-chain turn that sits inside an inline
bounding range, a nested branch included in its parent's window and excluded from its own turns, and
all three empty-window reasons. It also parses `claude-session-sidecar.jsonl` and asserts the sidecar
half of the same code path — contiguous ordinals, the nested `Grep` in, the parent's `Bash` out.

Each windowed grader pins both directions in its own spec: an out-of-window event not counted, an
in-window one counted, and an empty window returning `skipped` rather than `pass` **or** `fail`.
`test/unit/graders/cost.test.ts` pins the exception — an empty window still fails a blown budget.
`test/unit/render.test.ts` pins that a scoped digest drops the parent's work, keeps the labelled
subagent blocks, is shorter than the whole trace, and that a project-rules digest is identical to an
unscoped one. `test/unit/engine.test.ts` pins that a passing judge never sees an empty window.

The fixture corpus proves both directions end to end, and the CI dogfood gate asserts them:
`test/fixtures/traces/claude-session.jsonl` now runs `Bash` on both sides of the `fix-bug`
invocation, spawns a `reviewer` agent with an inline branch that only reads while the parent session
edits, and still spawns `doc-writer` with no branch at all. The workflow asserts the *count* in
`forbidden-tool`'s message (not just the verdict), `reviewer`'s two evals passing, both `doc-writer`
evals skipped with an empty-window reason, and — in the mock-judge step — that the `ai` eval on
`doc-writer` carries no `consensus` object. Reverting the window in `tool-usage` and `file-access`
was checked against those assertions and fails all four, including `doc-writer-wrote-docs` flipping
to a silent `pass`.

## Pros and Cons of the Options

### Derive the window from the artifact type

- Good, because it needs no schema change, no upstream proposal, and no edit to any existing eval.
- Good, because the rule is the same for every eval on an artifact, so two evals in one file cannot
  disagree about what their file governed.
- Bad, because an author who wants one session-wide eval on a skill has no way to ask for it, and
  the honest workaround — move it to `CLAUDE.md` — moves it away from the instructions it is about.

### Declare a `scope` field per eval

- Good, because it is explicit, and the odd case above becomes expressible.
- Bad, because `inlineEval` is `additionalProperties: false` in a vendored copy of docmeta's draft;
  adding the member here would fork the vocabulary that ADR 01010 just stopped forking.
- Bad, because it is a question most authors would answer the same way every time, and the default
  would still have to be derived — so the derivation is needed either way.

### Declare scope inside grader `options`

- Good, because `options` is open by schema decree and needs no upstream change.
- Bad, because the window is a property of the artifact, not of the grader, so every grader would
  have to parse and validate the same option and could disagree.
- Bad, because it would not reach `ai` evals at all, which take no `options` — leaving the judge
  unscoped while the deterministic graders were scoped.

### An empty window passes

- Good, because nothing was observed to be violated.
- Bad, because it is the false pass this change exists to remove: an agent that never ran would be
  certified by the parent session's work, and the report would read as coverage.

### An empty window fails

- Good, because it is loud, and an artifact that resolved and never fired is often a real problem.
- Bad, because "this skill should have been invoked" is a different assertion from the one written,
  and answering it here would make every resolved-but-unused artifact fail every eval it declares.
  That question deserves its own grader, not a side effect of this one.

### Window every grader, `cost` included

- Good, because one rule with no exceptions is easier to state.
- Bad, because a per-slice token count does not exist to be computed; usage is reported for the whole
  context, so any split would be invented and would silently under-report.
- Bad, because a budget eval that skips on an empty window is a budget that stops applying exactly
  when a session went somewhere unexpected.
