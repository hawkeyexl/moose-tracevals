/**
 * Pins the published artifact-evals schema. The schema ships in the package
 * (`files`/`exports`) and consumers validate against it by path, so behavior
 * changes here are contract changes.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  ARTIFACT_EVALS_SCHEMA_ID,
  artifactEvalsSchemaPath,
} from "../../src/criteria/extract.js";

async function loadSchema(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(artifactEvalsSchemaPath(), "utf-8"),
  ) as Record<string, unknown>;
}

describe("artifact-evals schema", () => {
  it("has a resolvable, pinned $id", async () => {
    const schema = await loadSchema();
    expect(schema.$id).toBe(ARTIFACT_EVALS_SCHEMA_ID);
    expect(String(schema.$id)).toMatch(/^https:\/\//);
  });

  it("accepts string shorthand and full object criteria", async () => {
    const validate = new Ajv2020().compile(await loadSchema());
    expect(
      validate({
        criteria: [
          "Reproduce the bug with a failing test.",
          {
            name: "used-read",
            assertion: "The session read a file.",
            grader: "tool-usage",
            options: { tool: "Read", expect: "used" },
            severity: "warning",
            examples: { pass: ["Read was called"], fail: ["No Read calls"] },
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects unknown graders and empty assertions", async () => {
    const validate = new Ajv2020().compile(await loadSchema());
    expect(
      validate({ criteria: [{ assertion: "x", grader: "sorcery" }] }),
    ).toBe(false);
    expect(validate({ criteria: [{ assertion: "" }] })).toBe(false);
    expect(validate({ criteria: [{ grader: "llm" }] })).toBe(false);
  });

  it("rejects unknown top-level keys", async () => {
    const validate = new Ajv2020().compile(await loadSchema());
    expect(validate({ criterias: [] })).toBe(false);
  });
});
