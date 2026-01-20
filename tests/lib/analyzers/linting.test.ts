import { describe, expect, it } from "bun:test";
import { analyzeLinting, internals } from "../../../src/lib/analyzers/linting.ts";

const { calculateScore, generateDetails, detectBiome, detectEslint, detectPrettier } = internals;

// Path to test fixtures
const FIXTURES_PATH = `${import.meta.dir}/../../fixtures`;
const QUALITY_FIXTURES_PATH = `${FIXTURES_PATH}/quality-test-project`;
const MINIMAL_FIXTURES_PATH = `${FIXTURES_PATH}/minimal-project`;

describe("linting analyzer", () => {
  describe("calculateScore", () => {
    it("returns 100 for biome", () => {
      expect(calculateScore("biome", false)).toBe(100);
      expect(calculateScore("biome", true)).toBe(100); // prettier ignored with biome
    });

    it("returns 80 for eslint + prettier", () => {
      expect(calculateScore("eslint", true)).toBe(80);
    });

    it("returns 50 for eslint only", () => {
      expect(calculateScore("eslint", false)).toBe(50);
    });

    it("returns 20 for prettier only", () => {
      expect(calculateScore("none", true)).toBe(20);
    });

    it("returns 0 for no linting", () => {
      expect(calculateScore("none", false)).toBe(0);
    });
  });

  describe("generateDetails", () => {
    it("returns correct message for biome", () => {
      expect(generateDetails("biome", false)).toBe("Biome configured");
      expect(generateDetails("biome", true)).toBe("Biome configured");
    });

    it("returns correct message for eslint + prettier", () => {
      expect(generateDetails("eslint", true)).toBe("ESLint + Prettier configured");
    });

    it("returns correct message for eslint only", () => {
      expect(generateDetails("eslint", false)).toBe("ESLint configured (no Prettier)");
    });

    it("returns correct message for prettier only", () => {
      expect(generateDetails("none", true)).toBe("Prettier only (no linter)");
    });

    it("returns correct message for no linting", () => {
      expect(generateDetails("none", false)).toBe("No linting configured");
    });
  });

  describe("detectBiome", () => {
    it("detects biome.json in quality fixture", async () => {
      const result = await detectBiome(QUALITY_FIXTURES_PATH);
      expect(result).toBe(true);
    });

    it("returns false when no biome config", async () => {
      const result = await detectBiome(MINIMAL_FIXTURES_PATH);
      expect(result).toBe(false);
    });
  });

  describe("detectEslint", () => {
    it("returns false when no eslint config", async () => {
      const result = await detectEslint(QUALITY_FIXTURES_PATH);
      expect(result).toBe(false);
    });

    it("returns false in minimal project", async () => {
      const result = await detectEslint(MINIMAL_FIXTURES_PATH);
      expect(result).toBe(false);
    });
  });

  describe("detectPrettier", () => {
    it("returns false when no prettier config", async () => {
      const result = await detectPrettier(QUALITY_FIXTURES_PATH);
      expect(result).toBe(false);
    });

    it("returns false in minimal project", async () => {
      const result = await detectPrettier(MINIMAL_FIXTURES_PATH);
      expect(result).toBe(false);
    });
  });

  describe("analyzeLinting", () => {
    it("detects biome in quality fixture", async () => {
      const result = await analyzeLinting({ cwd: QUALITY_FIXTURES_PATH });

      expect(result.linter).toBe("biome");
      expect(result.prettier).toBe(false); // Biome handles formatting
      expect(result.score).toBe(100);
      expect(result.details).toBe("Biome configured");
    });

    it("returns no linting for minimal project", async () => {
      const result = await analyzeLinting({ cwd: MINIMAL_FIXTURES_PATH });

      expect(result.linter).toBe("none");
      expect(result.prettier).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details).toBe("No linting configured");
    });

    it("uses current directory by default", async () => {
      // This test verifies the function doesn't crash with default options
      const result = await analyzeLinting();
      expect(["biome", "eslint", "none"]).toContain(result.linter);
    });
  });

  describe("score boundaries", () => {
    const testCases = [
      { linter: "biome" as const, prettier: false, expected: 100 },
      { linter: "biome" as const, prettier: true, expected: 100 },
      { linter: "eslint" as const, prettier: true, expected: 80 },
      { linter: "eslint" as const, prettier: false, expected: 50 },
      { linter: "none" as const, prettier: true, expected: 20 },
      { linter: "none" as const, prettier: false, expected: 0 },
    ];

    for (const { linter, prettier, expected } of testCases) {
      it(`returns ${expected} for ${linter}${prettier ? " + prettier" : ""}`, () => {
        expect(calculateScore(linter, prettier)).toBe(expected);
      });
    }
  });
});
