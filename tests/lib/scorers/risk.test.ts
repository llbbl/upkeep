import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { assessRisk, internals, type RiskLevel } from "../../../src/lib/scorers/risk.ts";
import * as execModule from "../../../src/lib/utils/exec.ts";

const {
  cleanVersionString,
  scoreUpdateType,
  scoreUsageScope,
  scoreCriticalPaths,
  scoreTestCoverage,
  detectCriticalPaths,
  getRiskLevel,
  generateRecommendations,
  hasTestFile,
  calculateTestCoverage,
} = internals;

// Path to test fixtures
const FIXTURES_PATH = `${import.meta.dir}/../../fixtures`;
const RISK_FIXTURES_PATH = `${FIXTURES_PATH}/risk-test-project`;

describe("risk scorer", () => {
  describe("cleanVersionString", () => {
    it("removes caret prefix", () => {
      expect(cleanVersionString("^1.2.3")).toBe("1.2.3");
    });

    it("removes tilde prefix", () => {
      expect(cleanVersionString("~1.2.3")).toBe("1.2.3");
    });

    it("removes >= prefix", () => {
      expect(cleanVersionString(">=1.2.3")).toBe("1.2.3");
    });

    it("removes complex range prefixes", () => {
      expect(cleanVersionString(">=1.2.3")).toBe("1.2.3");
      expect(cleanVersionString("<1.2.3")).toBe("1.2.3");
    });

    it("leaves clean versions unchanged", () => {
      expect(cleanVersionString("1.2.3")).toBe("1.2.3");
    });

    it("handles version with v prefix", () => {
      expect(cleanVersionString("v1.2.3")).toBe("v1.2.3");
    });
  });

  describe("scoreUpdateType", () => {
    it("scores major update at 40 points", () => {
      const result = scoreUpdateType("major");
      expect(result.score).toBe(40);
      expect(result.reason).toBe("Major version bump");
    });

    it("scores minor update at 15 points", () => {
      const result = scoreUpdateType("minor");
      expect(result.score).toBe(15);
      expect(result.reason).toBe("Minor version bump");
    });

    it("scores patch update at 5 points", () => {
      const result = scoreUpdateType("patch");
      expect(result.score).toBe(5);
      expect(result.reason).toBe("Patch version bump");
    });

    it("scores no update at 0 points", () => {
      const result = scoreUpdateType("none");
      expect(result.score).toBe(0);
      expect(result.reason).toBe("No version change");
    });
  });

  describe("scoreUsageScope", () => {
    it("scores 0 files at 0 points", () => {
      const result = scoreUsageScope(0);
      expect(result.score).toBe(0);
      expect(result.reason).toBe("Not used in any files");
    });

    it("scores 1 file at 10 points", () => {
      const result = scoreUsageScope(1);
      expect(result.score).toBe(10);
      expect(result.reason).toBe("Used in 1 file");
    });

    it("scores 5 files at 10 points", () => {
      const result = scoreUsageScope(5);
      expect(result.score).toBe(10);
      expect(result.reason).toBe("Used in 5 files");
    });

    it("scores 6 files at 20 points", () => {
      const result = scoreUsageScope(6);
      expect(result.score).toBe(20);
      expect(result.reason).toBe("Used in 6 files");
    });

    it("scores 20 files at 20 points", () => {
      const result = scoreUsageScope(20);
      expect(result.score).toBe(20);
      expect(result.reason).toBe("Used in 20 files");
    });

    it("scores 21+ files at 30 points", () => {
      const result = scoreUsageScope(21);
      expect(result.score).toBe(30);
      expect(result.reason).toBe("Used in 21 files");
    });

    it("scores 100 files at 30 points", () => {
      const result = scoreUsageScope(100);
      expect(result.score).toBe(30);
      expect(result.reason).toBe("Used in 100 files");
    });
  });

  describe("detectCriticalPaths", () => {
    it("detects api routes", () => {
      const result = detectCriticalPaths(["src/api/users.ts"]);
      expect(result.hasApiRoutes).toBe(true);
      expect(result.hasMiddleware).toBe(false);
      expect(result.hasAuth).toBe(false);
    });

    it("detects routes directory", () => {
      const result = detectCriticalPaths(["src/routes/home.ts"]);
      expect(result.hasApiRoutes).toBe(true);
    });

    it("detects middleware files", () => {
      const result = detectCriticalPaths(["src/middleware.ts"]);
      expect(result.hasMiddleware).toBe(true);
    });

    it("detects auth files", () => {
      const result = detectCriticalPaths(["src/auth/login.ts"]);
      expect(result.hasAuth).toBe(true);
    });

    it("detects multiple critical paths", () => {
      const result = detectCriticalPaths([
        "src/api/users.ts",
        "src/middleware.ts",
        "src/auth/login.ts",
      ]);
      expect(result.hasApiRoutes).toBe(true);
      expect(result.hasMiddleware).toBe(true);
      expect(result.hasAuth).toBe(true);
    });

    it("returns all false for non-critical paths", () => {
      const result = detectCriticalPaths(["src/utils.ts", "src/helpers.ts"]);
      expect(result.hasApiRoutes).toBe(false);
      expect(result.hasMiddleware).toBe(false);
      expect(result.hasAuth).toBe(false);
    });

    it("handles empty array", () => {
      const result = detectCriticalPaths([]);
      expect(result.hasApiRoutes).toBe(false);
      expect(result.hasMiddleware).toBe(false);
      expect(result.hasAuth).toBe(false);
    });
  });

  describe("scoreCriticalPaths", () => {
    it("scores 0 for non-critical paths", () => {
      const result = scoreCriticalPaths(["src/utils.ts"]);
      expect(result.score).toBe(0);
      expect(result.reason).toBe("Not used in critical paths");
    });

    it("scores 10 for API routes", () => {
      const result = scoreCriticalPaths(["src/api/users.ts"]);
      expect(result.score).toBe(10);
      expect(result.reason).toContain("API routes");
    });

    it("scores 5 for middleware", () => {
      const result = scoreCriticalPaths(["src/middleware.ts"]);
      expect(result.score).toBe(5);
      expect(result.reason).toContain("middleware");
    });

    it("scores 5 for auth", () => {
      const result = scoreCriticalPaths(["src/auth/login.ts"]);
      expect(result.score).toBe(5);
      expect(result.reason).toContain("auth");
    });

    it("caps score at 20 for all critical paths", () => {
      const result = scoreCriticalPaths([
        "src/api/users.ts",
        "src/middleware.ts",
        "src/auth/login.ts",
      ]);
      expect(result.score).toBe(20);
      expect(result.reason).toContain("API routes");
      expect(result.reason).toContain("middleware");
      expect(result.reason).toContain("auth");
    });
  });

  describe("scoreTestCoverage", () => {
    it("scores 0 for 51%+ coverage", () => {
      const result = scoreTestCoverage(51);
      expect(result.score).toBe(0);
      expect(result.reason).toBe("51% of importing files have tests");
    });

    it("scores 0 for 100% coverage", () => {
      const result = scoreTestCoverage(100);
      expect(result.score).toBe(0);
      expect(result.reason).toBe("100% of importing files have tests");
    });

    it("scores 5 for 1-50% coverage", () => {
      const result = scoreTestCoverage(50);
      expect(result.score).toBe(5);
      expect(result.reason).toBe("50% of importing files have tests");
    });

    it("scores 5 for 1% coverage", () => {
      const result = scoreTestCoverage(1);
      expect(result.score).toBe(5);
      expect(result.reason).toBe("1% of importing files have tests");
    });

    it("scores 10 for 0% coverage", () => {
      const result = scoreTestCoverage(0);
      expect(result.score).toBe(10);
      expect(result.reason).toBe("No importing files have tests");
    });
  });

  describe("getRiskLevel", () => {
    it("returns low for 0-25", () => {
      expect(getRiskLevel(0)).toBe("low");
      expect(getRiskLevel(25)).toBe("low");
    });

    it("returns medium for 26-50", () => {
      expect(getRiskLevel(26)).toBe("medium");
      expect(getRiskLevel(50)).toBe("medium");
    });

    it("returns high for 51-75", () => {
      expect(getRiskLevel(51)).toBe("high");
      expect(getRiskLevel(75)).toBe("high");
    });

    it("returns critical for 76-100", () => {
      expect(getRiskLevel(76)).toBe("critical");
      expect(getRiskLevel(100)).toBe("critical");
    });
  });

  describe("generateRecommendations", () => {
    it("recommends migration guide for major updates", () => {
      const factors = {
        updateType: { score: 40, reason: "Major version bump" },
        usageScope: { score: 0, reason: "" },
        criticalPaths: { score: 0, reason: "" },
        testCoverage: { score: 0, reason: "" },
      };
      const criticalPaths = { hasApiRoutes: false, hasMiddleware: false, hasAuth: false };

      const result = generateRecommendations("express", "major", factors, criticalPaths);

      expect(result).toContain("Review express migration guide");
      expect(result).toContain("Run full test suite after upgrade");
    });

    it("recommends changelog check for minor updates", () => {
      const factors = {
        updateType: { score: 15, reason: "Minor version bump" },
        usageScope: { score: 0, reason: "" },
        criticalPaths: { score: 0, reason: "" },
        testCoverage: { score: 0, reason: "" },
      };
      const criticalPaths = { hasApiRoutes: false, hasMiddleware: false, hasAuth: false };

      const result = generateRecommendations("express", "minor", factors, criticalPaths);

      expect(result).toContain("Check express changelog for new features");
    });

    it("recommends incremental rollout for high usage", () => {
      const factors = {
        updateType: { score: 0, reason: "" },
        usageScope: { score: 20, reason: "Used in 15 files" },
        criticalPaths: { score: 0, reason: "" },
        testCoverage: { score: 0, reason: "" },
      };
      const criticalPaths = { hasApiRoutes: false, hasMiddleware: false, hasAuth: false };

      const result = generateRecommendations("lodash", "patch", factors, criticalPaths);

      expect(result).toContain("Consider incremental rollout");
    });

    it("recommends testing API routes when used in API", () => {
      const factors = {
        updateType: { score: 0, reason: "" },
        usageScope: { score: 0, reason: "" },
        criticalPaths: { score: 10, reason: "" },
        testCoverage: { score: 0, reason: "" },
      };
      const criticalPaths = { hasApiRoutes: true, hasMiddleware: false, hasAuth: false };

      const result = generateRecommendations("express", "patch", factors, criticalPaths);

      expect(result).toContain("Test API routes manually");
    });

    it("recommends verifying auth when used in auth", () => {
      const factors = {
        updateType: { score: 0, reason: "" },
        usageScope: { score: 0, reason: "" },
        criticalPaths: { score: 5, reason: "" },
        testCoverage: { score: 0, reason: "" },
      };
      const criticalPaths = { hasApiRoutes: false, hasMiddleware: false, hasAuth: true };

      const result = generateRecommendations("passport", "patch", factors, criticalPaths);

      expect(result).toContain("Verify auth flows");
    });

    it("recommends middleware check when used in middleware", () => {
      const factors = {
        updateType: { score: 0, reason: "" },
        usageScope: { score: 0, reason: "" },
        criticalPaths: { score: 5, reason: "" },
        testCoverage: { score: 0, reason: "" },
      };
      const criticalPaths = { hasApiRoutes: false, hasMiddleware: true, hasAuth: false };

      const result = generateRecommendations("cors", "patch", factors, criticalPaths);

      expect(result).toContain("Check middleware compatibility");
    });

    it("recommends adding tests when coverage is low", () => {
      const factors = {
        updateType: { score: 0, reason: "" },
        usageScope: { score: 0, reason: "" },
        criticalPaths: { score: 0, reason: "" },
        testCoverage: { score: 5, reason: "" },
      };
      const criticalPaths = { hasApiRoutes: false, hasMiddleware: false, hasAuth: false };

      const result = generateRecommendations("lodash", "patch", factors, criticalPaths);

      expect(result).toContain("Add tests before upgrading");
    });
  });

  describe("hasTestFile", () => {
    it("finds colocated .test.ts files", async () => {
      // src/utils.ts has a colocated test file at src/utils.test.ts
      const result = await hasTestFile("src/utils.ts", RISK_FIXTURES_PATH);
      expect(result).toBe(true);
    });

    it("returns false when no test file exists", async () => {
      const result = await hasTestFile("src/index.ts", RISK_FIXTURES_PATH);
      expect(result).toBe(false);
    });

    it("returns false for api file without test", async () => {
      const result = await hasTestFile("src/api/users.ts", RISK_FIXTURES_PATH);
      expect(result).toBe(false);
    });
  });

  describe("calculateTestCoverage", () => {
    it("returns 100 for empty file list", async () => {
      const result = await calculateTestCoverage([], RISK_FIXTURES_PATH);
      expect(result).toBe(100);
    });

    it("calculates correct coverage percentage", async () => {
      // 1 out of 4 files has tests = 25%
      const files = [
        "src/index.ts",
        "src/utils.ts", // has test
        "src/api/users.ts",
        "src/auth/middleware.ts",
      ];
      const result = await calculateTestCoverage(files, RISK_FIXTURES_PATH);
      expect(result).toBe(25);
    });
  });

  describe("assessRisk", () => {
    let execSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      // Mock exec to return a specific version for npm view
      execSpy = spyOn(execModule, "exec").mockImplementation(async () => ({
        stdout: "5.0.0\n",
        stderr: "",
        exitCode: 0,
      }));
    });

    afterEach(() => {
      execSpy.mockRestore();
    });

    it("assesses risk for a package with explicit versions", async () => {
      const result = await assessRisk("lodash", {
        cwd: RISK_FIXTURES_PATH,
        fromVersion: "4.17.21",
        toVersion: "5.0.0",
      });

      expect(result.package).toBe("lodash");
      expect(result.from).toBe("4.17.21");
      expect(result.to).toBe("5.0.0");
      expect(result.updateType).toBe("major");
      expect(result.factors.updateType.score).toBe(40);
    });

    it("detects critical paths in usage", async () => {
      const result = await assessRisk("lodash", {
        cwd: RISK_FIXTURES_PATH,
        fromVersion: "4.17.21",
        toVersion: "4.17.22",
      });

      // lodash is used in api/users.ts and auth/middleware.ts
      expect(result.factors.criticalPaths.score).toBeGreaterThan(0);
    });

    it("auto-detects from version from package.json", async () => {
      const result = await assessRisk("lodash", {
        cwd: RISK_FIXTURES_PATH,
        toVersion: "5.0.0",
      });

      expect(result.from).toBe("4.17.21");
    });

    it("auto-detects latest version via npm", async () => {
      const result = await assessRisk("lodash", {
        cwd: RISK_FIXTURES_PATH,
        fromVersion: "4.17.21",
      });

      expect(result.to).toBe("5.0.0");
      expect(execSpy).toHaveBeenCalledWith(
        "npm",
        ["view", "lodash", "version"],
        expect.any(Object)
      );
    });

    it("calculates total risk score correctly", async () => {
      const result = await assessRisk("lodash", {
        cwd: RISK_FIXTURES_PATH,
        fromVersion: "4.17.21",
        toVersion: "5.0.0",
      });

      const expectedTotal =
        result.factors.updateType.score +
        result.factors.usageScope.score +
        result.factors.criticalPaths.score +
        result.factors.testCoverage.score;

      expect(result.riskScore).toBe(expectedTotal);
    });

    it("determines correct risk level", async () => {
      const result = await assessRisk("lodash", {
        cwd: RISK_FIXTURES_PATH,
        fromVersion: "4.17.21",
        toVersion: "5.0.0",
      });

      // Major update (40) + some usage = high risk
      expect(["high", "critical"]).toContain(result.riskLevel);
    });

    it("generates recommendations", async () => {
      const result = await assessRisk("lodash", {
        cwd: RISK_FIXTURES_PATH,
        fromVersion: "4.17.21",
        toVersion: "5.0.0",
      });

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations).toContain("Review lodash migration guide");
    });

    it("throws error when package not found", async () => {
      await expect(
        assessRisk("nonexistent-package", {
          cwd: RISK_FIXTURES_PATH,
        })
      ).rejects.toThrow('Package "nonexistent-package" not found in package.json');
    });

    it("throws error when latest version cannot be fetched", async () => {
      execSpy.mockRestore();
      execSpy = spyOn(execModule, "exec").mockImplementation(async () => ({
        stdout: "",
        stderr: "npm ERR! 404 Not Found",
        exitCode: 1,
      }));

      await expect(
        assessRisk("lodash", {
          cwd: RISK_FIXTURES_PATH,
          fromVersion: "4.17.21",
        })
      ).rejects.toThrow('Could not fetch latest version for "lodash"');
    });
  });

  describe("risk level boundaries", () => {
    const testCases: Array<{ score: number; expected: RiskLevel }> = [
      { score: 0, expected: "low" },
      { score: 10, expected: "low" },
      { score: 25, expected: "low" },
      { score: 26, expected: "medium" },
      { score: 35, expected: "medium" },
      { score: 50, expected: "medium" },
      { score: 51, expected: "high" },
      { score: 60, expected: "high" },
      { score: 75, expected: "high" },
      { score: 76, expected: "critical" },
      { score: 90, expected: "critical" },
      { score: 100, expected: "critical" },
    ];

    for (const { score, expected } of testCases) {
      it(`returns "${expected}" for score ${score}`, () => {
        expect(getRiskLevel(score)).toBe(expected);
      });
    }
  });
});
