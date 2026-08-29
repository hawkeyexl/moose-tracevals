---
status: "accepted"
date: 2026-08-29
decision-makers: [hawkeyexl, Claude]
consulted: []
informed: []
---

# Evaluate many traces in one run, and report rates rather than a verdict

## Context and Problem Statement

`run` took exactly one trace. But adherence is a **rate**, not a single verdict — "is this skill
actually working?" is a question about many sessions, and one session cannot answer it. The only
cross-run machinery that existed, [src/history.ts](../src/history.ts), compares a trace to its own
previous run, so it moves only when the *artifacts* change; it says nothing about how often a check
holds across a corpus. The tool could not ask the question it exists to answer.

The mechanics were nearly there. `runRun` ([src/commands/run.ts](../src/commands/run.ts)) was
already a clean seam, `discoverTraces` ([src/trace/discover.ts](../src/trace/discover.ts)) already
enumerated the session store for `list`, and ADR 01015 had just made each verdict correct enough
that averaging them means something. What was missing was a loop, an aggregate contract, and one
piece of care about money.

## Decision Drivers

- A batch must not cost N times the configured judge budget. `maxCostUsd` was enforced inside one
  judge instance, and a naive loop that built a judge per trace would have made it a cap on the
  largest trace instead of on the run — a real money bug, silent by construction.
- Single-trace output is depended on by the CI dogfood assertions, the Doc Detective inline tests,
  and every example in these docs. It has to stay byte-identical.
- A downstream consumer piping `--format json` needs a shape it can predict *before* running the
  command, not one that depends on how many files happened to match.
