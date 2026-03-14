/**
 * Prompt runner — executes prompts via `claude -p` CLI and captures JSONL output.
 * Used by both spec mode (trial execution) and -p mode.
 */

import { spawn } from "node:child_process";

export interface PromptRunResult {
  /** Raw JSONL lines parsed as objects */
  messages: Record<string, unknown>[];
  /** The result message (last message of type "result") */
  result?: Record<string, unknown>;
  /** Raw JSONL string */
  rawJsonl: string;
  /** Exit code from the process */
  exitCode: number;
}

export interface PromptRunOptions {
  prompt: string;
  model?: string;
  cwd?: string;
  allowedTools?: string[];
  maxTurns?: number;
  systemPrompt?: string;
  /** Print output as it arrives */
  streamToStdout?: boolean;
}

/**
 * Run `claude -p` with stream-json output, capturing all messages.
 */
export async function runPrompt(options: PromptRunOptions): Promise<PromptRunResult> {
  const args = [
    "-p", options.prompt,
    "--output-format", "stream-json",
    "--verbose",
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.allowedTools?.length) {
    args.push("--allowedTools", options.allowedTools.join(","));
  }

  if (options.maxTurns) {
    args.push("--max-turns", String(options.maxTurns));
  }

  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  }

  return new Promise<PromptRunResult>((resolve, reject) => {
    const proc = spawn("claude", args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const chunks: string[] = [];
    const messages: Record<string, unknown>[] = [];
    let resultMsg: Record<string, unknown> | undefined;
    let buffer = "";

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);

      if (options.streamToStdout) {
        process.stderr.write(text);
      }

      // Parse JSONL lines
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          messages.push(parsed);
          if (parsed.type === "result") {
            resultMsg = parsed;
          }
        } catch {
          // Non-JSON line, skip
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      if (options.streamToStdout) {
        process.stderr.write(data);
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
    });

    proc.on("close", (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as Record<string, unknown>;
          messages.push(parsed);
          if (parsed.type === "result") {
            resultMsg = parsed;
          }
        } catch {
          // ignore
        }
      }

      resolve({
        messages,
        result: resultMsg,
        rawJsonl: chunks.join(""),
        exitCode: code ?? 1,
      });
    });

    proc.stdin.end();
  });
}

/**
 * Run a structured JSON output call via `claude -p --json-schema --tools ""`.
 * Used for LLM-as-judge calls.
 */
export async function runStructuredPrompt<T = Record<string, unknown>>(options: {
  prompt: string;
  jsonSchema: Record<string, unknown>;
  model?: string;
}): Promise<T> {
  const args = [
    "-p", options.prompt,
    "--output-format", "json",
    "--tools", "",
    "--json-schema", JSON.stringify(options.jsonSchema),
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  return new Promise<T>((resolve, reject) => {
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const chunks: string[] = [];

    proc.stdout.on("data", (data: Buffer) => {
      chunks.push(data.toString());
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
    });

    proc.on("close", (code) => {
      const output = chunks.join("");

      if (code !== 0) {
        reject(new Error(`claude CLI exited with code ${code}: ${output.slice(0, 500)}`));
        return;
      }

      try {
        const parsed = JSON.parse(output);
        // The structured output might be in result.structured_output or directly
        if (parsed.result) {
          resolve(parsed.result as T);
        } else {
          resolve(parsed as T);
        }
      } catch {
        reject(new Error(`Failed to parse structured output: ${output.slice(0, 500)}`));
      }
    });

    proc.stdin.end();
  });
}
