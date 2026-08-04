---
type: personas-index
personas:
  - persona-artifact-author
  - persona-platform-engineer
  - persona-eval-owner
  - persona-run-triager
  - persona-toolsmith
lead: persona-artifact-author
model: qualified-reader
---

# Personas

**Scope:** one minimal persona per audience, used to anchor every writing task. Segment-level
reasoning lives in [`../audiences/`](../audiences/_overview.md); the end-to-end outcomes each
persona must reach live in [`../journeys/`](../journeys/_overview.md).

"Minimal" means enough to target content — what they bring, what they want, what stops them — and
no more. These are not marketing personas.

## Persona → audience

| Persona | Audience | In one line |
|---|---|---|
| [Priya](artifact-author.md) — skill & agent author **(lead)** | [`aud-artifact-authors`](../audiences/artifact-authors.md) | Wrote the instructions; needs to know whether sessions followed them. |
| [Devin](platform-engineer.md) — AI platform engineer | [`aud-platform-ci`](../audiences/platform-ci.md) | Needs one offline, deterministic gate that works the same in every repo. |
| [Sam](eval-owner.md) — eval standard owner | [`aud-eval-standard`](../audiences/eval-standard.md) | Decides what "adhered" means and whether the judge deserves to be believed. |
| [Theo](run-triager.md) — session triager | [`aud-run-triagers`](../audiences/run-triagers.md) | Hit one red line; wants it decoded and resolved in a single page. |
| [Rin](toolsmith.md) — toolsmith | [`aud-toolsmiths`](../audiences/toolsmiths.md) | Imports the library; needs the export surface and the extension seams mapped. |

## The qualified-reader model

Every persona states two things instead of a proficiency label:

- **Prerequisites they bring**: knowledge the content may assume without teaching.
- **Subject dependencies**: concepts that must be established *before* this reader can follow, and
  in what order.

Labels like "beginner", "intermediate", and "advanced" are not used. They describe the reader's
career rather than their preparation for a specific page, and they push writers toward hedging
instead of toward stating a dependency plainly. Priya is a senior engineer and a complete novice at
consensus arithmetic; Theo may be more senior than either and still needs *artifact* defined in
place. Neither fact fits on a three-point scale.

The practical test when drafting: **name the concept a reader must already hold, or teach it here.**
If you cannot do either, the page is aimed at nobody.

## Where the personas overlap

Small teams collapse Priya, Devin, and Sam into one person. That is expected and does not merge the
personas: the same human reads as an author on Monday and as a standard owner on Friday, and needs
different content each time. Write for the job, not the job title.

Rin is the cross-cutting case by construction — see
[`aud-toolsmiths`](../audiences/toolsmiths.md#overlap-with-the-primary-segments).

Theo overlaps nobody. That isolation is the point: the page serving Theo cannot assume any of the
context the others accumulate.
