/**
 * Trial runner — executes prompts via `claude -p` CLI and captures transcripts.
 */

import { execSync } from "node:child_process";
import { writeFile, readFile, readdir, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runPrompt } from "./prompt-runner.js";
import type {
  EvalCase,
  RunnerOptions,
  TrialContext,
  TranscriptMessage,
  ExtractedCriteria,
} from "./types.js";

/**
 * Run setup commands for an eval spec.
 */
export function runSetup(commands: string[] | undefined): void {
  if (!commands) return;
  for (const cmd of commands) {
    execSync(cmd, { stdio: "pipe" });
  }
}

/**
 * Run teardown commands for an eval spec.
 */
export function runTeardown(commands: string[] | undefined): void {
  if (!commands) return;
  for (const cmd of commands) {
    try {
      execSync(cmd, { stdio: "pipe" });
    } catch {
      // Teardown failures are non-fatal
    }
  }
}

/**
 * Snapshot file contents in a directory (shallow, for diff-check).
 */
async function snapshotWorkspace(dir: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  try {
    await collectFiles(dir, dir, snapshot);
  } catch {
    // Directory may not exist yet
  }
  return snapshot;
}

async function collectFiles(
  baseDir: string,
  currentDir: string,
  snapshot: Map<string, string>,
  depth = 0
): Promise<void> {
  if (depth > 5) return;
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = join(currentDir, entry.name);
    const relPath = fullPath.slice(baseDir.length + 1);
    if (entry.isFile()) {
      try {
        const content = await readFile(fullPath, "utf-8");
        snapshot.set(relPath, content);
      } catch {
        // Skip unreadable files
      }
    } else if (entry.isDirectory()) {
      await collectFiles(baseDir, fullPath, snapshot, depth + 1);
    }
  }
}

export interface TrialExecutionResult {
  context: TrialContext;
  transcript: TranscriptMessage[];
}

/**
 * Execute a single trial for a case via `claude -p` CLI.
 */
export async function executeTrial(
  evalCase: EvalCase,
  runnerOptions: RunnerOptions,
  model: string,
  extractedCriteria: ExtractedCriteria,
  outputDir: string,
  trialNumber: number
): Promise<TrialExecutionResult> {
  const cwd = runnerOptions.cwd ? resolve(runnerOptions.cwd) : process.cwd();
  const startTime = Date.now();

  // Snapshot workspace before
  const workspaceBefore = await snapshotWorkspace(cwd);

  // Execute via claude CLI
  const result = await runPrompt({
    prompt: evalCase.prompt,
    model,
    cwd,
    allowedTools: runnerOptions.allowed_tools,
    maxTurns: runnerOptions.max_turns ?? 20,
    systemPrompt: runnerOptions.system_prompt,
  });

  const duration = Date.now() - startTime;

  // Snapshot workspace after
  const workspaceAfter = await snapshotWorkspace(cwd);

  // Normalize messages to TranscriptMessage format
  const transcript = normalizeMessages(result.messages);

  // Extract cost and turns from result message
  let totalCost = 0;
  let numTurns = 0;
  if (result.result) {
    totalCost = (result.result.total_cost_usd as number) ?? 0;
    numTurns = (result.result.num_turns as number) ?? 0;
  }

  // Save transcript
  await mkdir(outputDir, { recursive: true });
  const transcriptPath = join(outputDir, `trial-${trialNumber}.jsonl`);
  await writeFile(transcriptPath, result.rawJsonl, "utf-8");

  const context: TrialContext = {
    transcript,
    workspace_before: workspaceBefore,
    workspace_after: workspaceAfter,
    cwd,
    cost_usd: totalCost,
    num_turns: numTurns,
    duration_ms: duration,
    extracted_criteria: extractedCriteria,
  };

  return { context, transcript };
}

/**
 * Normalize raw JSONL messages into TranscriptMessage format.
 */
function normalizeMessages(messages: Record<string, unknown>[]): TranscriptMessage[] {
  const normalized: TranscriptMessage[] = [];

  for (const msg of messages) {
    const entry: TranscriptMessage = { type: msg.type as string };

    if (msg.type === "assistant") {
      entry.role = "assistant";
      const message = msg.message as Record<string, unknown> | undefined;
      if (message) {
        entry.content = message.content;
        // Extract tool_use blocks
        if (Array.isArray(message.content)) {
          for (const block of message.content as Array<Record<string, unknown>>) {
            if (block?.type === "tool_use") {
              entry.tool_use = {
                id: block.id as string,
                name: block.name as string,
                input: block.input as Record<string, unknown>,
              };
            }
          }
        }
      }
    } else if (msg.type === "user") {
      entry.role = "user";
      const message = msg.message as Record<string, unknown> | undefined;
      if (message) {
        entry.content = message.content;
      }
    } else if (msg.type === "result") {
      entry.content = msg.subtype as string | undefined;
      (entry as Record<string, unknown>).result_text = msg.result;
      (entry as Record<string, unknown>).num_turns = msg.num_turns;
      (entry as Record<string, unknown>).total_cost_usd = msg.total_cost_usd;
      (entry as Record<string, unknown>).is_error = msg.is_error;
    } else if (msg.type === "system") {
      entry.role = "system";
      if (msg.subtype !== undefined) {
        (entry as Record<string, unknown>).subtype = msg.subtype;
      }
    }

    normalized.push(entry);
  }

  return normalized;
}
