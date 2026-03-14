/**
 * Parse JSONL transcripts from Claude Code sessions.
 * Extracts artifact references, invocations, and metadata.
 */

import { readFile } from "node:fs/promises";
import type { ParsedTranscript } from "./types.js";

/**
 * Parse a JSONL transcript file into structured data.
 */
export async function parseTranscriptFile(filePath: string): Promise<ParsedTranscript> {
  const content = await readFile(filePath, "utf-8");
  return parseTranscriptContent(content);
}

/**
 * Parse JSONL content (string) into structured data.
 */
export function parseTranscriptContent(content: string): ParsedTranscript {
  const messages: Record<string, unknown>[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      // Skip non-JSON lines
    }
  }

  return extractFromMessages(messages);
}

function extractFromMessages(messages: Record<string, unknown>[]): ParsedTranscript {
  let cwd = process.cwd();
  let model = "";
  const declared_agents: string[] = [];
  const declared_tools: string[] = [];
  const invoked_skills: string[] = [];
  const spawned_agents: string[] = [];
  const accessed_files: string[] = [];
  let result: ParsedTranscript["result"];

  for (const msg of messages) {
    const type = msg.type as string;

    // System/init message — extract environment info
    if (type === "system" && (msg.subtype === "init" || !msg.subtype)) {
      if (msg.cwd) cwd = msg.cwd as string;
      if (msg.model) model = msg.model as string;

      // Agents list
      if (Array.isArray(msg.agents)) {
        for (const a of msg.agents as Array<Record<string, unknown>>) {
          if (typeof a === "string") declared_agents.push(a);
          else if (a?.name) declared_agents.push(a.name as string);
        }
      }

      // Tools list
      if (Array.isArray(msg.tools)) {
        for (const t of msg.tools) {
          if (typeof t === "string") declared_tools.push(t);
          else if ((t as Record<string, unknown>)?.name) declared_tools.push((t as Record<string, unknown>).name as string);
        }
      }

      // Check for skills in tools or separate field
      if (Array.isArray(msg.skills)) {
        for (const s of msg.skills) {
          if (typeof s === "string") invoked_skills.push(s);
        }
      }
    }

    // Assistant messages — extract tool use
    if (type === "assistant") {
      const message = msg.message as Record<string, unknown> | undefined;
      const contentArr = message?.content ?? msg.content;
      if (Array.isArray(contentArr)) {
        for (const block of contentArr as Array<Record<string, unknown>>) {
          if (block?.type !== "tool_use") continue;
          extractToolInvocation(block, invoked_skills, spawned_agents, accessed_files);
        }
      }
    }

    // Result message
    if (type === "result") {
      result = {
        num_turns: (msg.num_turns as number) ?? 0,
        total_cost_usd: (msg.total_cost_usd as number) ?? 0,
        is_error: (msg.is_error as boolean) ?? false,
        subtype: (msg.subtype as string) ?? "",
      };
    }
  }

  return {
    messages,
    cwd,
    model,
    declared_agents: [...new Set(declared_agents)],
    declared_tools: [...new Set(declared_tools)],
    invoked_skills: [...new Set(invoked_skills)],
    spawned_agents: [...new Set(spawned_agents)],
    accessed_files: [...new Set(accessed_files)],
    result,
  };
}

function extractToolInvocation(
  block: Record<string, unknown>,
  skills: string[],
  agents: string[],
  files: string[]
): void {
  const name = block.name as string;
  const input = (block.input as Record<string, unknown>) ?? {};

  switch (name) {
    case "Skill":
      if (input.skill) skills.push(input.skill as string);
      break;

    case "Agent":
      if (input.description) agents.push(input.description as string);
      if (input.prompt) {
        // Try to extract agent type from prompt
        const match = (input.prompt as string).match(/subagent_type[=:]\s*["']?(\w+)/i);
        if (match) agents.push(match[1]);
      }
      break;

    case "Read":
    case "Write":
    case "Edit":
      if (input.file_path) files.push(input.file_path as string);
      break;

    case "Glob":
    case "Grep":
      // Track patterns but not as accessed files
      break;
  }
}
