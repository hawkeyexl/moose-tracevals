/** Resolved instruction artifacts and coverage reporting. */

export type ArtifactType = "skill" | "agent" | "project-rules";

export type ArtifactOrigin = "project" | "user" | "plugin";

export interface ResolvedArtifact {
  /** Reference name (skill name, subagent_type, or rules filename). */
  name: string;
  type: ArtifactType;
  /** Absolute path on disk. */
  path: string;
  content: string;
  origin: ArtifactOrigin;
}

/** One row of the report's artifact-coverage table. */
export interface CoverageEntry {
  ref: string;
  kind: ArtifactType;
  resolved: boolean;
  path?: string;
  /** Paths that were checked, for unresolved refs. */
  tried: string[];
  note?: string;
}

export interface ResolvedArtifacts {
  artifacts: ResolvedArtifact[];
  coverage: CoverageEntry[];
  warnings: string[];
}
