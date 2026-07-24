# agentevals

Adherence evals for AI agent session traces. Point agentevals at a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session, and it deterministically looks up every skill, agent definition, and project-rules file the session used, then evaluates whether the session **adhered to the instructions in those artifacts** — with deterministic graders where possible and an ensemble LLM judge everywhere else.

Built on two sibling tools: [docevals](https://github.com/hawkeyexl/docevals) (judge providers, ensemble consensus, confidence zones) and [docmeta](https://github.com/hawkeyexl/docmeta) (frontmatter extraction, JSON-Schema validation).

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

- **Deterministic lookup.** Skill invocations (`Skill` tool calls and `/command` injections), agent spawns (`subagent_type`), and project rules (`CLAUDE.md`/`AGENTS.md` from the session's cwd up to the project root) are resolved from the trace plus the filesystem — no LLM guessing. Unresolved references degrade to warnings and a coverage table, never a crash.
- **Declared criteria.** Artifacts can declare criteria in a `metadata.evals` frontmatter block (validated against the published [artifact-evals schema](schemas/artifact-evals-0.1.json)). A criterion is either a string (LLM-judged assertion) or an object selecting a deterministic grader.
- **Implicit eval.** Artifacts with no declared criteria still get one judged eval: *"the session adhered to the instructions in this artifact"* — so every used artifact is evaluated with zero configuration.
- **Trustworthy judging.** N independent runs at temperature 0, consensus where errored runs can never produce a silent pass, and confidence zones that route anything non-unanimous to `needs-review`.

## Quick start

Requires Node.js 24+ and (until docevals ships to npm) a sibling checkout of [docevals](https://github.com/hawkeyexl/docevals) next to this repo.

```bash
npm install
npm run build
```

Evaluate a past session interactively (TTY picker):

```bash
node dist/cli.js
```

Or name a trace and a project:

```bash
node dist/cli.js run ~/.claude/projects/<project-slug>/<session>.jsonl
```

List what's evaluable:

```bash
node dist/cli.js list --all-projects --limit 10
```

Deterministic-only (no LLM calls, CI-friendly):

```bash
node dist/cli.js run <trace> --deterministic-only --format json
```

Full pipeline with zero network (mock judge):

```bash
node dist/cli.js run <trace> --provider mock
```

## Declaring criteria

Add a `metadata.evals` block to a skill, agent, or rules file:

```yaml
---
name: fix-bug
description: Fix a reported bug, reproducing it with a failing test first.
metadata:
  evals:
    criteria:
      # String shorthand: judged by the LLM ensemble.
      - Reproduce the bug with a failing test before applying the fix.
      # Object form: deterministic grader.
      - name: forbidden-tool
        assertion: The session never ran shell commands; this skill is edit-only.
        grader: tool-usage
        options: { tool: Bash, expect: not-used }
---
```

### Deterministic grader kinds

| Kind | Asserts |
|---|---|
| `tool-usage` | a tool was used / not used / within count bounds (`tool`, `expect`, `min`, `max`, `includeSidechains`) |
| `skill-invoked` | a skill was / wasn't invoked (`skill`, `expect`) |
| `file-access` | a file was / wasn't read, written, or edited (`path` suffix, `op`, `expect`) |
| `turn-count` | conversation stayed within turn bounds (`min`, `max`) |
| `cost` | session stayed within budget (`maxUsd`, `maxTokens`); skips with a reason when the trace has no usage data |
| `regex` | a pattern does / doesn't appear in session text (`pattern`, `flags`, `on`, `expect`) |
| `json-output` | the final assistant message validates against a JSON Schema (`schema`) |

Severities: `error` findings fail the eval; `warning` and `info` report but pass.

## Configuration

`agentevals.config.yaml` (all keys optional; CLI flags override, never bypass):

```yaml
provider:                 # passed through to docevals' provider factory
  default: claude-cli     # or anthropic / openai
judge:
  ensembleRuns: 3
  temperature: 0
  zones: { autoPass: 0.8, autoFail: 0.8 }
  cacheDir: .agentevals/cache
  maxCostUsd: 2.5
render:
  maxBlockChars: 2000
  maxTotalChars: 150000
history:
  file: .agentevals/history.jsonl
failOnNeedsReview: true
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | every eval passed (or was skipped) |
| `1` | any fail or error (and `needs-review` unless `failOnNeedsReview: false`) |
| `2` | operational error (bad usage, unreadable trace, unknown format) |

## Development

See [CLAUDE.md](CLAUDE.md) for the working agreements (TDD, hermetic offline tests, ADRs, Conventional Commits) and [adrs/](adrs/) for the decisions behind the architecture.

```bash
npm test              # offline suite (mocked judge, fixture traces)
npm run typecheck
npm run build
AGENTEVALS_LIVE=1 npm test   # adds the live judge smoke test
```

## License

MIT
