# moose-tracevals

Adherence evals for AI agent session traces. Point moose-tracevals at a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session, and it deterministically looks up every skill, agent definition, and project-rules file the session used, then evaluates whether the session **adhered to the instructions in those artifacts** — with deterministic graders where possible and an ensemble LLM judge everywhere else.

Built on two sibling libraries: [@hawkeyexl/inference](https://github.com/hawkeyexl/inference) (providers, ensemble consensus, confidence zones, response caching) and [docmeta](https://github.com/hawkeyexl/docmeta) (frontmatter extraction, JSON-Schema validation).

## Install

Requires Node.js 24+.

```bash
npm install --save-dev moose-tracevals
```

> **The package and the binary are both named `moose-tracevals`.** `npx` resolves by *package* name,
> so `npx moose-tracevals` reaches this tool either way — from `node_modules/.bin` when it is a local
> dependency, and straight from the registry when nothing is installed.

## Quick start

Evaluate a session that already happened. No instrumentation, no re-running work, no API key:

```bash
npx moose-tracevals list --all-projects --limit 5
npx moose-tracevals run <trace-file> --deterministic-only
```

```
  PASS   fix-bug › used-read
  FAIL   fix-bug › forbidden-tool
         [error] tool Bash was used 1 time(s) but must not be
  SKIP   CLAUDE.md › adheres-to-artifact (implicit)
         llm evals skipped (deterministic-only run)

7 eval(s): 1 pass, 1 fail, 0 error, 0 needs-review, 5 skipped
```

The skill said *"this skill is edit-only"*. The session ran a shell command.

Exit codes: `0` all passed or skipped · `1` a check failed, errored, or needs review · `2` moose-tracevals itself could not run.

## How it works

```
trace (~/.claude/projects/<project>/*.jsonl, or a file you name)
  |
  v
parse ──> resolve artifacts used ──> extract criteria ──> plan evals
              (skills, agents,          (metadata.evals
               CLAUDE.md/AGENTS.md)      frontmatter)
  |
  v
deterministic graders ──> ensemble LLM judge (N runs, consensus, zones)
  |
  v
report (human / json / markdown) + artifact coverage + history
```

- **Deterministic lookup.** Which skills, agents, and rules a session used is read from the trace plus the filesystem — no LLM guessing. Unresolved references degrade to warnings and a coverage table, never a crash.
- **Declared criteria.** Artifacts can declare checks in a `metadata.evals` frontmatter block, validated against the published [artifact-evals schema](schemas/artifact-evals-0.2.json). A criterion is either a string (LLM-judged) or an object selecting a deterministic grader.
- **Implicit eval.** Artifacts with no declared criteria still get one judged eval — *"the session adhered to the instructions in this artifact"* — so every used artifact is evaluated with zero configuration.
- **Trustworthy judging.** N independent runs at temperature 0, consensus where errored runs can never produce a silent pass, and confidence zones that route anything non-unanimous to `needs-review`.
- **Read-only.** `run` never modifies a trace or the artifacts it evaluates. `fill` is the one write path, and it never writes project rules.

## Documentation

Full guides, recipes, and reference live on the documentation site:

**https://hawkeyexl.github.io/moose-tracevals/**

| Track | What it covers |
|-------|----------------|
| [Get started](https://hawkeyexl.github.io/moose-tracevals/get-started/) | Install, find a session, and read your first result. |
| [Declare what to check](https://hawkeyexl.github.io/moose-tracevals/declare/) | Turn an instruction into a criterion; propose criteria across a project with `fill`. |
| [Run it in CI](https://hawkeyexl.github.io/moose-tracevals/ci/) | An offline GitHub Actions recipe, the exit-code contract, and report formats. |
| [Trust the judge](https://hawkeyexl.github.io/moose-tracevals/judge/) | Ensembles, consensus, and confidence zones — with the arithmetic. |
| [Read a failing eval](https://hawkeyexl.github.io/moose-tracevals/triage/) | One page: what failed, whether the verdict holds, and what to do. |
| [Reference](https://hawkeyexl.github.io/moose-tracevals/reference/) | Every CLI flag, config key, grader option, criteria field, and report field. |

## Development

See [CLAUDE.md](CLAUDE.md) for the working agreements (TDD, hermetic offline tests, ADRs, Conventional Commits) and [adrs/](adrs/) for the decisions behind the architecture. The documentation's audience, persona, journey, and IA definitions live in [docs/content_strategy/](docs/content_strategy/).

```bash
npm test              # offline suite (mocked judge, fixture traces)
npm run typecheck
npm run build
MOOSE_TRACEVALS_LIVE=1 npm test   # adds the live judge smoke test

npm run docs:validate # dogfood docmeta against the docs' own frontmatter
npm run docs:build    # build the Starlight site
npm run docs:dev      # serve it locally
```

## License

MIT
