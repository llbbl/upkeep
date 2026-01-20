import { describe, expect, test } from "bun:test";
import { getFixturePath, runCli } from "../../helpers/run-cli.ts";

interface AuditResult {
  vulnerabilities: Array<{
    package: string;
    severity: "critical" | "high" | "moderate" | "low" | "info";
    title: string;
    path: string;
    fixAvailable: boolean;
    fixVersion: string | null;
  }>;
  summary: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    total: number;
  };
}

describe("upkeep audit", () => {
  describe("help flag", () => {
    test("shows help with --help flag", async () => {
      const { stdout, exitCode } = await runCli(["audit", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("upkeep audit");
      expect(stdout).toContain("Security-focused audit");
      expect(stdout).toContain("vulnerabilities");
    });

    test("shows help with -h flag", async () => {
      const { stdout, exitCode } = await runCli(["audit", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("upkeep audit");
    });
  });

  // Note: The following tests require running actual package manager audit
  // commands which can be slow and require network access. They are skipped
  // by default but can be enabled for integration testing by removing .skip.
  describe.skip("integration tests (require package manager)", () => {
    describe("output format", () => {
      test("outputs valid JSON", async () => {
        const { stdout } = await runCli(["audit"], getFixturePath("sample-project"));

        // Should output valid JSON regardless of vulnerabilities found
        const result = JSON.parse(stdout);
        expect(result).toBeDefined();
        expect(typeof result).toBe("object");
      });

      test("includes vulnerabilities array", async () => {
        const { stdout } = await runCli(["audit"], getFixturePath("sample-project"));

        const result = JSON.parse(stdout) as AuditResult;
        expect(Array.isArray(result.vulnerabilities)).toBe(true);
      });

      test("includes summary object", async () => {
        const { stdout } = await runCli(["audit"], getFixturePath("sample-project"));

        const result = JSON.parse(stdout) as AuditResult;
        expect(result.summary).toBeDefined();
        expect(typeof result.summary.critical).toBe("number");
        expect(typeof result.summary.high).toBe("number");
        expect(typeof result.summary.moderate).toBe("number");
        expect(typeof result.summary.low).toBe("number");
        expect(typeof result.summary.total).toBe("number");
      });

      test("summary counts are non-negative", async () => {
        const { stdout } = await runCli(["audit"], getFixturePath("sample-project"));

        const result = JSON.parse(stdout) as AuditResult;
        expect(result.summary.critical).toBeGreaterThanOrEqual(0);
        expect(result.summary.high).toBeGreaterThanOrEqual(0);
        expect(result.summary.moderate).toBeGreaterThanOrEqual(0);
        expect(result.summary.low).toBeGreaterThanOrEqual(0);
        expect(result.summary.total).toBeGreaterThanOrEqual(0);
      });
    });

    describe("vulnerability structure", () => {
      test("vulnerabilities have required fields when present", async () => {
        const { stdout } = await runCli(["audit"], getFixturePath("sample-project"));

        const result = JSON.parse(stdout) as AuditResult;

        // If there are vulnerabilities, check their structure
        for (const vuln of result.vulnerabilities) {
          expect(typeof vuln.package).toBe("string");
          expect(["critical", "high", "moderate", "low", "info"]).toContain(vuln.severity);
          expect(typeof vuln.title).toBe("string");
          expect(typeof vuln.path).toBe("string");
          expect(typeof vuln.fixAvailable).toBe("boolean");
          expect(vuln.fixVersion === null || typeof vuln.fixVersion === "string").toBe(true);
        }
      });
    });

    describe("error handling", () => {
      test("handles missing package.json gracefully", async () => {
        const { stdout } = await runCli(["audit"], "/tmp");

        // Should still output valid JSON structure
        const result = JSON.parse(stdout);
        expect(result).toBeDefined();
      });

      test("handles project without node_modules", async () => {
        // Fixture projects don't have node_modules installed
        const { stdout } = await runCli(["audit"], getFixturePath("sample-project"));

        // Should return valid JSON with empty or populated results
        const result = JSON.parse(stdout) as AuditResult;
        expect(result.vulnerabilities).toBeDefined();
        expect(result.summary).toBeDefined();
      });
    });

    describe("different package managers", () => {
      test("works with pnpm project", async () => {
        const { stdout } = await runCli(["audit"], getFixturePath("pnpm-project"));

        const result = JSON.parse(stdout) as AuditResult;
        expect(result.vulnerabilities).toBeDefined();
        expect(result.summary).toBeDefined();
      });

      test("works with npm project", async () => {
        const { stdout } = await runCli(["audit"], getFixturePath("npm-project"));

        const result = JSON.parse(stdout) as AuditResult;
        expect(result.vulnerabilities).toBeDefined();
        expect(result.summary).toBeDefined();
      });
    });
  });
});
