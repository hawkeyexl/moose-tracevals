/**
 * trigger-check grader: Verify whether a specific skill/agent was invoked (or not).
 */

import type { Criterion, TrialContext, GraderResult } from "../../types.js";

export async function graderTriggerCheck(
  criterion: Criterion,
  context: TrialContext
): Promise<GraderResult> {
  const config = criterion.config ?? {};
  const skillName = config.skill_name as string | undefined;
  const agentName = config.agent_name as string | undefined;
  const shouldTrigger = config.should_trigger !== false; // default true
  const targetName = skillName ?? agentName ?? "unknown";

  // Search transcript for tool invocations matching the target
  let found = false;
  let evidence: Record<string, unknown> = {};

  for (let i = 0; i < context.transcript.length; i++) {
    const msg = context.transcript[i];

    // Check tool_use blocks
    if (msg.tool_use) {
      const toolName = msg.tool_use.name?.toLowerCase() ?? "";
      const toolInput = msg.tool_use.input ?? {};

      // Skill invocation via Skill tool
      if (skillName && toolName === "skill") {
        const skillArg = (toolInput.skill as string)?.toLowerCase() ?? "";
        if (skillArg.includes(skillName.toLowerCase())) {
          found = true;
          evidence = { tool_use_id: msg.tool_use.id, message_index: i, tool: "Skill", skill: skillArg };
          break;
        }
      }

      // Agent invocation via Agent tool
      if (agentName && toolName === "agent") {
        const desc = (toolInput.description as string)?.toLowerCase() ?? "";
        const prompt = (toolInput.prompt as string)?.toLowerCase() ?? "";
        if (desc.includes(agentName.toLowerCase()) || prompt.includes(agentName.toLowerCase())) {
          found = true;
          evidence = { tool_use_id: msg.tool_use.id, message_index: i, tool: "Agent" };
          break;
        }
      }

      // Direct tool name match
      if (toolName.includes(targetName.toLowerCase())) {
        found = true;
        evidence = { tool_use_id: msg.tool_use.id, message_index: i, tool: toolName };
        break;
      }
    }

    // Check content blocks for tool_use
    if (Array.isArray(msg.content)) {
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (block?.type === "tool_use") {
          const blockName = (block.name as string)?.toLowerCase() ?? "";
          if (skillName && blockName === "skill") {
            const input = block.input as Record<string, unknown> | undefined;
            const skillArg = (input?.skill as string)?.toLowerCase() ?? "";
            if (skillArg.includes(skillName.toLowerCase())) {
              found = true;
              evidence = { tool_use_id: block.id, message_index: i, tool: "Skill", skill: skillArg };
              break;
            }
          }
          if (blockName.includes(targetName.toLowerCase())) {
            found = true;
            evidence = { tool_use_id: block.id, message_index: i, tool: blockName };
            break;
          }
        }
      }
      if (found) break;
    }

    // Check system messages for skill/agent invocation
    if (msg.type === "system" && typeof msg.content === "string") {
      const contentLower = msg.content.toLowerCase();
      if (contentLower.includes(targetName.toLowerCase())) {
        found = true;
        evidence = { message_index: i, type: "system_message" };
        break;
      }
    }
  }

  const pass = shouldTrigger ? found : !found;

  return {
    name: criterion.name,
    grader: "trigger-check",
    pass,
    score: pass ? 1.0 : 0.0,
    reasoning: shouldTrigger
      ? found
        ? `Skill/agent "${targetName}" was invoked as expected`
        : `Skill/agent "${targetName}" was NOT invoked (expected it to trigger)`
      : found
        ? `Skill/agent "${targetName}" was invoked (expected it NOT to trigger)`
        : `Skill/agent "${targetName}" was correctly not invoked`,
    evidence,
  };
}
