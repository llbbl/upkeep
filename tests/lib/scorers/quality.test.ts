import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as auditModule from "../../../src/lib/analyzers/audit.ts";
import * as coverageModule from "../../../src/lib/analyzers/coverage.ts";
import * as depsModule from "../../../src/lib/analyzers/deps.ts";
import * as lintingModule from "../../../src/lib/analyzers/linting.ts";
import * as tsconfigModule from "../../../src/lib/analyzers/tsconfig.ts";
import { assessQuality, type Grade, internals } from "../../../src/lib/scorers/quality.ts";

const {
  WEIGHTS,
  getGrade,
  calculateDependencyFreshnessScore,
  calculateSecurityScore,
  calculateTestCoverageScore,
  calculateTypescriptStrictnessScore,
  calculateLintingScore,
  calculateDeadCodeScore,
  calculateOverallScore,
  generateRecommendations,
} = internals;

// Path to test fixtures
const FIXTURES_PATH = `${import.meta.dir}/../../fixtures`;
const QUALITY_FIXTURES_PATH = `${FIXTURES_PATH}/quality-test-project`;

describe("quality scorer", () => {
  describe("WEIGHTS", () => {
    it("has correct weights that sum to 100", () => {
      const total =
        WEIGHTS.dependencyFreshness +
        WEIGHTS.security +
        WEIGHTS.testCoverage +
        WEIGHTS.typescriptStrictness +
        WEIGHTS.linting +
        WEIGHTS.deadCode;

      expect(total).toBe(100);
    });

    it("has security as the highest weighted metric", () => {
      expect(WEIGHTS.security).toBeGreaterThanOrEqual(WEIGHTS.dependencyFreshness);
      expect(WEIGHTS.security).toBeGreaterThanOrEqual(WEIGHTS.testCoverage);
      expect(WEIGHTS.security).toBeGreaterThanOrEqual(WEIGHTS.typescriptStrictness);
      expect(WEIGHTS.security).toBeGreaterThanOrEqual(WEIGHTS.linting);
      expect(WEIGHTS.security).toBeGreaterThanOrEqual(WEIGHTS.deadCode);
    });
  });

  describe("getGrade", () => {
    const testCases: Array<{ score: number; expected: Grade }> = [
      { score: 100, expected: "A" },
      { score: 95, expected: "A" },
      { score: 90, expected: "A" },
      { score: 89, expected: "B" },
      { score: 85, expected: "B" },
      { score: 80, expected: "B" },
      { score: 79, expected: "C" },
      { score: 75, expected: "C" },
      { score: 70, expected: "C" },
      { score: 69, expected: "D" },
      { score: 65, expected: "D" },
      { score: 60, expected: "D" },
      { score: 59, expected: "F" },
      { score: 50, expected: "F" },
      { score: 0, expected: "F" },
    ];

    for (const { score, expected } of testCases) {
      it(`returns "${expected}" for score ${score}`, () => {
        expect(getGrade(score)).toBe(expected);
      });
    }
  });

  describe("calculateDependencyFreshnessScore", () => {
    it("returns 100 for no dependencies", () => {
      const result = calculateDependencyFreshnessScore(0, 0);
      expect(result.score).toBe(100);
      expect(result.weight).toBe(WEIGHTS.dependencyFreshness);
      expect(result.details).toBe("No dependencies");
    });

    it("returns 100 for all up-to-date", () => {
      const result = calculateDependencyFreshnessScore(10, 0);
      expect(result.score).toBe(100);
      expect(result.details).toBe("All packages up-to-date");
    });

    it("calculates correct percentage for outdated packages", () => {
      const result = calculateDependencyFreshnessScore(10, 3);
      expect(result.score).toBe(70); // 7/10 = 70%
      expect(result.details).toBe("3 of 10 packages outdated");
    });

    it("returns 0 for all outdated", () => {
      const result = calculateDependencyFreshnessScore(5, 5);
      expect(result.score).toBe(0);
      expect(result.details).toBe("5 of 5 packages outdated");
    });
  });

  describe("calculateSecurityScore", () => {
    it("returns 100 for no vulnerabilities", () => {
      const result = calculateSecurityScore(0, 0, 0, 0);
      expect(result.score).toBe(100);
      expect(result.weight).toBe(WEIGHTS.security);
      expect(result.details).toBe("No vulnerabilities found");
    });

    it("deducts 25 points per critical vulnerability", () => {
      const result = calculateSecurityScore(1, 0, 0, 0);
      expect(result.score).toBe(75);
      expect(result.details).toContain("1 critical");
    });

    it("deducts 15 points per high vulnerability", () => {
      const result = calculateSecurityScore(0, 1, 0, 0);
      expect(result.score).toBe(85);
      expect(result.details).toContain("1 high");
    });

    it("deducts 5 points per moderate vulnerability", () => {
      const result = calculateSecurityScore(0, 0, 1, 0);
      expect(result.score).toBe(95);
      expect(result.details).toContain("1 moderate");
    });

    it("deducts 2 points per low vulnerability", () => {
      const result = calculateSecurityScore(0, 0, 0, 1);
      expect(result.score).toBe(98);
      expect(result.details).toContain("1 low");
    });

    it("calculates cumulative deductions correctly", () => {
      const result = calculateSecurityScore(1, 2, 3, 4);
      // 100 - (1*25 + 2*15 + 3*5 + 4*2) = 100 - (25 + 30 + 15 + 8) = 22
      expect(result.score).toBe(22);
      expect(result.details).toContain("1 critical");
      expect(result.details).toContain("2 high");
      expect(result.details).toContain("3 moderate");
      expect(result.details).toContain("4 low");
    });

    it("clamps score at 0", () => {
      const result = calculateSecurityScore(5, 0, 0, 0); // 5 * 25 = 125 deduction
      expect(result.score).toBe(0);
    });
  });

  describe("calculateTestCoverageScore", () => {
    it("returns 0 for no coverage data", () => {
      const result = calculateTestCoverageScore(false, null);
      expect(result.score).toBe(0);
      expect(result.weight).toBe(WEIGHTS.testCoverage);
      expect(result.details).toBe("No coverage data found");
    });

    it("uses coverage percentage directly as score", () => {
      const result = calculateTestCoverageScore(true, 85);
      expect(result.score).toBe(85);
      expect(result.details).toBe("85% line coverage");
    });

    it("handles 100% coverage", () => {
      const result = calculateTestCoverageScore(true, 100);
      expect(result.score).toBe(100);
      expect(result.details).toBe("100% line coverage");
    });

    it("handles 0% coverage", () => {
      const result = calculateTestCoverageScore(true, 0);
      expect(result.score).toBe(0);
      expect(result.details).toBe("0% line coverage");
    });
  });

  describe("calculateTypescriptStrictnessScore", () => {
    it("returns 0 for no tsconfig", () => {
      const result = calculateTypescriptStrictnessScore(false, 0, "No tsconfig.json found");
      expect(result.score).toBe(0);
      expect(result.weight).toBe(WEIGHTS.typescriptStrictness);
      expect(result.details).toBe("No tsconfig.json found");
    });

    it("uses tsconfig score directly", () => {
      const result = calculateTypescriptStrictnessScore(
        true,
        80,
        "Missing: exactOptionalPropertyTypes"
      );
      expect(result.score).toBe(80);
      expect(result.details).toBe("Missing: exactOptionalPropertyTypes");
    });
  });

  describe("calculateLintingScore", () => {
    it("uses linting score directly", () => {
      const result = calculateLintingScore(100, "Biome configured");
      expect(result.score).toBe(100);
      expect(result.weight).toBe(WEIGHTS.linting);
      expect(result.details).toBe("Biome configured");
    });
  });

  describe("calculateDeadCodeScore", () => {
    it("returns 50 base score with no flags", () => {
      const result = calculateDeadCodeScore(false, false);
      expect(result.score).toBe(50);
      expect(result.weight).toBe(WEIGHTS.deadCode);
      expect(result.details).toBe("Automated dead code detection not implemented");
    });

    it("adds 25 for noUnusedLocals", () => {
      const result = calculateDeadCodeScore(true, false);
      expect(result.score).toBe(75);
      expect(result.details).toContain("noUnusedLocals");
    });

    it("adds 25 for noUnusedParameters", () => {
      const result = calculateDeadCodeScore(false, true);
      expect(result.score).toBe(75);
      expect(result.details).toContain("noUnusedParameters");
    });

    it("returns 100 for both flags enabled", () => {
      const result = calculateDeadCodeScore(true, true);
      expect(result.score).toBe(100);
      expect(result.details).toContain("noUnusedLocals");
      expect(result.details).toContain("noUnusedParameters");
    });
  });

  describe("calculateOverallScore", () => {
    it("calculates weighted average correctly", () => {
      const breakdown = {
        dependencyFreshness: { score: 100, weight: 20, details: "" },
        security: { score: 100, weight: 25, details: "" },
        testCoverage: { score: 100, weight: 20, details: "" },
        typescriptStrictness: { score: 100, weight: 10, details: "" },
        linting: { score: 100, weight: 10, details: "" },
        deadCode: { score: 100, weight: 15, details: "" },
      };

      expect(calculateOverallScore(breakdown)).toBe(100);
    });

    it("handles mixed scores correctly", () => {
      const breakdown = {
        dependencyFreshness: { score: 50, weight: 20, details: "" },
        security: { score: 50, weight: 25, details: "" },
        testCoverage: { score: 50, weight: 20, details: "" },
        typescriptStrictness: { score: 50, weight: 10, details: "" },
        linting: { score: 50, weight: 10, details: "" },
        deadCode: { score: 50, weight: 15, details: "" },
      };

      expect(calculateOverallScore(breakdown)).toBe(50);
    });

    it("weights security highest", () => {
      // Security at 0, all others at 100
      const breakdown1 = {
        dependencyFreshness: { score: 100, weight: 20, details: "" },
        security: { score: 0, weight: 25, details: "" },
        testCoverage: { score: 100, weight: 20, details: "" },
        typescriptStrictness: { score: 100, weight: 10, details: "" },
        linting: { score: 100, weight: 10, details: "" },
        deadCode: { score: 100, weight: 15, details: "" },
      };

      // Linting at 0, all others at 100
      const breakdown2 = {
        dependencyFreshness: { score: 100, weight: 20, details: "" },
        security: { score: 100, weight: 25, details: "" },
        testCoverage: { score: 100, weight: 20, details: "" },
        typescriptStrictness: { score: 100, weight: 10, details: "" },
        linting: { score: 0, weight: 10, details: "" },
        deadCode: { score: 100, weight: 15, details: "" },
      };

      // Security at 0 should have bigger impact
      expect(calculateOverallScore(breakdown1)).toBeLessThan(calculateOverallScore(breakdown2));
    });
  });

  describe("generateRecommendations", () => {
    it("generates high priority recommendation for critical vulnerabilities", () => {
      const breakdown = {
        dependencyFreshness: { score: 100, weight: 20, details: "" },
        security: { score: 0, weight: 25, details: "2 critical vulnerabilities" },
        testCoverage: { score: 100, weight: 20, details: "" },
        typescriptStrictness: { score: 100, weight: 10, details: "" },
        linting: { score: 100, weight: 10, details: "" },
        deadCode: { score: 100, weight: 15, details: "" },
      };

      const recommendations = generateRecommendations(breakdown);
      const critical = recommendations.find(
        (r) => r.priority === "high" && r.action.includes("critical")
      );
      expect(critical).toBeDefined();
    });

    it("generates recommendation for low test coverage", () => {
      const breakdown = {
        dependencyFreshness: { score: 100, weight: 20, details: "" },
        security: { score: 100, weight: 25, details: "" },
        testCoverage: { score: 30, weight: 20, details: "30% line coverage" },
        typescriptStrictness: { score: 100, weight: 10, details: "" },
        linting: { score: 100, weight: 10, details: "" },
        deadCode: { score: 100, weight: 15, details: "" },
      };

      const recommendations = generateRecommendations(breakdown);
      const coverage = recommendations.find((r) => r.action.includes("coverage"));
      expect(coverage).toBeDefined();
    });

    it("generates recommendation for missing tsconfig", () => {
      const breakdown = {
        dependencyFreshness: { score: 100, weight: 20, details: "" },
        security: { score: 100, weight: 25, details: "" },
        testCoverage: { score: 100, weight: 20, details: "" },
        typescriptStrictness: { score: 0, weight: 10, details: "No tsconfig.json found" },
        linting: { score: 100, weight: 10, details: "" },
        deadCode: { score: 100, weight: 15, details: "" },
      };

      const recommendations = generateRecommendations(breakdown);
      const ts = recommendations.find((r) => r.action.includes("TypeScript"));
      expect(ts).toBeDefined();
    });

    it("generates recommendation for missing linter", () => {
      const breakdown = {
        dependencyFreshness: { score: 100, weight: 20, details: "" },
        security: { score: 100, weight: 25, details: "" },
        testCoverage: { score: 100, weight: 20, details: "" },
        typescriptStrictness: { score: 100, weight: 10, details: "" },
        linting: { score: 0, weight: 10, details: "No linting configured" },
        deadCode: { score: 100, weight: 15, details: "" },
      };

      const recommendations = generateRecommendations(breakdown);
      const lint = recommendations.find((r) => r.action.includes("linter"));
      expect(lint).toBeDefined();
    });

    it("returns empty array for perfect scores", () => {
      const breakdown = {
        dependencyFreshness: { score: 100, weight: 20, details: "All packages up-to-date" },
        security: { score: 100, weight: 25, details: "No vulnerabilities found" },
        testCoverage: { score: 100, weight: 20, details: "100% line coverage" },
        typescriptStrictness: { score: 100, weight: 10, details: "All strict flags enabled" },
        linting: { score: 100, weight: 10, details: "Biome configured" },
        deadCode: { score: 100, weight: 15, details: "All flags enabled" },
      };

      const recommendations = generateRecommendations(breakdown);
      expect(recommendations.length).toBe(0);
    });
  });

  describe("assessQuality", () => {
    let depsSpy: ReturnType<typeof spyOn>;
    let auditSpy: ReturnType<typeof spyOn>;
    let coverageSpy: ReturnType<typeof spyOn>;
    let tsconfigSpy: ReturnType<typeof spyOn>;
    let lintingSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      // Mock all analyzers
      depsSpy = spyOn(depsModule, "analyzeDeps").mockImplementation(async () => ({
        total: 10,
        outdated: 2,
        major: 1,
        minor: 1,
        patch: 0,
        security: null,
        packages: [],
      }));

      auditSpy = spyOn(auditModule, "analyzeAudit").mockImplementation(async () => ({
        vulnerabilities: [],
        summary: { critical: 0, high: 1, moderate: 2, low: 0, total: 3 },
      }));

      coverageSpy = spyOn(coverageModule, "analyzeCoverage").mockImplementation(async () => ({
        found: true,
        percentage: 85,
        source: "istanbul",
        details: "85% line coverage",
      }));

      tsconfigSpy = spyOn(tsconfigModule, "analyzeTsConfig").mockImplementation(async () => ({
        exists: true,
        strict: true,
        strictFlags: {
          strict: true,
          noUncheckedIndexedAccess: true,
          noImplicitReturns: true,
          noFallthroughCasesInSwitch: true,
          exactOptionalPropertyTypes: false,
          noImplicitOverride: false,
          noUnusedLocals: true,
          noUnusedParameters: false,
        },
        score: 80,
        details: "Missing: exactOptionalPropertyTypes, noImplicitOverride",
      }));

      lintingSpy = spyOn(lintingModule, "analyzeLinting").mockImplementation(async () => ({
        linter: "biome",
        prettier: false,
        score: 100,
        details: "Biome configured",
      }));
    });

    afterEach(() => {
      depsSpy.mockRestore();
      auditSpy.mockRestore();
      coverageSpy.mockRestore();
      tsconfigSpy.mockRestore();
      lintingSpy.mockRestore();
    });

    it("returns a complete quality report", async () => {
      const report = await assessQuality({ cwd: QUALITY_FIXTURES_PATH });

      expect(typeof report.score).toBe("number");
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);

      expect(["A", "B", "C", "D", "F"]).toContain(report.grade);

      expect(report.breakdown).toBeDefined();
      expect(report.breakdown.dependencyFreshness).toBeDefined();
      expect(report.breakdown.security).toBeDefined();
      expect(report.breakdown.testCoverage).toBeDefined();
      expect(report.breakdown.typescriptStrictness).toBeDefined();
      expect(report.breakdown.linting).toBeDefined();
      expect(report.breakdown.deadCode).toBeDefined();

      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it("calls all analyzers with correct cwd", async () => {
      await assessQuality({ cwd: QUALITY_FIXTURES_PATH });

      expect(depsSpy).toHaveBeenCalledWith({ cwd: QUALITY_FIXTURES_PATH });
      expect(auditSpy).toHaveBeenCalledWith({ cwd: QUALITY_FIXTURES_PATH });
      expect(coverageSpy).toHaveBeenCalledWith({ cwd: QUALITY_FIXTURES_PATH });
      expect(tsconfigSpy).toHaveBeenCalledWith({ cwd: QUALITY_FIXTURES_PATH });
      expect(lintingSpy).toHaveBeenCalledWith({ cwd: QUALITY_FIXTURES_PATH });
    });

    it("calculates correct scores from mocked data", async () => {
      const report = await assessQuality({ cwd: QUALITY_FIXTURES_PATH });

      // Dependency freshness: 8/10 = 80%
      expect(report.breakdown.dependencyFreshness.score).toBe(80);

      // Security: 100 - (0*25 + 1*15 + 2*5 + 0*2) = 75
      expect(report.breakdown.security.score).toBe(75);

      // Test coverage: 85%
      expect(report.breakdown.testCoverage.score).toBe(85);

      // TypeScript: 80
      expect(report.breakdown.typescriptStrictness.score).toBe(80);

      // Linting: 100
      expect(report.breakdown.linting.score).toBe(100);

      // Dead code: 50 + 25 (noUnusedLocals) = 75
      expect(report.breakdown.deadCode.score).toBe(75);
    });

    it("uses current directory by default", async () => {
      await assessQuality();
      expect(depsSpy).toHaveBeenCalledWith({ cwd: process.cwd() });
    });
  });

  describe("grade boundaries", () => {
    const testCases: Array<{ score: number; grade: Grade }> = [
      { score: 100, grade: "A" },
      { score: 90, grade: "A" },
      { score: 89, grade: "B" },
      { score: 80, grade: "B" },
      { score: 79, grade: "C" },
      { score: 70, grade: "C" },
      { score: 69, grade: "D" },
      { score: 60, grade: "D" },
      { score: 59, grade: "F" },
      { score: 0, grade: "F" },
    ];

    for (const { score, grade } of testCases) {
      it(`score ${score} gets grade ${grade}`, () => {
        expect(getGrade(score)).toBe(grade);
      });
    }
  });
});
