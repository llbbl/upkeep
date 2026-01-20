import { describe, expect, it } from "bun:test";
import {
  compareSemver,
  getUpdateType,
  isValidSemver,
  parseSemver,
} from "../../../src/lib/utils/semver.ts";

describe("semver utilities", () => {
  describe("parseSemver", () => {
    it("parses basic semver strings", () => {
      const result = parseSemver("1.2.3");
      expect(result).not.toBeNull();
      expect(result?.major).toBe(1);
      expect(result?.minor).toBe(2);
      expect(result?.patch).toBe(3);
      expect(result?.prerelease).toBeNull();
      expect(result?.build).toBeNull();
    });

    it("handles versions with leading v", () => {
      const result = parseSemver("v2.0.0");
      expect(result).not.toBeNull();
      expect(result?.major).toBe(2);
      expect(result?.minor).toBe(0);
      expect(result?.patch).toBe(0);
    });

    it("parses versions with prerelease", () => {
      const result = parseSemver("1.0.0-alpha.1");
      expect(result).not.toBeNull();
      expect(result?.major).toBe(1);
      expect(result?.prerelease).toBe("alpha.1");
    });

    it("parses versions with build metadata", () => {
      const result = parseSemver("1.0.0+build.123");
      expect(result).not.toBeNull();
      expect(result?.build).toBe("build.123");
    });

    it("parses versions with both prerelease and build", () => {
      const result = parseSemver("1.0.0-beta.2+build.456");
      expect(result).not.toBeNull();
      expect(result?.prerelease).toBe("beta.2");
      expect(result?.build).toBe("build.456");
    });

    it("returns null for invalid versions", () => {
      expect(parseSemver("invalid")).toBeNull();
      expect(parseSemver("1.2")).toBeNull();
      expect(parseSemver("1")).toBeNull();
      expect(parseSemver("")).toBeNull();
      expect(parseSemver("1.2.3.4")).toBeNull();
    });
  });

  describe("getUpdateType", () => {
    it("detects major updates", () => {
      expect(getUpdateType("1.0.0", "2.0.0")).toBe("major");
      expect(getUpdateType("1.5.3", "2.0.0")).toBe("major");
      expect(getUpdateType("13.0.0", "14.0.0")).toBe("major");
    });

    it("detects minor updates", () => {
      expect(getUpdateType("1.0.0", "1.1.0")).toBe("minor");
      expect(getUpdateType("1.2.3", "1.5.0")).toBe("minor");
      expect(getUpdateType("5.0.0", "5.3.0")).toBe("minor");
    });

    it("detects patch updates", () => {
      expect(getUpdateType("1.0.0", "1.0.1")).toBe("patch");
      expect(getUpdateType("4.17.0", "4.17.21")).toBe("patch");
      expect(getUpdateType("5.9.2", "5.9.3")).toBe("patch");
    });

    it("returns none for equal versions", () => {
      expect(getUpdateType("1.0.0", "1.0.0")).toBe("none");
      expect(getUpdateType("4.17.21", "4.17.21")).toBe("none");
    });

    it("returns none when latest is older", () => {
      expect(getUpdateType("2.0.0", "1.0.0")).toBe("none");
      expect(getUpdateType("1.5.0", "1.4.0")).toBe("none");
    });

    it("returns none for invalid versions", () => {
      expect(getUpdateType("invalid", "1.0.0")).toBe("none");
      expect(getUpdateType("1.0.0", "invalid")).toBe("none");
    });

    it("handles versions with v prefix", () => {
      expect(getUpdateType("v1.0.0", "v2.0.0")).toBe("major");
      expect(getUpdateType("v1.0.0", "1.1.0")).toBe("minor");
    });
  });

  describe("compareSemver", () => {
    it("returns -1 when first is less", () => {
      expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
      expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
      expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
    });

    it("returns 1 when first is greater", () => {
      expect(compareSemver("2.0.0", "1.0.0")).toBe(1);
      expect(compareSemver("1.1.0", "1.0.0")).toBe(1);
      expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    });

    it("returns 0 when equal", () => {
      expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
      expect(compareSemver("2.5.3", "2.5.3")).toBe(0);
    });

    it("returns 0 for invalid versions", () => {
      expect(compareSemver("invalid", "1.0.0")).toBe(0);
      expect(compareSemver("1.0.0", "invalid")).toBe(0);
    });
  });

  describe("isValidSemver", () => {
    it("returns true for valid versions", () => {
      expect(isValidSemver("1.0.0")).toBe(true);
      expect(isValidSemver("v2.3.4")).toBe(true);
      expect(isValidSemver("1.0.0-alpha")).toBe(true);
      expect(isValidSemver("1.0.0+build")).toBe(true);
    });

    it("returns false for invalid versions", () => {
      expect(isValidSemver("invalid")).toBe(false);
      expect(isValidSemver("1.2")).toBe(false);
      expect(isValidSemver("")).toBe(false);
    });
  });
});
