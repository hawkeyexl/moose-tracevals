---
status: "accepted"
date: 2026-09-01
decision-makers: [hawkeyexl]
---

# A `tool-order` grader

## Context and Problem Statement

`tool-usage` answers "did this tool get used, and how often". A large share of what an instruction
artifact actually asks for is about **sequence**: read before you write, run the tests after you
edit, look at the config before changing it. None of that was expressible.

The gap is not academic. A session that wrote a file first and read it afterwards — to see what it
had just done — satisfies every count `tool-usage` can express, and violates the instruction the
artifact gave it.

## Decision Drivers

- Adherence claims about order are common in real skills and agent definitions.
- `claude plugin eval` carries `tool_order` for the same reason, with a `{tool, input_match}` shape
  on each end.
- "Read something, then write to `src/`" is a different claim from "read anything, then write
  anything", and only the first catches a session that read an unrelated file.

## Considered Options

- Express order through `regex` over the rendered trace.
- A `tool-order` grader with `before` / `after`.
- Extend `tool-usage` with an `after` option.

## Decision Outcome

Chosen option: **a `tool-order` grader**, with `before`, `after`, optional `beforeInputMatch` /
`afterInputMatch`, and `includeSidechains`.

The semantics are the **weakest useful** ones: *some* occurrence of `before` precedes *some*
occurrence of `after`. Requiring every `after` to be preceded by its own `before` would fail an
otherwise adherent session that did the right thing once and then repeated the second half.

Neither tool appearing is a **pass**: an ordering claim with nothing to bite on has not been
violated. A suite that wants the calls to happen at all says so with `tool-usage`, which is the
grader for that question.

### Consequences

- Good, because the most common shape of adherence claim becomes expressible.
- Good, because `input_match` narrows both ends, so "read the file you are about to write" is a
  claim you can actually make.
- Bad, because "weakest useful" needs explaining: an author expecting strict pairwise ordering will
  read a pass where they wanted a fail. The alternative fails honest sessions, which is worse.
- Neutral, because an uncompilable `input_match` is a grader error rather than a session failure —
  blaming the session for the eval's own bug is how a team learns to ignore the report.

### Confirmation

`test/unit/graders/tool-order.test.ts` covers ordered, reversed, each half missing, neither
present, input-narrowed, the repeated-`after` case, sidechain scoping, and the uncompilable
pattern.
