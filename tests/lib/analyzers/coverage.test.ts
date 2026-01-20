import { describe, expect, it } from "bun:test";
import { analyzeCoverage, internals } from "../../../src/lib/analyzers/coverage.ts";

const { parseIstanbulCoverage, parseLcovCoverage } = internals;

// Path to test fixtures
const FIXTURES_PATH = `${import.meta.dir}/../../fixtures`;
const QUALITY_FIXTURES_PATH = `${FIXTURES_PATH}/quality-test-project`;
const MINIMAL_FIXTURES_PATH = `${FIXTURES_PATH}/minimal-project`;

describe("coverage analyzer", () => {
  describe("parseIstanbulCoverage", () => {
    it("parses coverage-summary.json in quality fixture", async () => {
      const percentage = await parseIstanbulCoverage(QUALITY_FIXTURES_PATH);
      expect(percentage).toBe(85);
    });

    it("returns null when coverage file not found", async () => {
      const percentage = await parseIstanbulCoverage(MINIMAL_FIXTURES_PATH);
      expect(percentage).toBeNull();
    });

    it("returns null for non-existent directory", async () => {
      const percentage = await parseIstanbulCoverage("/non/existent/path");
      expect(percentage).toBeNull();
    });
  });

  describe("parseLcovCoverage", () => {
    it("returns null when lcov.info not found", async () => {
      const percentage = await parseLcovCoverage(MINIMAL_FIXTURES_PATH);
      expect(percentage).toBeNull();
    });
  });

  describe("analyzeCoverage", () => {
    it("finds Istanbul coverage in quality fixture", async () => {
      const result = await analyzeCoverage({ cwd: QUALITY_FIXTURES_PATH });

      expect(result.found).toBe(true);
      expect(result.percentage).toBe(85);
      expect(result.details).toBe("85% line coverage");
    });

    it("returns not found when no coverage data exists", async () => {
      const result = await analyzeCoverage({ cwd: MINIMAL_FIXTURES_PATH });

      expect(result.found).toBe(false);
      expect(result.percentage).toBeNull();
      expect(result.source).toBeNull();
      expect(result.details).toBe("No coverage data found");
    });

    it("uses current directory by default", async () => {
      // This test verifies the function doesn't crash with default options
      const result = await analyzeCoverage();
      expect(typeof result.found).toBe("boolean");
    });
  });

  describe("coverage percentage boundaries", () => {
    // Note: Comprehensive percentage boundary testing would require creating
    // test fixtures with specific coverage values. For now, we test with
    // the fixture we have which has 85% coverage.
    it("rounds percentage to nearest integer", async () => {
      const result = await analyzeCoverage({ cwd: QUALITY_FIXTURES_PATH });
      expect(Number.isInteger(result.percentage)).toBe(true);
    });
  });
});
