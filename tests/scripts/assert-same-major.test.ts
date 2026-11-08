import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const SCRIPT_PATH = join(import.meta.dir, "../../scripts/assert-same-major.sh");

describe("assert-same-major.sh", () => {
  test.each([
    { name: "equal major zero", args: ["v0.6.3", "v0.7.0"], exitCode: 0 },
    { name: "equal major one", args: ["v1.4.2", "v1.5.0"], exitCode: 0 },
    { name: "identical tags", args: ["v1.4.2", "v1.4.2"], exitCode: 0 },
    { name: "zero-padded equal majors", args: ["v001.4.2", "v1.5.0"], exitCode: 0 },
    { name: "major zero increase", args: ["v0.6.3", "v1.0.0"], exitCode: 1 },
    { name: "major one increase", args: ["v1.4.2", "v2.0.0"], exitCode: 1 },
    { name: "major decrease", args: ["v1.4.2", "v0.7.0"], exitCode: 1 },
    {
      name: "large unequal majors",
      args: ["v0.6.3", "v18446744073709551616.0.0"],
      exitCode: 1,
    },
    { name: "no arguments", args: [], exitCode: 1 },
    { name: "missing next tag", args: ["v0.6.3"], exitCode: 1 },
    { name: "empty latest tag", args: ["", "v1.0.0"], exitCode: 1 },
    { name: "empty next tag", args: ["v0.6.3", ""], exitCode: 1 },
    { name: "both tags empty", args: ["", ""], exitCode: 1 },
    { name: "malformed latest tag", args: ["v0.broken", "v0.7.0"], exitCode: 1 },
    { name: "malformed next tag", args: ["v0.6.3", "v0.broken"], exitCode: 1 },
    { name: "latest missing v prefix", args: ["0.6.3", "v0.7.0"], exitCode: 1 },
    { name: "next missing v prefix", args: ["v0.6.3", "0.7.0"], exitCode: 1 },
  ])("$name", async ({ args, exitCode }) => {
    const proc = Bun.spawn(["bash", SCRIPT_PATH, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, actualExitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(actualExitCode).toBe(exitCode);
    expect(stdout).toBe("");
    if (exitCode === 0) {
      expect(stderr).toBe("");
    } else {
      expect(stderr.length).toBeGreaterThan(0);
    }
  });
});
