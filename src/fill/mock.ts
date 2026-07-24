/**
 * A canned, schema-valid proposal for `--provider mock`.
 *
 * docevals' `mockVerdict` is judge-shaped, so it cannot drive `fill` — the
 * response would fail the proposal schema. This gives the offline path
 * (CI's dogfood gate, CLI smoke tests) something the gate can actually chew
 * on: one criterion that should be accepted and one that should be rejected
 * for low confidence, so a run that rubber-stamps everything is visible.
 */
export function mockFillProposal(): { json: Record<string, unknown> } {
  return {
    json: {
      criteria: [
        {
          name: "reads-before-editing",
          assertion: "The session read a source file before editing it.",
          grader: "tool-usage",
          options: { tool: "Read", expect: "used" },
          examples: {
            pass: "Read is called before the first Edit",
            fail: "Edit is called with no prior Read",
          },
          confidence: 0.9,
        },
        {
          name: "explains-its-reasoning",
          assertion: "The session explained why it made each change.",
          grader: "llm",
          examples: {
            pass: "Each edit is accompanied by a rationale",
            fail: "Edits land with no explanation",
          },
          confidence: 0.3,
        },
      ],
      needsSharpening: [
        {
          instruction: "Produce high-quality work.",
          reason: "\"high-quality\" has no measurable bar, so no session could fail it",
          suggestion: "Name the specific property that must hold, and how to observe it.",
        },
      ],
    },
  };
}
