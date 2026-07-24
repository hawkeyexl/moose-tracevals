# Architecture Decision Records

Every **behavior change** in agentevals ships with an ADR here. The ADR records the intended behavior and the reasoning — write it before or alongside the code, so it is the reviewable source of truth rather than an afterthought. The full rule lives in [CLAUDE.md](../CLAUDE.md#architecture-decision-records-required).

## Conventions

- **Format**: [MADR 4.0.0](https://adr.github.io/madr/). Start from [template.md](template.md).
- **Filename**: `NNNNN-kebab-case-title.md`, 5-digit zero-padded.
- **Numbering starts at `01000`** and increments. The range `00001`–`00999` is **reserved** to backfill pre-existing architectural decisions later — do not use it for new ones.
- **Scope**: decisions (behavior, contracts, trade-offs), not mechanical changes. If a change alters observable behavior or a public contract, it needs one.

## Index

| ADR | Title | Status |
|---|---|---|
| [01000](01000-rebuild-as-trace-adherence-evaluator-on-docevals-and-docmeta.md) | Rebuild agentevals as a trace-adherence evaluator on docevals and docmeta | accepted |
| [01001](01001-reuse-docevals-provider-and-consensus-layer-not-makejudge.md) | Reuse docevals' provider and consensus layer, not makeJudge | accepted |
| [01002](01002-declared-criteria-plus-implicit-whole-artifact-eval.md) | Declared frontmatter criteria plus an implicit whole-artifact eval; drop heading scraping | accepted |
| [01003](01003-claude-code-traces-first-with-an-adapter-seam.md) | Claude Code traces first, with an adapter seam and graceful degradation | accepted |
| [01004](01004-validate-grader-options-up-front.md) | Validate grader options up front, not only while grading | accepted |
| [01005](01005-fill-proposes-criteria-at-authoring-time.md) | `fill` proposes criteria at authoring time, with deterministic graders and a confidence gate | accepted |
