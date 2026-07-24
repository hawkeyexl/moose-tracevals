/** Shared result model and errors for agentevals. */

/** Operational error: bad usage, unreadable input, unknown format. Exits 2. */
export class AgentevalsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentevalsError";
  }
}
