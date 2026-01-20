import { describe, expect, test } from "bun:test";
import { getFixturePath, parseJsonOutput, runCli } from "../../helpers/run-cli.ts";

interface DetectResult {
  packageManager: string;
  lockfile: string | null;
  typescript: boolean;
  biome: boolean;
  prettier: boolean;
  testRunner: string | null;
  coverage: boolean;
  ci: string | null;
}

describe("upkeep detect", () => {
  describe("package manager detection", () => {
    test("detects pnpm project", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("pnpm-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.packageManager).toBe("pnpm");
      expect(result.lockfile).toBe("pnpm-lock.yaml");
    });

    test("detects npm project", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("npm-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.packageManager).toBe("npm");
      expect(result.lockfile).toBe("package-lock.json");
    });

    test("detects yarn project", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("yarn-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.packageManager).toBe("yarn");
      expect(result.lockfile).toBe("yarn.lock");
    });

    test("detects bun project", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("bun-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.packageManager).toBe("bun");
      expect(result.lockfile).toBe("bun.lock");
    });

    test("handles multiple lockfiles by selecting highest priority", async () => {
      const { stdout, stderr, exitCode } = await runCli(
        ["detect"],
        getFixturePath("multiple-lockfiles")
      );

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      // bun.lock should win over yarn.lock
      expect(result.packageManager).toBe("bun");
      expect(result.lockfile).toBe("bun.lock");

      // Should warn about multiple lockfiles
      expect(stderr).toContain("Multiple lockfiles detected");
    });

    test("detects corepack project without lockfile", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("corepack-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.packageManager).toBe("pnpm");
      expect(result.lockfile).toBeNull();
    });

    test("falls back to npm when no lockfile", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("no-lockfile"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.packageManager).toBe("npm");
      expect(result.lockfile).toBeNull();
    });
  });

  describe("tooling detection", () => {
    test("detects TypeScript when tsconfig.json exists", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("sample-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.typescript).toBe(true);
    });

    test("detects no TypeScript when tsconfig.json is missing", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("npm-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.typescript).toBe(false);
    });

    test("detects Prettier configuration", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("sample-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.prettier).toBe(true);
    });

    test("detects test runner from config or package.json", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("sample-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.testRunner).toBe("vitest");
    });

    test("detects coverage configuration", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("sample-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.coverage).toBe(true);
    });

    test("detects GitHub Actions CI", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("sample-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);
      expect(result.ci).toBe("github-actions");
    });
  });

  describe("help flag", () => {
    test("shows help with --help flag", async () => {
      const { stdout, exitCode } = await runCli(["detect", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("upkeep detect");
      expect(stdout).toContain("Detect project configuration");
    });

    test("shows help with -h flag", async () => {
      const { stdout, exitCode } = await runCli(["detect", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("upkeep detect");
    });
  });

  describe("output format", () => {
    test("outputs valid JSON", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("sample-project"));

      expect(exitCode).toBe(0);

      // Should not throw
      const result = JSON.parse(stdout);
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });

    test("includes all expected fields", async () => {
      const { stdout, exitCode } = await runCli(["detect"], getFixturePath("sample-project"));

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<DetectResult>(stdout);

      // All fields should be present
      expect("packageManager" in result).toBe(true);
      expect("lockfile" in result).toBe(true);
      expect("typescript" in result).toBe(true);
      expect("biome" in result).toBe(true);
      expect("prettier" in result).toBe(true);
      expect("testRunner" in result).toBe(true);
      expect("coverage" in result).toBe(true);
      expect("ci" in result).toBe(true);
    });
  });
});
