/**
 * The workflow files are the only code here that nothing else type-checks,
 * lints, or runs locally — a malformed one fails on GitHub and nowhere else.
 *
 * This exists because it happened: a `node -e` script inside ci.yml joined an
 * array on a literal NUL byte. NUL is illegal in YAML content, so GitHub
 * rejected the whole file and the CI workflow failed in 0s — while every other
 * workflow on the branch went green, which reads as a passing build unless you
 * notice the missing check.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const dir = fileURLToPath(new URL("../../.github/workflows", import.meta.url));
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

describe("GitHub workflow files", () => {
  it("finds the workflows", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s parses as YAML and declares jobs", (name) => {
    const doc = parse(readFileSync(`${dir}/${name}`, "utf-8")) as {
      jobs?: Record<string, unknown>;
    };
    expect(doc, `${name} parsed to nothing`).toBeTruthy();
    expect(Object.keys(doc.jobs ?? {}).length, `${name} declares no jobs`)
      .toBeGreaterThan(0);
  });

  it.each(files)("%s carries no control characters", (name) => {
    // Tab, LF and CR are the only ones YAML allows; anything else — a stray
    // NUL from an escape written raw, most likely — makes the file unparseable
    // on GitHub while looking fine in an editor.
    const text = readFileSync(`${dir}/${name}`, "utf-8");
    // eslint-disable-next-line no-control-regex
    const offenders = [...text.matchAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)];
    expect(
      offenders.map((m) => `offset ${m.index}: U+${m[0].codePointAt(0)!.toString(16).padStart(4, "0")}`),
      `${name} contains control characters illegal in YAML`,
    ).toEqual([]);
  });
});
