/**
 * exit-code grader: Verify a command exited with the expected code.
 */

import type { Criterion, TrialContext, GraderResult } from "../../types.js";

export async function graderExitCode(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const expectedCode = (config.expected_code as number) ?? 0;
  const commandPattern = config.command_pattern as string | undefined;

  const evidence: Record<string, unknown> = {};
  let foundCode: number | null = null;

  // Search transcript for Bash tool results
  for (let i = 0; i < context.transcript.length; i++) {
    const msg = context.transcript[i];

    // Look for tool_use of Bash tool
    if (msg.tool_use?.name === "Bash" || msg.tool_use?.name === "bash") {
      const command = msg.tool_use.input?.command as string | undefined;
      if (commandPattern && command && !command.includes(commandPattern)) {
        continue;
      }

      // Find the corresponding result
      const toolUseId = msg.tool_use.id;
      for (let j = i + 1; j < context.transcript.length; j++) {
        const resultMsg = context.transcript[j];
        if (resultMsg.tool_result?.tool_use_id === toolUseId) {
          const resultContent = resultMsg.tool_result.content;
          // Parse exit code from result
          if (typeof resultContent === "string") {
            const codeMatch = resultContent.match(/exit code[:\s]+(\d+)/i);
            if (codeMatch) {
              foundCode = parseInt(codeMatch[1], 10);
            }
          }
          break;
        }
      }

      // Also check content blocks for tool results
      if (Array.isArray(msg.content)) {
        for (const block of msg.content as Array<Record<string, unknown>>) {
          if (block?.type === "tool_result") {
            const content = block.content;
            if (typeof content === "string") {
              const codeMatch = content.match(/exit code[:\s]+(\d+)/i);
              if (codeMatch) {
                foundCode = parseInt(codeMatch[1], 10);
              }
            }
          }
        }
      }

      if (foundCode !== null) {
        evidence.command = command;
        evidence.exit_code = foundCode;
        break;
      }
    }
  }

  if (foundCode === null) {
    // If no explicit exit code found, check if there was a Bash error
    // A successful run with no explicit code typically means exit code 0
    const hasBashTool = context.transcript.some(
      (m) => m.tool_use?.name === "Bash" || m.tool_use?.name === "bash"
    );

    if (!hasBashTool) {
      return {
        name: criterion.name,
        grader: "exit-code",
        pass: false,
        score: 0.0,
        reasoning: "No Bash tool invocation found in transcript",
        evidence,
      };
    }

    // Assume success if no error indicators
    foundCode = 0;
  }

  const pass = foundCode === expectedCode;

  return {
    name: criterion.name,
    grader: "exit-code",
    pass,
    score: pass ? 1.0 : 0.0,
    reasoning: pass
      ? `Command exited with expected code ${expectedCode}`
      : `Command exited with code ${foundCode} (expected ${expectedCode})`,
    evidence,
  };
}
