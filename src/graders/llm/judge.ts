/**
 * LLM-as-judge for spec-mode graders.
 * Re-exports from the main judge module for backward compatibility.
 */

export { invokeJudge, formatTranscriptForJudge } from "../../judge.js";

export type { CriterionJudgment } from "../../types.js";
