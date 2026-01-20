import { describe, expect, it } from "bun:test";
import { analyzeTsConfig, internals } from "../../../src/lib/analyzers/tsconfig.ts";

const { extractStrictFlags, calculateScore, generateDetails, FLAG_SCORES } = internals;

// Path to test fixtures
const FIXTURES_PATH = `${import.meta.dir}/../../fixtures`;
const QUALITY_FIXTURES_PATH = `${FIXTURES_PATH}/quality-test-project`;
const MINIMAL_FIXTURES_PATH = `${FIXTURES_PATH}/minimal-project`;

describe("tsconfig analyzer", () => {
  describe("extractStrictFlags", () => {
    it("extracts all flags when present", () => {
      const config = {
        compilerOptions: {
          strict: true,
          noUncheckedIndexedAccess: true,
          noImplicitReturns: true,
          noFallthroughCasesInSwitch: true,
          exactOptionalPropertyTypes: true,
          noImplicitOverride: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
        },
      };

      const flags = extractStrictFlags(config);

      expect(flags.strict).toBe(true);
      expect(flags.noUncheckedIndexedAccess).toBe(true);
      expect(flags.noImplicitReturns).toBe(true);
      expect(flags.noFallthroughCasesInSwitch).toBe(true);
      expect(flags.exactOptionalPropertyTypes).toBe(true);
      expect(flags.noImplicitOverride).toBe(true);
      expect(flags.noUnusedLocals).toBe(true);
      expect(flags.noUnusedParameters).toBe(true);
    });

    it("defaults missing flags to false", () => {
      const config = {
        compilerOptions: {
          strict: true,
        },
      };

      const flags = extractStrictFlags(config);

      expect(flags.strict).toBe(true);
      expect(flags.noUncheckedIndexedAccess).toBe(false);
      expect(flags.noImplicitReturns).toBe(false);
      expect(flags.noFallthroughCasesInSwitch).toBe(false);
      expect(flags.exactOptionalPropertyTypes).toBe(false);
      expect(flags.noImplicitOverride).toBe(false);
      expect(flags.noUnusedLocals).toBe(false);
      expect(flags.noUnusedParameters).toBe(false);
    });

    it("handles empty compilerOptions", () => {
      const config = { compilerOptions: {} };
      const flags = extractStrictFlags(config);

      expect(flags.strict).toBe(false);
      expect(flags.noUncheckedIndexedAccess).toBe(false);
    });

    it("handles missing compilerOptions", () => {
      const config = {};
      const flags = extractStrictFlags(config);

      expect(flags.strict).toBe(false);
      expect(flags.noUncheckedIndexedAccess).toBe(false);
    });
  });

  describe("calculateScore", () => {
    it("returns 100 for all flags enabled", () => {
      const flags = {
        strict: true,
        noUncheckedIndexedAccess: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
      };

      expect(calculateScore(flags)).toBe(100);
    });

    it("returns 0 for no flags enabled", () => {
      const flags = {
        strict: false,
        noUncheckedIndexedAccess: false,
        noImplicitReturns: false,
        noFallthroughCasesInSwitch: false,
        exactOptionalPropertyTypes: false,
        noImplicitOverride: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
      };

      expect(calculateScore(flags)).toBe(0);
    });

    it("returns correct score for strict only", () => {
      const flags = {
        strict: true,
        noUncheckedIndexedAccess: false,
        noImplicitReturns: false,
        noFallthroughCasesInSwitch: false,
        exactOptionalPropertyTypes: false,
        noImplicitOverride: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
      };

      expect(calculateScore(flags)).toBe(FLAG_SCORES.strict);
    });

    it("calculates cumulative score correctly", () => {
      const flags = {
        strict: true,
        noUncheckedIndexedAccess: true,
        noImplicitReturns: false,
        noFallthroughCasesInSwitch: false,
        exactOptionalPropertyTypes: false,
        noImplicitOverride: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
      };

      const expectedScore = FLAG_SCORES.strict + FLAG_SCORES.noUncheckedIndexedAccess;
      expect(calculateScore(flags)).toBe(expectedScore);
    });
  });

  describe("generateDetails", () => {
    it("returns 'All strict flags enabled' for score 100", () => {
      const flags = {
        strict: true,
        noUncheckedIndexedAccess: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
      };

      expect(generateDetails(flags, 100)).toBe("All strict flags enabled");
    });

    it("returns 'No strict flags enabled' for all disabled", () => {
      const flags = {
        strict: false,
        noUncheckedIndexedAccess: false,
        noImplicitReturns: false,
        noFallthroughCasesInSwitch: false,
        exactOptionalPropertyTypes: false,
        noImplicitOverride: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
      };

      expect(generateDetails(flags, 0)).toBe("No strict flags enabled");
    });

    it("lists missing flags when few are disabled", () => {
      const flags = {
        strict: true,
        noUncheckedIndexedAccess: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        exactOptionalPropertyTypes: false,
        noImplicitOverride: false,
        noUnusedLocals: true,
        noUnusedParameters: true,
      };

      const details = generateDetails(flags, 80);
      expect(details).toContain("Missing:");
      expect(details).toContain("exactOptionalPropertyTypes");
      expect(details).toContain("noImplicitOverride");
    });

    it("lists enabled flags when many are disabled", () => {
      const flags = {
        strict: true,
        noUncheckedIndexedAccess: false,
        noImplicitReturns: false,
        noFallthroughCasesInSwitch: false,
        exactOptionalPropertyTypes: false,
        noImplicitOverride: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
      };

      const details = generateDetails(flags, 40);
      expect(details).toContain("Enabled:");
      expect(details).toContain("strict");
    });
  });

  describe("analyzeTsConfig", () => {
    it("analyzes tsconfig with strict mode and some flags", async () => {
      const result = await analyzeTsConfig({ cwd: QUALITY_FIXTURES_PATH });

      expect(result.exists).toBe(true);
      expect(result.strict).toBe(true);
      expect(result.strictFlags.strict).toBe(true);
      expect(result.strictFlags.noUncheckedIndexedAccess).toBe(true);
      expect(result.strictFlags.noImplicitReturns).toBe(true);
      expect(result.strictFlags.noFallthroughCasesInSwitch).toBe(true);
      expect(result.strictFlags.exactOptionalPropertyTypes).toBe(false);
      expect(result.strictFlags.noImplicitOverride).toBe(false);
      expect(result.strictFlags.noUnusedLocals).toBe(true);
      expect(result.strictFlags.noUnusedParameters).toBe(false);
      expect(result.score).toBe(80); // strict(40) + noUnchecked(20) + noImplicitReturns(10) + noFallthrough(10)
    });

    it("returns exists=false when tsconfig.json is missing", async () => {
      const result = await analyzeTsConfig({ cwd: MINIMAL_FIXTURES_PATH });

      expect(result.exists).toBe(false);
      expect(result.strict).toBe(false);
      expect(result.score).toBe(0);
      expect(result.details).toBe("No tsconfig.json found");
    });

    it("uses current directory by default", async () => {
      // This test verifies the function doesn't crash with default options
      const result = await analyzeTsConfig();
      expect(typeof result.exists).toBe("boolean");
    });
  });

  describe("FLAG_SCORES weights", () => {
    it("has correct total weight of 100", () => {
      const total =
        FLAG_SCORES.strict +
        FLAG_SCORES.noUncheckedIndexedAccess +
        FLAG_SCORES.noImplicitReturns +
        FLAG_SCORES.noFallthroughCasesInSwitch +
        FLAG_SCORES.exactOptionalPropertyTypes +
        FLAG_SCORES.noImplicitOverride;

      expect(total).toBe(100);
    });

    it("has strict as the highest weighted flag", () => {
      expect(FLAG_SCORES.strict).toBeGreaterThan(FLAG_SCORES.noUncheckedIndexedAccess);
      expect(FLAG_SCORES.strict).toBeGreaterThan(FLAG_SCORES.noImplicitReturns);
      expect(FLAG_SCORES.strict).toBeGreaterThan(FLAG_SCORES.noFallthroughCasesInSwitch);
    });
  });
});
