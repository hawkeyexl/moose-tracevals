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

/**
 * Whether the session was *offered* an artifact, and whether it used it
 * (ADR 01016). The three states are kept apart deliberately: "offered and not
 * used" is a judgement call, while "not offered" is a configuration bug and
 * collapsing them sends a reader looking in the wrong place.
 *
 * `unknown` is not a fourth shade of the same thing — it means the trace
 * carried no roster at all, which older sessions and stream transcripts never
 * do (ADR 01003).
 */
export type ArtifactAvailability =
  | "offered-and-used"
  | "offered-not-used"
  | "not-offered"
  | "unknown";

/** One row of the report's artifact-coverage table. */
export interface CoverageEntry {
  ref: string;
  kind: ArtifactType;
  resolved: boolean;
  path?: string;
  /** Paths that were checked, for unresolved refs. */
  tried: string[];
  note?: string;
  /**
   * Roster state. Absent for `project-rules`, which is not something a session
   * is offered — it is always in force. Never affects an eval outcome or the
   * exit code: this is an observation.
   */
  availability?: ArtifactAvailability;
  /**
   * The artifact on disk is newer than the session, so the evals being run may
   * not be the instructions the session followed (ADR 01021). A heuristic —
   * mtime is not content identity — and a warning only: it never becomes an
   * eval outcome and never changes the exit code. Absent when the trace
   * records no end time, since then there is nothing to compare against.
   */
  stale?: boolean;
  /** The artifact's mtime, ISO-8601. Present whenever `stale` is. */
  modifiedAt?: string;
}

/** Roster tallies for one artifact kind. */
export interface AvailabilityCounts {
  offered: number;
  used: number;
  unused: number;
}

/**
 * The offered-versus-used summary that accompanies the coverage table. Counts
 * by default; `listed` says whether the offered-but-unused rows were included
 * in `coverage` as well, which `--report-unused-artifacts` turns on.
 */
export interface AvailabilityReport {
  /** False means unknown — never "nothing was offered". */
  recorded: boolean;
  skills: AvailabilityCounts;
  agents: AvailabilityCounts;
  listed: boolean;
}

export interface ResolvedArtifacts {
  artifacts: ResolvedArtifact[];
  coverage: CoverageEntry[];
  availability: AvailabilityReport;
  warnings: string[];
}
