import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { detectPackageManager } from "../../../src/lib/analyzers/package-manager.ts";

const fixturesPath = join(import.meta.dir, "../../fixtures");

describe("detectPackageManager", () => {
  describe("lockfile detection", () => {
    it("detects bun from bun.lock", async () => {
      const result = await detectPackageManager(join(fixturesPath, "bun-project"));

      expect(result.name).toBe("bun");
      expect(result.lockfile).toBe("bun.lock");
      expect(result.installCommand).toBe("bun install");
      expect(result.upgradeCommand).toBe("bun update");
      expect(result.hasMultipleLockfiles).toBe(false);
      expect(result.detectedLockfiles).toEqual(["bun.lock"]);
    });

    it("detects pnpm from pnpm-lock.yaml", async () => {
      const result = await detectPackageManager(join(fixturesPath, "pnpm-project"));

      expect(result.name).toBe("pnpm");
      expect(result.lockfile).toBe("pnpm-lock.yaml");
      expect(result.installCommand).toBe("pnpm install");
      expect(result.upgradeCommand).toBe("pnpm update");
      expect(result.hasMultipleLockfiles).toBe(false);
      expect(result.detectedLockfiles).toEqual(["pnpm-lock.yaml"]);
    });

    it("detects yarn from yarn.lock", async () => {
      const result = await detectPackageManager(join(fixturesPath, "yarn-project"));

      expect(result.name).toBe("yarn");
      expect(result.lockfile).toBe("yarn.lock");
      expect(result.installCommand).toBe("yarn install");
      expect(result.upgradeCommand).toBe("yarn upgrade");
      expect(result.hasMultipleLockfiles).toBe(false);
      expect(result.detectedLockfiles).toEqual(["yarn.lock"]);
    });

    it("detects npm from package-lock.json", async () => {
      const result = await detectPackageManager(join(fixturesPath, "npm-project"));

      expect(result.name).toBe("npm");
      expect(result.lockfile).toBe("package-lock.json");
      expect(result.installCommand).toBe("npm install");
      expect(result.upgradeCommand).toBe("npm update");
      expect(result.hasMultipleLockfiles).toBe(false);
      expect(result.detectedLockfiles).toEqual(["package-lock.json"]);
    });
  });

  describe("priority handling", () => {
    it("bun.lock wins when multiple lockfiles exist", async () => {
      const result = await detectPackageManager(join(fixturesPath, "multiple-lockfiles"));

      expect(result.name).toBe("bun");
      expect(result.lockfile).toBe("bun.lock");
      expect(result.hasMultipleLockfiles).toBe(true);
      expect(result.detectedLockfiles).toContain("bun.lock");
      expect(result.detectedLockfiles).toContain("yarn.lock");
      expect(result.detectedLockfiles.length).toBe(2);
    });
  });

  describe("corepack detection", () => {
    it("detects package manager from corepack packageManager field", async () => {
      const result = await detectPackageManager(join(fixturesPath, "corepack-project"));

      // No lockfile, so it should use corepack spec
      expect(result.name).toBe("pnpm");
      expect(result.lockfile).toBe(null);
      expect(result.corepackSpec).toBe("pnpm@8.15.0");
      expect(result.installCommand).toBe("pnpm install");
      expect(result.upgradeCommand).toBe("pnpm update");
    });
  });

  describe("fallback behavior", () => {
    it("falls back to npm when no lockfile exists and no corepack spec", async () => {
      const result = await detectPackageManager(join(fixturesPath, "no-lockfile"));

      expect(result.name).toBe("npm");
      expect(result.lockfile).toBe(null);
      expect(result.hasMultipleLockfiles).toBe(false);
      expect(result.detectedLockfiles).toEqual([]);
      expect(result.corepackSpec).toBe(null);
    });
  });

  describe("sample project", () => {
    it("correctly detects pnpm in sample project", async () => {
      const result = await detectPackageManager(join(fixturesPath, "sample-project"));

      expect(result.name).toBe("pnpm");
      expect(result.lockfile).toBe("pnpm-lock.yaml");
      expect(result.hasMultipleLockfiles).toBe(false);
    });
  });
});
