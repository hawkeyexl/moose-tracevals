---
id: aud-run-triagers
type: audience
segment: Session triagers
maturity: cross-cutting
docs_owner: nobody; they own neither the artifacts nor the gate
firmographics: [contributor, reviewer, on-call, any-team-size]
relationship_stages: [customer]
personas: [persona-run-triager]
features_emphasized:
  - human reporter
  - findings and failure messages
  - votes line and consensus
  - needs-review
  - skip reasons
  - artifact coverage table
---

# Audience: Session triagers

**Scope:** people who did not install or configure moose-tracevals and are looking at exactly one
result they need to decode and act on. That result is a `FAIL`, an `ERROR`, or a `REVIEW`. It does
not cover configuring the tool, authoring evals, or calibrating the judge. Every one of those is
somebody else's job and a link away.

## Who they are

Whoever is standing in front of the output. That is the contributor whose pull request went red, or
the reviewer deciding whether the run is trustworthy. It is the person on call when a nightly eval
job fails. They may not have known moose-tracevals existed until this moment.

They are technically competent, and can read a terminal and a diff. They have zero context
on this tool, no interest in acquiring much, and a specific question they need answered now.

## What they're trying to do

Answer three questions in order, and then leave:

1. **What failed?** Which artifact, which eval, and what did the session actually do?
2. **Is the verdict trustworthy?** Especially for a judged eval: was this unanimous, split, or did
   runs error?
3. **What do I do?** Fix the session's behavior, sharpen the eval, or escalate to whoever owns
   it.

Anything beyond those three questions is out of scope for this audience and belongs behind a link.

## Defining pains

- **Opaque outcomes.** `REVIEW` is not self-explanatory, and neither is `SKIP`. Several distinct
  reasons make a check skip: deterministic-only mode, an exhausted cost budget, a trace with
  no usage data, or an artifact marked `skip`. Each implies a different action.
- **No stated remedy.** A failure message says what happened, not what to do about it. The right
  move is sometimes "the eval is wrong", which is rarely the reader's first guess.
- **Judged verdicts feel arbitrary.** Without seeing the vote split and the judge's cited
  observation, "an LLM said no" reads as noise.
- **Unclear ownership.** They frequently cannot fix it themselves and need to know who can.
- **Missing artifacts look like failures.** An unresolved skill reference appears in a coverage
  table rather than as a failing eval, and the distinction is not obvious under pressure.

## Buying constraints

None. They did not choose this tool and cannot uninstall it. The only constraint is **time to
resolution**. They will read one page. If that page does not resolve it, they escalate.

## Qualified reader (for docs targeting)

- **Prerequisites they bring:** reading terminal output and CI logs; enough Git to find who owns a
  file. Nothing else can be assumed.
- **Subject dependencies.** Keep them deliberately minimal, and inline rather than linked. The one
  page serving this audience must define *artifact*, *eval*, and *outcome* in place, in a sentence
  each. A reader who has to follow a link to understand the first line has already been
  lost. It must **not** require any understanding of ensembles, zones, providers, or configuration.
  The vote split is presented as evidence to weigh, not as a mechanism to understand.

## Traffic note

This is expected to be the **highest-traffic** audience by page views, and the shallowest by depth.
Every person who ever trips an eval lands here, most of them exactly once. That asymmetry justifies
a disproportionately well-crafted single page and argues against spreading the journey across
several.