- One unreadable file in a corpus of fifty must not cost the other forty-nine their verdicts
  (ADR 01003's graceful degradation, applied to a new way of failing).
- Two runs over the same corpus have to produce comparable reports, or a "rate" is not a
  measurement.
- A gate that goes green because its selector matched nothing is the false pass this tool exists to
  prevent.
- Grader plugins import once per process (ADR 01017), so per-trace loading would attach a plugin's
  warnings to the first report and to no other.

## Considered Options

How the batch is driven:

- Wrap `runRun`'s seams; keep `runEvals` and `runRun` single-trace
- Widen `runEvals` to take a list of traces
- A separate `moose-tracevals batch` command

Where the judge budget lives:

- On the judge **instance**, shared across every trace in the batch
- On each call of the judge, as it was
- A separate batch-level accountant wrapping the judge

What decides the report shape:

- How the traces were **selected** — one named trace is a `RunReport`, anything else a `BatchReport`
- How many traces came back
- Always a `BatchReport`, with a single-trace batch as the degenerate case

## Decision Outcome

Chosen option: **wrap `runRun`'s seams, put the budget on the judge instance, and let selection
decide the shape.**

`run` accepts `[traces...]` and three selectors — `--all-projects`, `--since <duration>`,
`--limit <n>` — that reuse `discoverTraces`. `runEvals` stays `tracePath: string` and `runRun` stays
one trace; [src/commands/batch.ts](../src/commands/batch.ts) is the loop.

### The budget belongs to the judge instance

This is the whole reason a wrapper was not enough on its own. `makeTraceJudge` declared
`let spentUsd = 0` **inside** the function it returned, so the counter reset on every call. That was
invisible while every run called the judge exactly once. Call it once per trace and `maxCostUsd`
stops being a budget: a fifty-trace batch bills fifty times the configured ceiling, and every
report claims to have respected it.

Hoisting the counter into `makeTraceJudge`'s own closure fixes it in one line and changes nothing
for a single-trace run, which still calls the judge once. `prepareRun` then builds the judge, the
resolved config, and the grader plugins **once** for the batch, and every trace is charged against
the same running total.

An exhausted budget reports `skipped` with the reason naming it —
`judge cost budget exhausted ($1)` — exactly as the single-trace path already did. It never becomes
a `pass`, and it never becomes an absent row: the aggregate carries `skipReasons` per row so the
difference between "this held every time" and "this was never checked" survives into the report.
That is the errored-runs-never-pass invariant applied to a batch.

Traces are evaluated **sequentially** for the same reason. The budget is a running total, so which
traces get judged before it runs out has to be reproducible; concurrency would make that a race, and
a report that differs run to run is not a measurement. The cost is wall-clock time, which is the
right thing to trade for a defensible number.

### Selection decides the shape, not the count

| Invocation | Report |
|---|---|
| `run <trace>` | `RunReport` — byte-identical to before, in all three formats |
| `run <a> <b> …` | `BatchReport` |
| `run --all-projects` / `--since` / `--limit` | `BatchReport`, **even when it matches exactly one trace** |
| `run` with no argument on a TTY | the picker, then `RunReport` |

Keying on the count instead would mean `--since 7d --format json` emitted one shape in a busy week
and a different one in a quiet week, and the consumer that broke would break in production rather
than in review. Selection is knowable from argv, so a script can be written against it.

Naming traces *and* passing a selector is an operational error rather than a precedence rule.
Either resolution silently discards something the caller asked for — a `--limit 5` that did
nothing, or named traces quietly dropped — and both read as the command having worked.

### A selector that matches nothing is exit 2

Not exit 0. An empty corpus and a clean corpus are indistinguishable in every downstream consumer:
same green check, same `0 fail`. `--since 7d` in a quiet week failing loudly is an inconvenience;
`--since 7d` going green because the session store moved is a gate that stopped gating and told
nobody. The message names the selector that matched nothing and points at `list`. Naming traces
explicitly is the escape hatch.

### A trace that cannot be parsed is an entry, not an abort

It becomes a `BatchTraceEntry` with `error` set, counts as `tracesErrored`, and forces exit 1. The
other traces keep their verdicts. This is ADR 01003's degradation rule — unresolved or unreadable
input warns rather than crashing — extended to the one place where an abort would destroy work
already done.

### Rates exclude skipped results from the denominator

`passRate = pass / (pass + fail + error + needsReview)`, and `null` when nothing was graded. A
skipped eval is not evidence in either direction, so folding it in would let an artifact nobody
invoked report a perfect score — which is precisely the false pass ADR 01015 spent a phase
eliminating. `null` renders as `—`, never as `0%`.

`needs-review` **is** in the denominator and not in the numerator. It fails the run by default
(`failOnNeedsReview`), so counting it as a pass would contradict the exit-code contract. The
reporters name the review traces alongside the failing ones so a `0%` row is never unexplained.

### Rows are keyed by artifact type and name, not by path

Two projects declaring the same skill aggregate into **one** rate, which is the fleet question this
report exists to answer. The distinct paths a row was built from are kept in `artifacts`, so a
reader can see when a row spans more than one project. Keying by path would have made
`--all-projects` produce a row per project and answer nothing.

Ordering is a byte comparison on that key, not a locale collation, so the ubuntu and windows CI legs
agree. Named traces keep argv order; discovered traces keep `discoverTraces`' newest-first order.
Both are stable for a fixed corpus, which is what makes two runs comparable.

### `--history` appends one entry per trace

Not one per batch. A `HistoryEntry` is keyed by `sessionId ?? traceFile` and `compareToLast` looks
for the most recent earlier entry *for the same session* — so per-trace entries keep working with
the file that already exists, and a trace evaluated once alone and once in a batch compares against
itself either way. A batch-level entry would have had no stable key at all, since the corpus can
change between runs. The per-trace comparisons are returned on `BatchCommandResult.comparisons`;
the aggregate rendering does not interleave them, because a rate table and a regression log answer
different questions.

### Consequences

- Good, because "is this skill working?" is now answerable: a per-eval pass rate across N sessions,
  with the outlier traces named.
- Good, because the money bug is fixed at its root rather than worked around at the call site. Any
  future caller that invokes one judge repeatedly inherits the correct behavior.
- Good, because single-trace output did not move — verified format by format against the
  pre-change build, not merely asserted.
- Good, because `runEvals` and `runRun` kept their contracts, so every library consumer and every
  documented command is untouched.
- Bad, because sequential evaluation makes a large batch slow. Concurrency would help, and it is
  deliberately not taken: it would make the budget cut-off nondeterministic.
- Bad, because two report shapes now exist behind one command. Mitigated by making the selection
  rule, not the result count, decide which one — but a consumer still has to know the rule.
- Neutral, because `--all-projects` and `--limit` mean on `run` exactly what they already mean on
  `list`, and `--project` keeps its single meaning of "this project" for both discovery scope and
  artifact lookup.

### Confirmation

- [test/unit/judge.test.ts](../test/unit/judge.test.ts) — "spends one budget across successive
  calls, not one per call". A priced `MockProvider` with explicit usage, a `$1` cap, and two calls:
  the first costs exactly `$1`, the second is skipped for budget. This is the regression test for
  the money bug, and it fails against the pre-change implementation.
- [test/unit/batch.test.ts](../test/unit/batch.test.ts) — the same assertion one level up, through
  the real `makeTraceJudge` over two real traces, plus degradation of an unparseable file, the
  empty-selector refusal, the named-plus-selector refusal, deterministic ordering, `parseSince` in
  both directions, and one history entry per trace.
- [test/unit/reporters.test.ts](../test/unit/reporters.test.ts) — the aggregate rendering in all
  three formats: rates, named outliers, a `—` for an ungraded row with its skip reason intact, and
  pipe escaping so a row pasted into a PR comment keeps its column count.
- [test/integration/cli.test.ts](../test/integration/cli.test.ts) — the selection rule through the
  built binary: one named trace yields a `RunReport` with no `traces` key, two yield a
  `BatchReport`, and a selector matching one trace still yields a `BatchReport`.
- [ci.yml](../.github/workflows/ci.yml)'s batch dogfood runs the built CLI over the fixture corpus
  on both OS legs — the aggregate shape, a rate computed from a corpus engineered to fail on one
  trace and pass on the other, an unreadable file degrading beside good ones, and
  `--max-cost-usd 0` reaching the shared judge.

## Pros and Cons of the Options

### Wrap `runRun`'s seams (chosen)

- Good, because `runEvals` and `runRun` keep their contracts and their tests.
- Good, because the three things that must be built once — config, plugins, judge — are named
  explicitly by `prepareRun` rather than being per-trace by accident.
- Bad, because `runRun` had to be split into `prepareRun` / `runOne` / `runRun`, so there are three
  entry points where there was one.

### Widen `runEvals` to take a list

- Good, because there would be one code path instead of two.
- Bad, because `RunReport` is about one trace throughout — `trace`, `coverage`, `turnCount`. Making
  it plural would break every consumer and every reporter to serve a caller that does not need it.
- Bad, because the engine is the wrong place for trace *selection*, which is a CLI concern.

### A separate `batch` command

- Good, because the two report shapes would be behind two command names, needing no rule.
- Bad, because it duplicates every flag `run` has, and the two would drift.
- Bad, because "evaluate these traces" is the same operation whatever the count; splitting it asks
  the user to know which command to reach for before they know how many traces they have.

### Budget per judge call, as it was

- Good, because it is the current code.
- Bad, because it is the money bug. A fifty-trace batch bills fifty times the cap while every
  report claims otherwise — the worst combination of wrong and quiet.

### A batch-level accountant wrapping the judge

- Good, because `makeTraceJudge` would not change.
- Bad, because there would then be two places that know about `maxCostUsd`, and the wrapper could
  only refuse whole traces — it cannot skip the eval that would cross the line, so it either
  overshoots or stops early.
- Bad, because a library consumer calling `makeTraceJudge` directly in a loop would still hit the
  original bug. Fixing the primitive fixes every caller.

### Report shape from the result count

- Good, because a one-trace `--since` would print the familiar single-trace report.
- Bad, because the JSON shape would depend on the contents of the session store, so a consumer
  cannot be written against it — the failure lands in production, not in review.
