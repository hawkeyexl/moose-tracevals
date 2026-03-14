import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { tmpDir } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("loadConfig", () => {
  it("no config file returns all defaults", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const config = await loadConfig(tmp.dir);
    assert.equal(config.judge_model, "claude-sonnet-4-6");
    assert.equal(config.output_dir, "./eval-results");
    assert.equal(config.verbose, false);
    assert.equal(config.report, "json");
    assert.equal(config.pass_threshold, 0.7);
  });

  it("valid config: values override defaults", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    await writeFile(join(tmp.dir, ".agent-evals.yaml"), `
judge_model: claude-opus-4-6
output_dir: ./my-results
verbose: true
report: both
pass_threshold: 0.9
`);
    const config = await loadConfig(tmp.dir);
    assert.equal(config.judge_model, "claude-opus-4-6");
    assert.equal(config.output_dir, "./my-results");
    assert.equal(config.verbose, true);
    assert.equal(config.report, "both");
    assert.equal(config.pass_threshold, 0.9);
  });

  it("partial config: unset fields use defaults", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    await writeFile(join(tmp.dir, ".agent-evals.yaml"), `
judge_model: claude-opus-4-6
`);
    const config = await loadConfig(tmp.dir);
    assert.equal(config.judge_model, "claude-opus-4-6");
    assert.equal(config.output_dir, "./eval-results");
    assert.equal(config.verbose, false);
    assert.equal(config.report, "json");
    assert.equal(config.pass_threshold, 0.7);
  });

  it("invalid YAML returns defaults", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    await writeFile(join(tmp.dir, ".agent-evals.yaml"), `:::not valid yaml [[[`);
    const config = await loadConfig(tmp.dir);
    assert.equal(config.judge_model, "claude-sonnet-4-6");
    assert.equal(config.pass_threshold, 0.7);
  });

  it("non-object YAML returns defaults", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    await writeFile(join(tmp.dir, ".agent-evals.yaml"), `just a string`);
    const config = await loadConfig(tmp.dir);
    assert.equal(config.judge_model, "claude-sonnet-4-6");
    assert.equal(config.pass_threshold, 0.7);
  });
});
