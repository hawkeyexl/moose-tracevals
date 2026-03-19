# agent-evals

Evaluation framework for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) agents, skills, and project rules. Define eval specs as YAML or frontmatter, run trials via `claude -p`, and grade results with deterministic code checks and LLM-as-judge.

## How it works

```
eval spec (YAML/frontmatter)
  |
  v
discover --> parse --> extract criteria from artifact
  |
  v
execute trial (claude -p)
  |
  v
grade (code graders + LLM judge)
  |
  v
report (JSON, Markdown, CLI) + history tracking
```

agent-evals has three modes:

- **Spec mode** — discover eval specs, run trials against Claude, grade results
- **Transcript mode** — evaluate a saved `.jsonl` transcript against its referenced artifacts
- **Prompt mode** — run a prompt via `claude -p`, then evaluate the resulting session

## Quick start

```bash
npm install
npm run build

# Discover and run evals in the current directory
agent-evals

# Run evals from a specific path
agent-evals ./skills/my-skill/

# Dry-run: validate specs without executing
agent-evals --dry-run

# Evaluate an existing transcript
agent-evals --transcript ./session.jsonl

# Run a prompt and evaluate the result
agent-evals -p "Generate a test spec for my docs"

# View history trend
agent-evals --history
```

## Writing eval specs

### Standalone YAML

Place `.yaml` files in an `evals/` directory:

```yaml
name: my-skill-eval
description: Verify my-skill handles common cases
type: capability
artifact:
  type: skill
  path: ../skills/my-skill/SKILL.md

trials: 3
model: claude-sonnet-4-6
judge_model: claude-sonnet-4-6

cases:
  - name: triggers-on-relevant-prompt
    prompt: "Run my-skill on the project"
    criteria:
      - name: skill-triggered
        type: code
        grader: trigger-check
        config:
          skill_name: my-skill
          should_trigger: true

      - name: output-valid
        type: code
        grader: regex-match
        config:
          pattern: "completed"
          expect: present

      - name: quality
        type: llm
        grader: output-quality
        config:
          rubric: "Output should be complete and well-formatted."
```

### Frontmatter in artifact files

Embed evals directly in skill/agent `.md` files:

```markdown
---
name: my-skill
description: A skill that does things
metadata:
  evals:
    - name: basic-trigger
      type: capability
      trials: 2
      cases:
        - name: triggers-correctly
          prompt: "Run my-skill"
          criteria:
            - name: triggered
              type: code
              grader: trigger-check
              config:
                skill_name: my-skill
                should_trigger: true
---

# My Skill

## Entry Criteria
- Input file exists

## Exit Criteria
- Output file created
```

When evals are in frontmatter, the artifact type is inferred from the file path (`/skills/` -> skill, `/agents/` -> agent, `AGENTS.md` -> project-rules).

## Graders

### Code graders (deterministic)

