import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  appendHistory,
  loadHistory,
  compareToLast,
  buildSpecHistoryEntry,
  buildTranscriptHistoryEntry,
} from "../src/history.js";
import type { HistoryEntry } from "../src/types.js";
import { tmpDir } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    mode: "spec",
    source: "test.yaml",
    summary: { total: 10, passed: 8, failed: 2, score: 0.8, cost_usd: 0.10 },
    per_criterion: {
      "check-a": { pass: true, score: 1.0 },
      "check-b": { pass: true, score: 0.9 },
    },
    ...overrides,
  };
}

describe("appendHistory + loadHistory", () => {
  it("round-trips correctly", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const entry = makeEntry();
    await appendHistory(entry, tmp.dir);
    const loaded = await loadHistory(tmp.dir);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].mode, entry.mode);
    assert.equal(loaded[0].summary.total, entry.summary.total);
    assert.deepStrictEqual(loaded[0].per_criterion, entry.per_criterion);
  });
});

describe("loadHistory", () => {
  it("empty directory returns empty array", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const loaded = await loadHistory(tmp.dir);
    assert.deepStrictEqual(loaded, []);
  });

  it("malformed lines are skipped", async () => {
    const tmp = await tmpDir();
    cleanup = tmp.cleanup;
    const { writeFile: wf, mkdir: mk } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mk(tmp.dir, { recursive: true });
    const content = [
      "not json",
      JSON.stringify(makeEntry()),
      "{ broken",
    ].join("\n");
    await wf(join(tmp.dir, "history.jsonl"), content);
    const loaded = await loadHistory(tmp.dir);
    assert.equal(loaded.length, 1);
  });
});

describe("compareToLast", () => {
  it("empty history returns undefined", () => {
    const result = compareToLast(makeEntry(), []);
    assert.equal(result, undefined);
  });

  it("regression: pass->fail detected", () => {
    const prev = makeEntry({
      per_criterion: { "check-a": { pass: true, score: 1.0 } },
      summary: { total: 1, passed: 1, failed: 0, score: 1.0, cost_usd: 0.01 },
    });
    const current = makeEntry({
      per_criterion: { "check-a": { pass: false, score: 0.3 } },
      summary: { total: 1, passed: 0, failed: 1, score: 0.3, cost_usd: 0.01 },
    });
    const result = compareToLast(current, [prev]);
    assert.ok(result);
    assert.equal(result!.regressions.length, 1);
    assert.equal(result!.regressions[0].criterion, "check-a");
    assert.equal(result!.regressions[0].was, 1.0);
    assert.equal(result!.regressions[0].now, 0.3);
  });

  it("improvement: fail->pass detected", () => {
    const prev = makeEntry({
      per_criterion: { "check-a": { pass: false, score: 0.2 } },
      summary: { total: 1, passed: 0, failed: 1, score: 0.2, cost_usd: 0.01 },
    });
    const current = makeEntry({
      per_criterion: { "check-a": { pass: true, score: 1.0 } },
      summary: { total: 1, passed: 1, failed: 0, score: 1.0, cost_usd: 0.01 },
    });
    const result = compareToLast(current, [prev]);
    assert.ok(result);
    assert.equal(result!.improvements.length, 1);
    assert.equal(result!.improvements[0].criterion, "check-a");
  });

  it("new criteria listed in new_criteria", () => {
    const prev = makeEntry({
      per_criterion: { "check-a": { pass: true, score: 1.0 } },
    });
    const current = makeEntry({
      per_criterion: {
        "check-a": { pass: true, score: 1.0 },
        "check-new": { pass: true, score: 0.9 },
      },
    });
    const result = compareToLast(current, [prev]);
    assert.ok(result);
    assert.ok(result!.new_criteria.includes("check-new"));
  });

  it("removed criteria listed in removed_criteria", () => {
    const prev = makeEntry({
      per_criterion: {
        "check-a": { pass: true, score: 1.0 },
        "check-old": { pass: true, score: 0.8 },
      },
    });
    const current = makeEntry({
      per_criterion: { "check-a": { pass: true, score: 1.0 } },
    });
    const result = compareToLast(current, [prev]);
    assert.ok(result);
    assert.ok(result!.removed_criteria.includes("check-old"));
  });

  it("score_delta is correct", () => {
    const prev = makeEntry({
      summary: { total: 10, passed: 8, failed: 2, score: 0.8, cost_usd: 0.10 },
    });
    const current = makeEntry({
      summary: { total: 10, passed: 9, failed: 1, score: 0.9, cost_usd: 0.12 },
    });
    const result = compareToLast(current, [prev]);
    assert.ok(result);
    assert.ok(Math.abs(result!.score_delta - 0.1) < 0.001);
  });
});

describe("buildSpecHistoryEntry", () => {
  it("correct shape", () => {
    const entry = buildSpecHistoryEntry("test.yaml", 10, 8, 0.5, { "a": { pass: true, score: 1.0 } });
    assert.equal(entry.mode, "spec");
    assert.equal(entry.source, "test.yaml");
    assert.equal(entry.summary.total, 10);
    assert.equal(entry.summary.passed, 8);
    assert.equal(entry.summary.failed, 2);
    assert.ok(Math.abs(entry.summary.score - 0.8) < 0.001);
    assert.equal(entry.summary.cost_usd, 0.5);
    assert.ok(entry.timestamp);
  });
});

describe("buildTranscriptHistoryEntry", () => {
  it("correct shape", () => {
    const entry = buildTranscriptHistoryEntry("transcript", "file.jsonl", 5, 4, 0.85, 0.02, { "b": { pass: true, score: 0.9 } });
    assert.equal(entry.mode, "transcript");
    assert.equal(entry.source, "file.jsonl");
    assert.equal(entry.summary.total, 5);
    assert.equal(entry.summary.passed, 4);
    assert.equal(entry.summary.failed, 1);
    assert.equal(entry.summary.score, 0.85);
    assert.equal(entry.summary.cost_usd, 0.02);
  });
});
