---
id: cuj-triage-failure
type: cuj
title: Read a failing eval and decide what to do
personas: [persona-run-triager]
trigger: "A build went red, or a report shows FAIL, ERROR, REVIEW, or SKIP, and the reader has no context on this tool."
entry_point: /agentevals/triage/
success_criteria: "Within one page and under two minutes, the reader knows which instruction was violated, whether the verdict is trustworthy, and whether to change the session's behavior, challenge the criterion, or escalate — and to whom."
steps:
  - { stage: "Read one result line", doc: /agentevals/triage/, exists: true, note: "artifact, criterion, and outcome defined in place" }
  - { stage: "Understand a deterministic failure", doc: "/agentevals/triage/#a-check-failed", exists: true, note: "the finding names what the session did" }
  - { stage: "Weigh a judged verdict", doc: "/agentevals/triage/#a-judged-verdict", exists: true, note: "the vote split and the cited observation are the evidence" }
  - { stage: "Decode needs-review", doc: "/agentevals/triage/#review-is-not-a-failure", exists: true }
  - { stage: "Decode the several reasons for skipped", doc: "/agentevals/triage/#why-something-was-skipped", exists: true }
  - { stage: "Tell an error from a failure", doc: "/agentevals/triage/#error-means-the-check-broke", exists: true, note: "including a malformed criteria block, which carries a line number" }
  - { stage: "Decide: fix the session, fix the criterion, or escalate", doc: "/agentevals/triage/#what-to-do-next", exists: true }
  - { stage: "Answer a follow-up question", doc: /agentevals/triage/faq/, exists: false, note: "[GAP] the short-answer shelf for the questions that survive the main page" }
---

# CUJ: Read a failing eval and decide what to do

**Scope:** one result, one page, one decision. This journey deliberately does **not** teach
configuration, criteria authoring, or judge internals — every one of those is a link the reader is
not expected to take.

**Trigger.** A red line. The reader did not install this tool and may not have known it existed
until a moment ago.

**Narrative.** This is the highest-traffic and shallowest journey in the set, and its constraint is
unusual enough to state as a rule: **it must be complete in a single page.** A reader who has to
follow a link to understand the first line has already escalated. That means *artifact*,
*criterion*, and *outcome* are defined in place, in a sentence each, even though every other page in
the set assumes them.

The reader's questions arrive in a fixed order — what failed, is the verdict trustworthy, what do I
do — and the page should answer them in that order rather than by document logic.

The genuinely difficult content is that **five outcomes are not equally self-explanatory**:

- **`FAIL`** is the easy one: a criterion was violated and the finding names what the session did.
- **`ERROR`** means the check itself broke, not that the session misbehaved — a malformed criteria
  block, a grader given options it rejects, an unreadable trace. Different remedy, different owner.
- **`REVIEW`** means the judge did not reach confident agreement. It is a designed outcome, not a
  bug, and the honest instruction is "a human decides, and today that is you."
- **`SKIP`** has several unrelated causes — judged evals skipped because the run was
  deterministic-only, a cost budget exhausted, a trace carrying no usage data for a cost check, an
  artifact opted out. Each implies a different action, and collapsing them into one explanation is
  the fastest way to strand this reader.
- **A row in the coverage table is not an outcome at all**: an artifact that could not be resolved
  is reported there and is usually somebody's missing file rather than anything about this session.

The third question is the one most likely to be under-served. The right answer is sometimes *"the
criterion is wrong"*, and that is rarely the reader's first guess — a criterion that no session
could satisfy is a defect in the artifact, and this reader is often the first person to notice.
Naming that option explicitly, alongside "fix the behavior" and "escalate to the artifact's owner",
is what turns a diagnosis into a decision.

**Current friction / gap.** Nothing serves this reader today. The one `[GAP]` is the follow-up
shelf: short answers to the questions that survive the main page, which must stay a *second* page so
the first one keeps its length discipline.