| Grader | What it checks |
|--------|---------------|
| `trigger-check` | Whether a skill/agent was invoked (or not) |
| `diff-check` | File changes match expectations (unchanged/changed/created/deleted) |
| `regex-match` | Pattern present or absent in transcript or files |
| `exit-code` | Command exited with expected code |
| `file-exists` | Expected files exist (or don't) after trial |
| `json-schema` | Output validates against a JSON schema (via AJV) |
| `tool-usage` | Expected tools were used, forbidden tools weren't |
| `turn-count` | Trial completed within turn limits |
| `cost-check` | Trial stayed within budget |

### LLM graders (via Claude as judge)

| Grader | What it checks |
|--------|---------------|
| `criteria-adherence` | Entry/exit criteria followed |
| `constraint-check` | Constraints not violated |
| `escalation-check` | Escalation rules followed when needed |
| `rule-adherence` | Project rules and conventions followed |
| `behavior-check` | Expected behavior exhibited |
| `output-quality` | Output is complete, correct, well-formatted |
| `spec-requirements` | Spec requirements fulfilled |
| `spec-acceptance` | Acceptance criteria met |
| `faithfulness-check` | Claims faithful to provided sources |

### Composite graders

| Grader | Logic |
|--------|-------|
| `all-of` | All sub-criteria must pass |
| `any-of` | At least one sub-criterion must pass |
| `weighted` | Weighted average of sub-criteria scores >= 0.7 |

```yaml
criteria:
  - name: combined-check
    type: composite
    grader: weighted
    sub_criteria:
      - name: correct-output
        type: code
        grader: regex-match
        weight: 3
        config:
          pattern: "expected-value"
      - name: efficient
        type: code
        grader: turn-count
        weight: 1
        config:
          max_turns: 10
```

## Auto-extracted criteria

When using transcript or prompt mode, agent-evals automatically extracts testable criteria from artifact files based on their type:

| Artifact type | Extracted sections |
|--------------|-------------------|
| **skill** | Entry criteria, exit criteria, process steps, trigger description |
| **agent** | Constraints, quality criteria, escalation rules, capabilities, tools |
| **project-rules** | Rules, gates, conventions (by heading context) |
| **spec** | Requirements, acceptance criteria, uncertainty markers |

Use `--detect-criteria` to merge auto-extracted criteria into artifact frontmatter.

## Configuration

Create `.agent-evals.yaml` in your project root:

```yaml
judge_model: claude-sonnet-4-6
output_dir: ./eval-results
verbose: false
report: json          # json | markdown | both
pass_threshold: 0.7
```

The config file is searched from the current directory up to the git root.

## CLI reference

```
agent-evals [path]               Discover & run spec-based evals
agent-evals --transcript <file>  Evaluate a saved transcript
agent-evals -p <prompt>          Run prompt via Claude Code, then evaluate

Spec mode:
  [path]                    Directory or spec file (default: .)
  -t, --trials <n>          Override trial count
  -m, --model <id>          Override model under test
  -f, --filter <pattern>    Filter evals by name
      --dry-run             Parse and validate without executing
  -b, --bail                Stop on first failure
  -c, --concurrency <n>     Parallel eval specs (default: 1)

Transcript mode:
      --transcript <file>   Path to JSONL transcript file
  -p, --prompt <string>     Prompt to run via claude CLI
      --detect-criteria     Extract & merge criteria into frontmatter

Shared:
  -j, --judge-model <id>    Judge model (default: claude-sonnet-4-6)
  -o, --output <dir>        Output directory (default: ./eval-results)
  -r, --report              Generate report
      --report-format <fmt> json | markdown | both
      --history             Show trend across stored runs
  -v, --verbose             Detailed output
```

## Reports and history

Each run produces:

- **JSON report** (`eval-results/report.json`) — structured results for programmatic use
- **Markdown report** (`eval-results/report.md`) — human-readable summary with tables
- **History** (`eval-results/history.jsonl`) — append-only log of all runs

Use `--history` to print a trend table across runs. The framework automatically compares each run against the previous one, flagging regressions, improvements, new criteria, and removed criteria.

## Testing

```bash
# Unit + integration tests (132 tests, no Claude API calls)
npm test

# Live end-to-end test (calls Claude API, ~$0.05-0.15)
npm run test:live
```

The `test:live` script runs the full pipeline with real `claude -p` calls and prints verbose output at every step. It creates a temporary workspace, runs a trial, grades with both code and LLM graders, generates reports, and tracks history.

## Project structure

```
src/
  cli.ts                 CLI entry point
  index.ts               Public API, mode routing
  types.ts               Core type definitions
  config.ts              .agent-evals.yaml loader
  discovery.ts           Find eval specs in a directory tree
  parser.ts              Parse YAML/frontmatter eval specs
  extractor.ts           Auto-extract criteria from artifacts
  runner.ts              Execute trials via claude -p
  prompt-runner.ts       Spawn claude CLI processes
  transcript-parser.ts   Parse JSONL transcripts
  judge.ts               LLM-as-judge via claude CLI
  criteria-assembler.ts  Assemble criteria from artifacts
  artifact-resolver.ts   Resolve skill/agent references
  history.ts             Result history and comparison
  graders/
    index.ts             Grader registry (21 graders)
    composite.ts         all-of, any-of, weighted
    code/                9 deterministic graders
  reporter/
    cli.ts               Stdout reports
    json.ts              JSON file reports
    markdown.ts          Markdown file reports
tests/
  helpers.ts             Shared test utilities
  e2e.test.ts            End-to-end tests with real transcript fixture
  live-e2e.ts            Live integration test (calls Claude API)
  *.test.ts              Unit tests for each module
  graders/               Grader-specific tests
  reporter/              Reporter tests
  fixtures/              Test fixtures including real transcripts
  evals/                 Sample eval specs
```

## Requirements

- Node.js >= 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
