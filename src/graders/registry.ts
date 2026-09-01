/** Grader registry: static built-ins plus consumer-registered kinds. */
import type { TraceGrader } from "./types.js";
import { toolUsageGrader } from "./tool-usage.js";
import { toolOrderGrader } from "./tool-order.js";
import { skillInvokedGrader } from "./skill-invoked.js";
import { fileAccessGrader } from "./file-access.js";
import { turnCountGrader } from "./turn-count.js";
import { costGrader } from "./cost.js";
import { regexGrader } from "./regex.js";
import { jsonOutputGrader } from "./json-output.js";
import { commandGrader } from "./command.js";

const graders = new Map<string, TraceGrader>(
  [
    toolUsageGrader,
    toolOrderGrader,
    skillInvokedGrader,
    fileAccessGrader,
    turnCountGrader,
    costGrader,
    regexGrader,
    jsonOutputGrader,
    commandGrader,
  ].map((g) => [g.kind, g]),
);

export function registerGrader(grader: TraceGrader): void {
  graders.set(grader.kind, grader);
}

export function graderFor(kind: string): TraceGrader | undefined {
  return graders.get(kind);
}

export function listGraderKinds(): string[] {
  return [...graders.keys()];
}
