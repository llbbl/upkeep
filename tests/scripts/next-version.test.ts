import "../setup/require-sandbox.test.ts";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const SCRIPT_PATH = join(import.meta.dir, "../../scripts/next-version.sh");

async function runScript(args: readonly string[], commits: readonly string[] = []) {
  const proc = Bun.spawn(["bash", SCRIPT_PATH, ...args], {
    stdin: new Blob([commits.length ? `${commits.join("\0\n")}\0` : ""]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("next-version.sh", () => {
  test.each([
    { name: "fix", commits: ["fix: x"], next: "0.6.4", warnings: [] },
    { name: "scoped chore", commits: ["chore(deps): x"], next: "0.6.4", warnings: [] },
    { name: "feature", commits: ["feat: x"], next: "0.7.0", warnings: [] },
    { name: "scoped feature", commits: ["feat(cli): x"], next: "0.7.0", warnings: [] },
    { name: "breaking feature", commits: ["feat!: x"], next: "0.7.0", warnings: ["feat!: x"] },
    { name: "breaking fix", commits: ["fix!: x"], next: "0.7.0", warnings: ["fix!: x"] },
    {
      name: "escape percent and carriage return in warning",
      commits: ["fix!: 50% done\r"],
      next: "0.7.0",
      warnings: ["fix!: 50%25 done%0D"],
    },
    {
      name: "scoped breaking refactor",
      commits: ["refactor(x)!: x"],
      next: "0.7.0",
      warnings: ["refactor(x)!: x"],
    },
    {
      name: "arbitrary breaking type",
      commits: ["docs(api)!: x"],
      next: "0.7.0",
      warnings: ["docs(api)!: x"],
    },
    {
      name: "breaking change footer",
      commits: ["fix: x\n\nBody text.\n\nBREAKING CHANGE: y"],
      next: "0.7.0",
      warnings: ["fix: x"],
    },
    {
      name: "hyphenated breaking footer",
      commits: ["fix: x\n\nBREAKING-CHANGE: y"],
      next: "0.7.0",
      warnings: ["fix: x"],
    },
    {
      name: "all breaking forms together",
      commits: [
        "feat!: x\n\nBREAKING CHANGE: y",
        "fix!: x",
        "refactor(x)!: x",
        "fix: footer\n\nBREAKING CHANGE: y",
        "chore: footer\n\nBREAKING-CHANGE: y",
      ],
      next: "0.7.0",
      warnings: ["feat!: x", "fix!: x", "refactor(x)!: x", "fix: footer", "chore: footer"],
    },
    {
      name: "preserve major one",
      latest: "v1.4.2",
      commits: ["fix!: x", "chore: x\n\nBREAKING-CHANGE: y"],
      next: "1.5.0",
      warnings: ["fix!: x", "chore: x"],
    },
    {
      name: "breaking text within subject",
      commits: ["fix: mention BREAKING CHANGE: in docs"],
      next: "0.6.4",
      warnings: [],
    },
    {
      name: "ordinary body text",
      commits: ["fix: x\n\nMention BREAKING CHANGE: and feat: in prose."],
      next: "0.6.4",
      warnings: [],
    },
    {
      name: "feature after a patch record",
      commits: ["fix: x\n\nBody text.", "feat(cli): y"],
      next: "0.7.0",
      warnings: [],
    },
    { name: "empty history", commits: [], next: "0.6.4", warnings: [] },
  ])("$name", async ({ commits, next, warnings, latest }) => {
    const result = await runScript([latest ?? "v0.6.3"], commits);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`next=v${next}\nversion=${next}\n`);
    expect(result.stderr).toBe(
      warnings
        .map((subject) => `::warning::Breaking commit maps to a minor release: ${subject}\n`)
        .join("")
    );
  });

  test.each([
    { name: "missing argument", args: [] },
    { name: "non-version tag", args: ["latest"] },
    { name: "missing v prefix", args: ["1.2.3"] },
    { name: "incomplete tag", args: ["v1.2"] },
    { name: "prerelease tag", args: ["v1.2.3-beta"] },
  ])("rejects $name", async ({ args }) => {
    const result = await runScript(args);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Expected one latest tag matching vX.Y.Z.");
  });
});
