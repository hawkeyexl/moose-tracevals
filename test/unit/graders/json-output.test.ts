import { describe, expect, it } from "vitest";
import { graderFor } from "../../../src/graders/registry.js";
import { makePlan, makeTrace } from "../../helpers.js";

const grader = graderFor("json-output")!;

describe("json-output grader", () => {
  it("validates the last assistant text against a schema", async () => {
    const result = await grader.grade({
      trace: makeTrace({ assistantTexts: ["done", '{"status":"ok"}'] }),
      plan: makePlan({
        grader: "json-output",
        options: {
          schema: {
            type: "object",
            required: ["status"],
            properties: { status: { type: "string" } },
          },
        },
      }),
    });
    expect(result.findings).toEqual([]);
  });

  it("fails when the output does not match the schema", async () => {
    const result = await grader.grade({
      trace: makeTrace({ assistantTexts: ['{"status":42}'] }),
      plan: makePlan({
        grader: "json-output",
        options: {
          schema: { type: "object", properties: { status: { type: "string" } } },
        },
      }),
    });
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("fails when the output is not JSON at all", async () => {
    const result = await grader.grade({
      trace: makeTrace({ assistantTexts: ["not json"] }),
      plan: makePlan({
        grader: "json-output",
        options: { schema: { type: "object" } },
      }),
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("JSON");
  });
});
