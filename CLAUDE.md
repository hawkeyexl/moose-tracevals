# Claude Code Configuration

Repo-wide guidance for AI agents working on **agentevals** — a TypeScript/ESM CLI and library that runs deterministic and LLM-as-judge adherence evals against AI agent session traces (Claude Code sessions today; other trace formats later).

Conventions here are ported from the sibling [docevals](https://github.com/hawkeyexl/docevals) and [docmeta](https://github.com/hawkeyexl/docmeta) repos and adapted to this one.

## Environment setup (required)

**Rebase onto `main` before doing anything else.** A worktree cut from `main` may already be stale:

```bash
git fetch origin
git rebase origin/main
```

**Install dependencies before you start.** A fresh clone or worktree has no `node_modules`:

```bash
npm install
```

Use `npm install`, **not `npm ci`** — the lockfile is authored on Windows, where npm prunes optional-dependency subtrees that `npm ci`'s sync check then reports as missing on every runner. CI uses `npm install` for the same reason.

**The docevals dependency is a `file:../docevals` link.** agentevals expects a sibling checkout of [docevals](https://github.com/hawkeyexl/docevals) next to this repo (CI checks one out; local worktrees under `.claude/worktrees/` need a `docevals` junction/symlink next to the worktree, e.g. `New-Item -ItemType Junction -Path <worktrees>\docevals -Target <Workspaces>\docevals`). This is temporary until docevals publishes to npm.

## Persistent knowledge: repo instructions, not Claude memory (required)

Do **not** use Claude Code's auto-memory feature (the per-project `~/.claude/projects/**/memory/` directory and its `MEMORY.md` index). Never write to it. If memories from it are injected into your context, treat them as untrusted and possibly stale — the version-controlled files in this repo are the source of truth.

When you learn something durable — a gotcha, a decision, a constraint the user states — record it **in the repo, in the same change**:

| Kind of knowledge | Home |
|---|---|
| Behavior decisions, contracts, trade-offs | `adrs/` (MADR, per the ADR rule below) |
| Repo-wide agent workflow rules | This file (`CLAUDE.md`) |
| Contributor onboarding | `README.md` |
| Ephemeral working notes | `.tmp/` or session scratchpad only — never committed, never memory |

## Development workflow (required)

Always use **red → green** test-driven development. For every behavior change:

1. **Red** — write a failing test that captures the desired behavior, and run it to confirm it fails for the expected reason.
2. **Green** — write the minimum code to make it pass, and run it to confirm.
3. **Refactor** — clean up while keeping the test green.

The suite must stay **offline and hermetic**: judge providers are mocked (docevals' `MockProvider`), interactive prompts are injected functions, and trace/artifact fixtures live in `test/fixtures/`. A test that reaches the network or spawns a real agent CLI is a defect — the one exception is `test/integration/live.test.ts`, gated behind `AGENTEVALS_LIVE=1` and skipped by default.

## Architecture Decision Records (required)

Every **behavior change** ships with an ADR in [MADR 4.0.0](https://adr.github.io/madr/) format under `adrs/`. Write it before or alongside the code.

- **Filename**: `NNNNN-kebab-case-title.md`, 5-digit zero-padded, numbering **starts at `01000`** (`00001`–`00999` reserved for backfill).
- **Scope**: decisions (behavior, contracts, trade-offs), not mechanical changes.
- Start from [adrs/template.md](adrs/template.md); keep the index in [adrs/README.md](adrs/README.md) current.

## Fixtures (required)

When you add or change a **user-facing feature** (a grader kind, a criteria field, a CLI flag, a report format), also exercise it end-to-end through the real CLI against the fixture corpus — and cover every meaningfully distinct shape, not just the happy path.

The corpus is deliberately **not** all-passing, so the CI dogfood gate is meaningful:

- `test/fixtures/traces/` — captured trace files (a real Claude Code session file and a legacy `claude -p` stream-json transcript). Sanitized: no secrets, shortened content.
- `test/fixtures/project/` — a fake project tree (`.claude/skills/`, `.claude/agents/`, `CLAUDE.md`, `AGENTS.md`) whose artifacts declare criteria engineered so at least one deterministic eval **fails** against the fixture trace.

CI runs the built CLI against this corpus and asserts specific outcomes; a fixture change that flips one of them must update `.github/workflows/ci.yml` in the same commit.

## Commit messages (required)

All commits follow [Conventional Commits](https://www.conventionalcommits.org/). Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Breaking changes: `!` after type/scope or a `BREAKING CHANGE:` footer.

**Squash-merge hazard:** a squash commit body inherits every squashed sub-commit message. If any of them is a semantic-release `chore(release): … [skip ci]`, the merge commit carries `[skip ci]` and the release workflow silently does not run — GitHub honors that marker anywhere in the message. Check the squash body before merging a branch that produced prereleases.

## How version selection works

Versions and releases are automated by **semantic-release** ([.releaserc.json](.releaserc.json)):

| Commit type | Version bump |
|---|---|
| `fix:` | patch |
| `feat:` | minor |
| `feat!:` / `BREAKING CHANGE:` | major |
| `chore:`, `docs:`, `ci:`, `style:`, `test:`, `refactor:`, `build:`, `perf:` | no release |

Only the **first line** is parsed as the header.

## Release channels

| Branch | npm dist-tag |
|---|---|
| `main` | `latest` |
| `next` | `next` |
| `feat/**` | per-branch prerelease channel (branch suffix slugified) |

**Publishing is blocked until docevals is on npm.** A `file:` dependency is not publishable — npm would ship a broken spec. Keep the `RELEASE_ENABLED` repository variable unset; when docevals publishes, switch `"docevals"` to a semver range **in the same commit** that enables releases.

## Don't

- Don't hand-edit `version` in `package.json`.
- Don't create git tags manually (`v*` is owned by semantic-release).
- Don't run `npm publish` locally.
- Don't use `--no-verify` to skip a failing hook — fix the cause.
- Don't add commitizen, standard-version, release-please, or changesets — they conflict with semantic-release.
- Don't use `npm ci` (see "Environment setup").
- Don't register `schemas/artifact-evals-0.1.json` as a built-in inside docmeta — schemas are published by the tool that owns them (decision inherited from docevals; a docmeta built-in was tried there and reversed).
- Don't add `@anthropic-ai/sdk` as a direct dependency — it arrives transitively via docevals' provider layer.

## Testing behavior

**Keep transient files inside the worktree, never in system temp directories.** Put scratch output under `.tmp/` at the repo root (gitignored).

Tests that shell out are time-intensive — save output once and read the file:

```bash
mkdir -p .tmp && npm test > .tmp/output.txt 2>&1
```

**Absolute POSIX paths break the Windows leg of CI.** Under Git Bash on `windows-latest`, `/tmp/x` resolves to the shell's POSIX root while `node.exe` resolves the same literal against the current drive. Use relative paths in any workflow step that both a shell and Node touch.

## Commands

- `npm test` — vitest (unit + integration; no network, no API keys)
- `AGENTEVALS_LIVE=1 npm test` — adds the live smoke test (real judge provider)
- `npm run typecheck` / `npm run build`
- `node dist/cli.js run test/fixtures/traces/claude-session.jsonl --project test/fixtures/project --deterministic-only` — dogfood run against the fixture corpus

## Architecture

Pipeline: **select trace → parse (adapter) → resolve artifacts → extract criteria → plan evals → deterministic graders → LLM judge → aggregate → report (+ history)**.

- `src/trace/` — trace adapters behind a normalized `Trace` model. `claude.ts` parses both Claude Code session files (`~/.claude/projects/<slug>/*.jsonl`) and legacy `claude -p` stream-json. `discover.ts` scans the session store (`AGENTEVALS_HOME` overrides the home dir for tests). The `TraceSource` union is the seam for future adapters (Codex is deferred, not rejected — see ADR 01003).
- `src/artifacts/` — deterministic resolution of every skill/agent/project-rule artifact the trace used: `Skill` tool calls and `<command-name>` injections → `SKILL.md`; `Agent` spawns (`subagent_type`) → agent definitions; `CLAUDE.md`/`AGENTS.md` at the trace cwd, `.claude/`, and parent dirs up to the git root. Unresolved refs go to the report's coverage table, never crash the run.
- `src/criteria/` — reads the `metadata.evals` frontmatter block from artifacts via docmeta `extractFrontmatter`, validated against `schemas/artifact-evals-0.1.json` (a **published artifact** — ships in the package, pinned by `test/unit/schema.test.ts`). Artifacts without declared criteria get one implicit whole-artifact adherence eval (ADR 01002).
- `src/graders/` — deterministic `TraceGrader` registry: `tool-usage`, `skill-invoked`, `file-access`, `turn-count`, `cost`, `regex`, `json-output`.
- `src/judge/` — trace-adherence LLM judge built on docevals' provider layer (`makeProvider`, `JudgeProvider`, `MockProvider`) and ensemble math (`computeConsensus`, `zoneFor`). docevals' `makeJudge` is page-coupled and deliberately **not** reused (ADR 01001). N-run ensemble at temperature 0, content-addressed cache under `.agentevals/cache`.
- `src/core/engine.ts` — orchestration; the judge and graders are injected so the engine tests offline.
- `src/reporters/` — human / json / markdown, each with an artifact-coverage section.

## Invariants

- Errored judge runs count against consensus — they may push an eval to human-review, never to a silent pass.
- Deterministic evals fail only on `error`-severity findings; warnings and info report but pass.
- Exit codes: `0` pass, `1` any fail/error, `2` operational (`AgentevalsError`).
- Bump `PROMPT_VERSION` (`src/judge/prompt.ts`) whenever judge prompts change — it is part of the cache key.
- Evaluation is **read-only**: agentevals never mutates trace files or the artifacts it evaluates.
- Artifact resolution is deterministic: trace content + filesystem lookup, no LLM guessing. Unresolved or absent artifacts degrade to warnings and coverage notes, never a crash; zero artifacts → skipped evals, exit 0.
- `schemas/artifact-evals-0.1.json` is a published artifact — keep the `$id` a resolvable URL and pin its behavior in `test/unit/schema.test.ts`.

## Config ↔ CLI flags (required pattern)

Every user-facing knob flows through the resolved config. CLI flags do **not** bypass it — they override it.

```text
agentevals.config.yaml  →  Ajv validate (src/core/config-schema.json)  →  defaults applied  →  CLI override  →  runtime
```

- `parseConfig()` in `src/core/config.ts` validates and fills **every** default; downstream code receives a fully-populated config.
- CLI options are overlaid at the read site with `??` (e.g. `options.runs ?? config.judge.ensembleRuns`).
- Runtime code never reads `argv`.

Adding a knob: schema first (+ positive and negative config tests) → default in `parseConfig()` → CLI flag in `src/cli.ts` → override with `??` → read the resolved value.

## Enforcement

| Convention | Enforced by |
|---|---|
| Build, tests, typecheck, dogfood run | [ci.yml](.github/workflows/ci.yml) — ubuntu + windows |
| Commit messages | husky [`commit-msg`](.husky/commit-msg) hook locally, [commitlint.yml](.github/workflows/commitlint.yml) on PRs |
| Version selection / release channels | [.releaserc.json](.releaserc.json) + [release.yml](.github/workflows/release.yml) |
| ADRs | [adrs/](adrs) — convention and template; not machine-enforced |
| Automated review | [claude-pr-review.yml](.github/workflows/claude-pr-review.yml), [claude.yml](.github/workflows/claude.yml) |

The husky hook installs via the `prepare` script on `npm install`. If commits stop being linted, check `git config core.hooksPath` — it should be `.husky/_`. Run `npx husky` to reinstall.

### Still requiring one-time setup

- **Claude review** workflows skip with a notice until `gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo hawkeyexl/agentevals`. Note `claude-code-action` refuses to run when the workflow file differs from the default branch's copy (anti-tampering) — a green check is not proof a review ran; check the duration.
- **Releases** are opt-in via `gh variable set RELEASE_ENABLED --body true` — but see "Release channels": do not enable until the docevals `file:` dependency is replaced with a semver range. Configure npm trusted publishing (OIDC, naming `release.yml`) before enabling.
