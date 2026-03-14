/**
 * json-schema grader: Verify output conforms to a JSON schema.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import _Ajv from "ajv";
const Ajv = _Ajv as unknown as typeof _Ajv.default;
import type { Criterion, TrialContext, GraderResult } from "../../types.js";

const ajv = new Ajv({ allErrors: true });

export async function graderJsonSchema(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const schemaPath = config.schema_path as string | undefined;
  const outputFile = config.output_file as string | undefined;

  let jsonOutput: unknown;
  let evidence: Record<string, unknown> = {};

  // Find JSON output: from file or from transcript
  if (outputFile) {
    const fullPath = resolve(context.cwd, outputFile);
    const afterContent = context.workspace_after.get(outputFile);
    if (afterContent) {
      try {
        jsonOutput = JSON.parse(afterContent);
      } catch (err) {
        return {
          name: criterion.name,
          grader: "json-schema",
          pass: false,
          score: 0.0,
          reasoning: `Output file "${outputFile}" contains invalid JSON: ${(err as Error).message}`,
          evidence: { file: outputFile },
        };
      }
    } else {
      try {
        const content = await readFile(fullPath, "utf-8");
        jsonOutput = JSON.parse(content);
      } catch {
        return {
          name: criterion.name,
          grader: "json-schema",
          pass: false,
          score: 0.0,
          reasoning: `Output file "${outputFile}" not found or not valid JSON`,
          evidence: { file: outputFile },
        };
      }
    }
  } else {
    // Search transcript for JSON output
    jsonOutput = extractJsonFromTranscript(context.transcript);
    if (jsonOutput === null) {
      return {
        name: criterion.name,
        grader: "json-schema",
        pass: false,
        score: 0.0,
        reasoning: "No JSON output found in transcript",
      };
    }
  }

  // Load schema
  if (!schemaPath) {
    return {
      name: criterion.name,
      grader: "json-schema",
      pass: false,
      score: 0.0,
      reasoning: "No schema_path provided in grader config",
    };
  }

  let schema: object;
  try {
    const schemaContent = await readFile(resolve(context.cwd, schemaPath), "utf-8");
    schema = JSON.parse(schemaContent);
  } catch (err) {
    return {
      name: criterion.name,
      grader: "json-schema",
      pass: false,
      score: 0.0,
      reasoning: `Failed to load schema from "${schemaPath}": ${(err as Error).message}`,
    };
  }

  // Validate
  const validate = ajv.compile(schema);
  const valid = validate(jsonOutput);

  evidence = {
    schema_path: schemaPath,
    errors: validate.errors ?? [],
  };

  return {
    name: criterion.name,
    grader: "json-schema",
    pass: valid === true,
    score: valid ? 1.0 : 0.0,
    reasoning: valid
      ? "Output conforms to JSON schema"
      : `Schema validation failed: ${ajv.errorsText(validate.errors)}`,
    evidence,
  };
}

function extractJsonFromTranscript(transcript: Array<Record<string, unknown>>): unknown {
  // Search backwards for the last JSON block in assistant messages
  for (let i = transcript.length - 1; i >= 0; i--) {
    const msg = transcript[i];
    if (msg.role !== "assistant") continue;

    const content = msg.content;
    if (typeof content === "string") {
      const parsed = tryParseJson(content);
      if (parsed !== null) return parsed;
    }

    if (Array.isArray(content)) {
      for (const block of content as Array<Record<string, unknown>>) {
        if (block?.type === "text" && typeof block.text === "string") {
          const parsed = tryParseJson(block.text);
          if (parsed !== null) return parsed;
        }
      }
    }
  }
  return null;
}

function tryParseJson(text: string): unknown {
  // Try parsing the whole thing
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from code fences
    const match = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        // Not valid JSON
      }
    }
    return null;
  }
}
