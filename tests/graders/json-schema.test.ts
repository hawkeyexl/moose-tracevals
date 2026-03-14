import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { graderJsonSchema } from "../../src/graders/code/json-schema.js";
import { makeTrialContext, makeCriterion, makeTranscriptMsg } from "../helpers.js";
import { tmpDir } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("graderJsonSchema", () => {
  it("valid JSON against schema -> pass", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const schemaFile = join(tmp.dir, "schema.json");
    await writeFile(schemaFile, JSON.stringify({
      type: "object",
      properties: { name: { type: "string" }, age: { type: "number" } },
      required: ["name"],
    }));
    const after = new Map([["output.json", '{"name": "Alice", "age": 30}']]);
    const ctx = makeTrialContext({ cwd: tmp.dir, workspace_after: after });
    const criterion = makeCriterion({
      grader: "json-schema",
      config: { schema_path: "schema.json", output_file: "output.json" },
    });
    const result = await graderJsonSchema(criterion, ctx);
    assert.equal(result.pass, true);
    assert.equal(result.score, 1.0);
  });

  it("invalid JSON against schema -> fail with AJV errors", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const schemaFile = join(tmp.dir, "schema.json");
    await writeFile(schemaFile, JSON.stringify({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    }));
    const after = new Map([["output.json", '{"age": 30}']]);
    const ctx = makeTrialContext({ cwd: tmp.dir, workspace_after: after });
    const criterion = makeCriterion({
      grader: "json-schema",
      config: { schema_path: "schema.json", output_file: "output.json" },
    });
    const result = await graderJsonSchema(criterion, ctx);
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("validation failed"));
  });

  it("no schema_path -> fail", async () => {
    const after = new Map([["output.json", '{"data": true}']]);
    const ctx = makeTrialContext({ workspace_after: after });
    const criterion = makeCriterion({
      grader: "json-schema",
      config: { output_file: "output.json" },
    });
    const result = await graderJsonSchema(criterion, ctx);
    assert.equal(result.pass, false);
    assert.ok(result.reasoning.includes("schema_path"));
  });

  it("JSON from workspace_after file: found and validated", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const schemaFile = join(tmp.dir, "schema.json");
    await writeFile(schemaFile, JSON.stringify({
      type: "object",
      properties: { valid: { type: "boolean" } },
      required: ["valid"],
    }));
    const after = new Map([["result.json", '{"valid": true}']]);
    const ctx = makeTrialContext({ cwd: tmp.dir, workspace_after: after });
    const criterion = makeCriterion({
      grader: "json-schema",
      config: { schema_path: "schema.json", output_file: "result.json" },
    });
    const result = await graderJsonSchema(criterion, ctx);
    assert.equal(result.pass, true);
  });

  it("JSON extracted from transcript code fence: found and validated", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const schemaFile = join(tmp.dir, "schema.json");
    await writeFile(schemaFile, JSON.stringify({
      type: "object",
      properties: { status: { type: "string" } },
      required: ["status"],
    }));
    const ctx = makeTrialContext({
      cwd: tmp.dir,
      transcript: [
        makeTranscriptMsg({
          type: "assistant",
          role: "assistant",
          content: '```json\n{"status": "ok"}\n```',
        }),
      ],
    });
    const criterion = makeCriterion({
      grader: "json-schema",
      config: { schema_path: "schema.json" },
    });
    const result = await graderJsonSchema(criterion, ctx);
    assert.equal(result.pass, true);
  });
});
