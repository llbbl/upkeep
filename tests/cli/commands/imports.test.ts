import { describe, expect, test } from "bun:test";
import { getFixturePath, parseJsonOutput, runCli } from "../../helpers/run-cli.ts";

interface ImportsResult {
  package: string;
  totalImports: number;
  files: Array<{
    path: string;
    imports: string[];
    lines: number[];
  }>;
  breakdown: {
    namedImports: string[];
    defaultImports: number;
    namespaceImports: number;
  };
}

describe("upkeep imports", () => {
  describe("help flag", () => {
    test("shows help with --help flag", async () => {
      const { stdout, exitCode } = await runCli(["imports", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("upkeep imports");
      expect(stdout).toContain("Analyze package usage");
      expect(stdout).toContain("<package>");
    });

    test("shows help with -h flag", async () => {
      const { stdout, exitCode } = await runCli(["imports", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("upkeep imports");
    });
  });

  describe("missing package argument", () => {
    test("returns error when package name is not provided", async () => {
      const { stderr, exitCode } = await runCli(["imports"]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Package name is required");
    });
  });

  describe("lodash imports in test fixture", () => {
    test("finds lodash imports", async () => {
      const { stdout, exitCode } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<ImportsResult>(stdout);
      expect(result.package).toBe("lodash");
      expect(result.totalImports).toBeGreaterThan(0);
      expect(result.files.length).toBeGreaterThan(0);
    });

    test("finds named imports file", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const namedFile = result.files.find((f) => f.path.includes("named-imports.ts"));
      expect(namedFile).toBeDefined();
      expect(namedFile?.imports).toContain("debounce");
      expect(namedFile?.imports).toContain("throttle");
    });

    test("finds default imports file", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const defaultFile = result.files.find((f) => f.path.includes("default-import.ts"));
      expect(defaultFile).toBeDefined();
      expect(result.breakdown.defaultImports).toBeGreaterThan(0);
    });

    test("finds namespace imports", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const namespaceFile = result.files.find((f) => f.path.includes("namespace-import.ts"));
      expect(namespaceFile).toBeDefined();
      expect(result.breakdown.namespaceImports).toBeGreaterThan(0);
    });

    test("finds subpath imports", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const subpathFile = result.files.find((f) => f.path.includes("subpath-import.ts"));
      expect(subpathFile).toBeDefined();
      expect(subpathFile?.lines.length).toBeGreaterThanOrEqual(2);
    });

    test("finds multiple imports in single file", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const multipleFile = result.files.find((f) => f.path.includes("multiple-imports.ts"));
      expect(multipleFile).toBeDefined();
      expect(multipleFile?.lines.length).toBe(3);
    });

    test("finds re-exports", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const reexportFile = result.files.find((f) => f.path.includes("reexport.ts"));
      expect(reexportFile).toBeDefined();
    });

    test("excludes files without the package", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const noLodashFile = result.files.find((f) => f.path.includes("no-lodash.ts"));
      expect(noLodashFile).toBeUndefined();
    });
  });

  describe("scoped packages", () => {
    test("finds @tanstack/react-query imports", async () => {
      const { stdout, exitCode } = await runCli(
        ["imports", "@tanstack/react-query"],
        getFixturePath("imports-test-project")
      );

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<ImportsResult>(stdout);
      expect(result.package).toBe("@tanstack/react-query");
      expect(result.totalImports).toBeGreaterThan(0);

      const scopedFile = result.files.find((f) => f.path.includes("scoped-import.ts"));
      expect(scopedFile).toBeDefined();
      expect(scopedFile?.imports).toContain("useQuery");
      expect(scopedFile?.imports).toContain("useMutation");
    });
  });

  describe("unused package", () => {
    test("returns empty result for nonexistent package", async () => {
      const { stdout, exitCode } = await runCli(
        ["imports", "nonexistent-package-xyz"],
        getFixturePath("imports-test-project")
      );

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<ImportsResult>(stdout);
      expect(result.package).toBe("nonexistent-package-xyz");
      expect(result.totalImports).toBe(0);
      expect(result.files).toHaveLength(0);
    });
  });

  describe("output format", () => {
    test("outputs valid JSON", async () => {
      const { stdout, exitCode } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      expect(exitCode).toBe(0);

      // Should not throw
      const result = JSON.parse(stdout);
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });

    test("includes all expected fields", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      expect("package" in result).toBe(true);
      expect("totalImports" in result).toBe(true);
      expect("files" in result).toBe(true);
      expect("breakdown" in result).toBe(true);
      expect("namedImports" in result.breakdown).toBe(true);
      expect("defaultImports" in result.breakdown).toBe(true);
      expect("namespaceImports" in result.breakdown).toBe(true);
    });

    test("files have correct structure", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      for (const file of result.files) {
        expect(typeof file.path).toBe("string");
        expect(Array.isArray(file.imports)).toBe(true);
        expect(Array.isArray(file.lines)).toBe(true);
        expect(file.lines.length).toBeGreaterThan(0);

        for (const line of file.lines) {
          expect(typeof line).toBe("number");
          expect(line).toBeGreaterThan(0);
        }
      }
    });

    test("breakdown has sorted named imports", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      // Named imports should be sorted alphabetically
      const sorted = [...result.breakdown.namedImports].sort();
      expect(result.breakdown.namedImports).toEqual(sorted);
    });
  });

  describe("edge cases", () => {
    test("handles project without any source files", async () => {
      // no-lockfile fixture has only package.json
      const { stdout, exitCode } = await runCli(
        ["imports", "lodash"],
        getFixturePath("no-lockfile")
      );

      expect(exitCode).toBe(0);

      const result = parseJsonOutput<ImportsResult>(stdout);
      expect(result.totalImports).toBe(0);
      expect(result.files).toHaveLength(0);
    });

    test("handles require imports", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const requireFile = result.files.find((f) => f.path.includes("require-import.ts"));
      expect(requireFile).toBeDefined();
    });

    test("handles dynamic imports", async () => {
      const { stdout } = await runCli(
        ["imports", "lodash"],
        getFixturePath("imports-test-project")
      );

      const result = parseJsonOutput<ImportsResult>(stdout);

      const dynamicFile = result.files.find((f) => f.path.includes("dynamic-import.ts"));
      expect(dynamicFile).toBeDefined();
    });
  });
});
