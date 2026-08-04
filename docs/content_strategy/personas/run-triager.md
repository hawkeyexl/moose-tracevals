---
id: persona-run-triager
type: persona
name: "Theo — Session triager"
audience: aud-run-triagers
role: Contributor, reviewer, or on-call engineer looking at one failed eval
proficiency: [reading-ci-logs, git]
prerequisites:
  - reads terminal output and CI logs
  - uses Git well enough to find who owns a file
goals:
  - understand what failed, in the artifact's own terms
  - decide whether the verdict is trustworthy
  - know whether to fix the session, fix the criterion, or escalate
pains:
  - REVIEW and SKIP are not self-explanatory, and SKIP has several distinct causes
  - a failure message says what happened, not what to do
  - a judged verdict with no vote split reads as arbitrary
  - frequently cannot fix it and needs to know who can
content_types: [single-page-troubleshooter, symptom-to-remedy-table, faq]
journeys:
  - cuj-triage-failure
---

# Persona: Theo — Session triager

**Scope:** the arrival persona for [`aud-run-triagers`](../audiences/run-triagers.md). Theo is
looking at exactly one result and did not choose this tool.

Theo opened a pull request, or is reviewing one, or is on call when a nightly job goes red. Until
about ninety seconds ago he did not know agentevals existed. He is a competent engineer with no
context on this tool, no appetite for acquiring much, and one specific question.

**Goal:** decode one line of output and act on it, without reading anything else.

**Pains:**

- **`REVIEW` means nothing to him.** Neither does `SKIP` — and skip has several unrelated causes
  (deterministic-only mode, an exhausted cost budget, a trace carrying no usage data, an artifact
  marked to skip), each implying a different next move.
- **The message stops short of a remedy.** Knowing a forbidden tool was used does not tell him
  whether to change the session's behavior or challenge the rule — and "the criterion is wrong" is
  rarely his first guess even when it is the right answer.
- **A judged verdict without its vote split reads as noise.** Show him three-to-nothing with a
  cited observation and he will act on it; show him a bare `FAIL` and he will escalate.
- **He often cannot fix it.** The artifact belongs to someone else. He needs the path to that
  person as much as the diagnosis.

**How he uses agentevals:** he does not. He reads one page, once, and leaves. If that page does not
resolve it, he pings whoever owns the artifact — and if the page did its job, he pings them with a
specific question instead of a screenshot.

**What success looks like for him:** under two minutes from red line to a decision he is confident
in, and never opening a second page.

**Careful with:** the single page serving Theo must define *artifact*, *criterion*, and *outcome*
**in place**, one sentence each. A reader who has to follow a link to understand the first line has
already been lost. It must assume nothing about ensembles, zones, providers, or configuration — the
vote split is shown to him as evidence to weigh, never as a mechanism to understand. Everything
else lives behind links he is not expected to take.

**Traffic note:** this is expected to be the highest-traffic persona by page views and the
shallowest by depth. Every person who ever trips an eval lands here, most of them exactly once.
That asymmetry justifies a disproportionately well-crafted single page — and argues against
spreading his journey across several.
