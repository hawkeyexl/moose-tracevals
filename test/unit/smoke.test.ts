import { describe, expect, it } from "vitest";
import { AgentevalsError } from "../../src/types.js";

describe("package skeleton", () => {
  it("exposes AgentevalsError with the operational-error name", () => {
    const err = new AgentevalsError("boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AgentevalsError");
    expect(err.message).toBe("boom");
  });
});
