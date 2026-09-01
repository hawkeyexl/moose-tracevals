/**
 * tool-order: sequence, which `tool-usage` cannot express.
 *
 * "Read before Write" is a claim a lot of instruction artifacts actually make,
 * and counting alone cannot check it: a session that wrote first and read
 * afterwards to see what it had done satisfies every count and violates the
 * instruction.
 */
import { describe, expect, it } from "vitest";
import { graderFor } from "../../../src/graders/registry.js";
import { makePlan, makeTrace } from "../../helpers.js";

const grader = graderFor("tool-order")!;

const ordered = makeTrace({
  toolCalls: [
    { name: "Read", input: { file_path: "src/a.ts" }, sidechain: false },
    { name: "Write", input: { file_path: "src/a.ts" }, sidechain: false },
  ],
});

const reversed = makeTrace({
  toolCalls: [
    { name: "Write", input: { file_path: "src/a.ts" }, sidechain: false },
    { name: "Read", input: { file_path: "src/a.ts" }, sidechain: false },
  ],
});

const plan = (options: Record<string, unknown>) =>
  makePlan({ grader: "tool-order", options });

const gradeWith = async (trace: ReturnType<typeof makeTrace>, options: Record<string, unknown>) =>
  grader.grade({ trace, plan: plan(options) });

describe("tool-order grader", () => {
  it("passes when before precedes after", async () => {
    const r = await gradeWith(ordered, { before: "Read", after: "Write" });
    expect(r.findings).toEqual([]);
  });

  it("fails when the order is reversed", async () => {
    const r = await gradeWith(reversed, { before: "Read", after: "Write" });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]?.message).toContain("only used after");
  });

  it("fails when after happened and before never did", async () => {
    const writeOnly = makeTrace({
      toolCalls: [{ name: "Write", input: {}, sidechain: false }],
    });
    const r = await gradeWith(writeOnly, { before: "Read", after: "Write" });
    expect(r.findings[0]?.message).toContain("without Read ever being used");
  });

  it("fails when before happened and after never did", async () => {
    const readOnly = makeTrace({
      toolCalls: [{ name: "Read", input: {}, sidechain: false }],
    });
    const r = await gradeWith(readOnly, { before: "Read", after: "Write" });
    expect(r.findings[0]?.message).toContain("was never used");
  });

  it("passes vacuously when neither tool appears", async () => {
    // An ordering claim with nothing to bite on. A suite that wants the calls
    // to happen at all says so with tool-usage — the grader for that question.
    const neither = makeTrace({
      toolCalls: [{ name: "Glob", input: {}, sidechain: false }],
    });
    const r = await gradeWith(neither, { before: "Read", after: "Write" });
    expect(r.findings).toEqual([]);
  });

  it("narrows by input, so an unrelated read does not satisfy the claim", async () => {
    const wrongFile = makeTrace({
      toolCalls: [
        { name: "Read", input: { file_path: "README.md" }, sidechain: false },
        { name: "Write", input: { file_path: "src/a.ts" }, sidechain: false },
      ],
    });
    const loose = await gradeWith(wrongFile, { before: "Read", after: "Write" });
    expect(loose.findings).toEqual([]);
    const strict = await gradeWith(wrongFile, {
      before: "Read",
      beforeInputMatch: "src/",
      after: "Write",
      afterInputMatch: "src/",
    });
    expect(strict.findings).toHaveLength(1);
  });

  it("takes the weakest useful reading: one good pair is enough", async () => {
    // Read, Write, Write. Demanding every Write be preceded by its own Read
    // would fail a session that did the right thing and then repeated the
    // second half.
    const repeated = makeTrace({
      toolCalls: [
        { name: "Read", input: {}, sidechain: false },
        { name: "Write", input: {}, sidechain: false },
        { name: "Write", input: {}, sidechain: false },
      ],
    });
    const r = await gradeWith(repeated, { before: "Read", after: "Write" });
    expect(r.findings).toEqual([]);
  });

  it("ignores sidechain calls by default but counts them on request", async () => {
    const inSubagent = makeTrace({
      toolCalls: [
        { name: "Read", input: {}, sidechain: true },
        { name: "Write", input: {}, sidechain: false },
      ],
    });
    const scoped = await gradeWith(inSubagent, { before: "Read", after: "Write" });
    expect(scoped.findings).toHaveLength(1);
    const widened = await gradeWith(inSubagent, {
      before: "Read",
      after: "Write",
      includeSidechains: true,
    });
    expect(widened.findings).toEqual([]);
  });

  it("reports an uncompilable pattern as an eval error, not a session failure", async () => {
    const r = await gradeWith(ordered, {
      before: "Read",
      after: "Write",
      beforeInputMatch: "([unclosed",
    });
    expect(r.error).toContain("not a valid regular expression");
    expect(r.findings).toEqual([]);
  });

  it("requires both ends of the claim", async () => {
    const r = await gradeWith(ordered, { before: "Read" });
    expect(r.error).toContain("options.after is required");
  });
});
