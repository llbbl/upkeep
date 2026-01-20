import { describe, expect, test } from "bun:test";
import { getFixturePath, runCli } from "../../helpers/run-cli.ts";

interface DepsResult {
  total: number;
  outdated: number;
  major: number;
  minor: number;
  patch: number;
  security: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
  } | null;
  packages: Array<{
    name: string;
    current: string;
    latest: string;
    updateType: "major" | "minor" | "patch";
    isDevDep: boolean;
  }>;
}

interface DepsOutdatedResult {
  outdated: number;
  major: number;
  minor: number;
  patch: number;
  packages: DepsResult["packages"];
}

interface DepsErrorResult {
  error: string;
}

describe("upkeep deps", () => {
  describe("help flag", () => {
    test("shows help with --help flag", async () => {
      const { stdout, exitCode } = await runCli(["deps", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("upkeep deps");
      expect(stdout).toContain("Analyze dependency health");
      expect(stdout).toContain("--outdated");
      expect(stdout).toContain("--security");
    });

    test("shows help with -h flag", async () => {
      const { stdout, exitCode } = await runCli(["deps", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("upkeep deps");
    });
  });

  // Note: The following tests require running actual package manager commands
  // which can be slow. They are skipped by default but can be enabled for
  // integration testing by removing the .skip.
  describe.skip("integration tests (require package manager)", () => {
    describe("output format", () => {
      test("outputs valid JSON", async () => {
        const { stdout } = await runCli(["deps"], getFixturePath("sample-project"));

        // Command may fail if no node_modules, but should still output JSON
        const result = JSON.parse(stdout);
        expect(result).toBeDefined();
        expect(typeof result).toBe("object");
      });

      test("includes expected fields in output", async () => {
        const { stdout } = await runCli(["deps"], getFixturePath("sample-project"));

        const result = JSON.parse(stdout) as DepsResult | DepsErrorResult;

        // Either has deps analysis fields or error field
        if ("error" in result) {
          expect(typeof result.error).toBe("string");
        } else {
          expect("total" in result).toBe(true);
          expect("outdated" in result).toBe(true);
          expect("packages" in result).toBe(true);
        }
      });
    });

    describe("--outdated flag", () => {
      test("only shows outdated-related fields", async () => {
        const { stdout } = await runCli(["deps", "--outdated"], getFixturePath("sample-project"));

        const result = JSON.parse(stdout) as DepsOutdatedResult | DepsErrorResult;

        if (!("error" in result)) {
          // Should not include 'total' field when --outdated is set
          expect("total" in result).toBe(false);
          expect("outdated" in result).toBe(true);
          expect("major" in result).toBe(true);
          expect("minor" in result).toBe(true);
          expect("patch" in result).toBe(true);
          expect("packages" in result).toBe(true);
        }
      });
    });

    describe("error handling", () => {
      test("returns JSON error when package.json is missing", async () => {
        // Using a path that doesn't have package.json
        const { stdout } = await runCli(["deps"], "/tmp");

        // Should still output JSON (even on error)
        const result = JSON.parse(stdout) as DepsErrorResult;
        expect("error" in result || "total" in result).toBe(true);
      });

      test("handles project without node_modules gracefully", async () => {
        // Fixture projects don't have node_modules installed
        const { stdout } = await runCli(["deps"], getFixturePath("sample-project"));

        // Should output valid JSON regardless of success/failure
        const result = JSON.parse(stdout);
        expect(result).toBeDefined();
      });
    });

    describe("package counting", () => {
      test("counts packages from package.json", async () => {
        const { stdout } = await runCli(["deps"], getFixturePath("sample-project"));

        const result = JSON.parse(stdout) as DepsResult | DepsErrorResult;

        if (!("error" in result)) {
          // sample-project has 2 devDependencies
          expect(result.total).toBe(2);
        }
      });
    });
  });
});
