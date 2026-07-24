import { describe, expect, it } from "vitest";
import { graderFor } from "../../../src/graders/registry.js";
import { makePlan, makeTrace } from "../../helpers.js";

const grader = graderFor("file-access")!;

const trace = makeTrace({
  fileAccesses: [
    { path: "C:\\work\\demo-project\\src\\app.ts", op: "read" },
    { path: "C:\\work\\demo-project\\src\\app.ts", op: "edit" },
    { path: "C:\\work\\demo-project\\notes.md", op: "write" },
  ],
});

describe("file-access grader", () => {
  it("matches by path suffix regardless of separators", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "file-access",
        options: { path: "src/app.ts", op: "read", expect: "accessed" },
      }),
    });
    expect(result.findings).toEqual([]);
  });

  it("distinguishes operations", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "file-access",
        options: { path: "notes.md", op: "edit", expect: "accessed" },
      }),
    });
    expect(result.findings).toHaveLength(1);
  });

  it("any op matches when op is omitted", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "file-access",
        options: { path: "notes.md", expect: "accessed" },
      }),
    });
    expect(result.findings).toEqual([]);
  });

  it("fails on forbidden access", async () => {
    const result = await grader.grade({
      trace,
      plan: makePlan({
        grader: "file-access",
        options: { path: "app.ts", op: "edit", expect: "not-accessed" },
      }),
    });
    expect(result.findings).toHaveLength(1);
  });
});
