import { describe, expect, it } from "bun:test";
import { analyzeImports, internals } from "../../../src/lib/analyzers/imports.ts";

const { findImportsInFile, matchesPackage, extractSubpath } = internals;

// Path to test fixtures
const FIXTURES_PATH = `${import.meta.dir}/../../fixtures/imports-test-project`;

describe("imports analyzer", () => {
  describe("matchesPackage", () => {
    it("matches exact package name", () => {
      expect(matchesPackage("lodash", "lodash")).toBe(true);
    });

    it("matches subpath imports", () => {
      expect(matchesPackage("lodash/debounce", "lodash")).toBe(true);
      expect(matchesPackage("lodash/fp/map", "lodash")).toBe(true);
    });

    it("matches scoped packages", () => {
      expect(matchesPackage("@tanstack/react-query", "@tanstack/react-query")).toBe(true);
    });

    it("matches scoped package subpaths", () => {
      expect(matchesPackage("@tanstack/react-query/something", "@tanstack/react-query")).toBe(true);
    });

    it("does not match different packages", () => {
      expect(matchesPackage("lodash-es", "lodash")).toBe(false);
      expect(matchesPackage("underscore", "lodash")).toBe(false);
    });

    it("does not match partial package names", () => {
      expect(matchesPackage("lodash", "lod")).toBe(false);
    });
  });

  describe("extractSubpath", () => {
    it("returns null for exact package match", () => {
      expect(extractSubpath("lodash", "lodash")).toBeNull();
    });

    it("extracts subpath from import", () => {
      expect(extractSubpath("lodash/debounce", "lodash")).toBe("debounce");
      expect(extractSubpath("lodash/fp/map", "lodash")).toBe("fp/map");
    });

    it("extracts subpath from scoped packages", () => {
      expect(extractSubpath("@tanstack/react-query/something", "@tanstack/react-query")).toBe(
        "something"
      );
    });

    it("returns null for non-matching packages", () => {
      expect(extractSubpath("lodash-es", "lodash")).toBeNull();
    });
  });

  describe("findImportsInFile", () => {
    it("finds named imports", () => {
      const code = `import { debounce, throttle } from "lodash";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("named");
      expect(imports[0]?.specifiers).toEqual(["debounce", "throttle"]);
      expect(imports[0]?.line).toBe(1);
    });

    it("finds default imports", () => {
      const code = `import _ from "lodash";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("default");
      expect(imports[0]?.specifiers).toEqual(["_"]);
      expect(imports[0]?.line).toBe(1);
    });

    it("finds namespace imports", () => {
      const code = `import * as lodash from "lodash";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("namespace");
      expect(imports[0]?.specifiers).toEqual(["* as lodash"]);
      expect(imports[0]?.line).toBe(1);
    });

    it("finds mixed imports (default + named)", () => {
      const code = `import _, { pick, omit } from "lodash";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("default");
      expect(imports[0]?.specifiers).toContain("_");
      expect(imports[0]?.specifiers).toContain("pick");
      expect(imports[0]?.specifiers).toContain("omit");
    });

    it("finds require calls", () => {
      const code = `const lodash = require("lodash");`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("require");
      expect(imports[0]?.specifiers).toEqual(["lodash"]);
    });

    it("finds dynamic imports", () => {
      const code = `const lodash = await import("lodash");`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("dynamic");
    });

    it("finds subpath imports", () => {
      const code = `import debounce from "lodash/debounce";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("default");
      expect(imports[0]?.specifiers).toContain("debounce");
    });

    it("finds re-exports", () => {
      const code = `export { debounce, throttle } from "lodash";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("reexport");
      expect(imports[0]?.specifiers).toEqual(["debounce", "throttle"]);
    });

    it("finds scoped package imports", () => {
      const code = `import { useQuery } from "@tanstack/react-query";`;
      const imports = findImportsInFile(code, "test.ts", "@tanstack/react-query");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("named");
      expect(imports[0]?.specifiers).toEqual(["useQuery"]);
    });

    it("handles aliased imports", () => {
      const code = `import { debounce as debounceFn } from "lodash";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("named");
      // Should extract original name, not alias
      expect(imports[0]?.specifiers).toEqual(["debounce"]);
    });

    it("finds multiple imports in same file", () => {
      const code = `
import { debounce } from "lodash";
import { throttle } from "lodash";
import merge from "lodash/merge";
`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(3);
      expect(imports[0]?.line).toBe(2);
      expect(imports[1]?.line).toBe(3);
      expect(imports[2]?.line).toBe(4);
    });

    it("returns empty array for files without target package", () => {
      const code = `import { useState } from "react";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(0);
    });

    it("handles side-effect imports", () => {
      const code = `import "lodash";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("named");
      expect(imports[0]?.specifiers).toEqual([]);
    });

    it("finds dynamic imports in different contexts", () => {
      const code = `
async function load() {
  const mod = await import("lodash");
  return mod;
}
`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("dynamic");
    });

    it("handles multiple dynamic imports", () => {
      const code = `
async function load() {
  const lodash = await import("lodash");
  const { debounce } = await import("lodash");
  return { lodash, debounce };
}
`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(2);
      expect(imports[0]?.type).toBe("dynamic");
      expect(imports[1]?.type).toBe("dynamic");
    });

    it("handles re-exports with aliases", () => {
      const code = `export { pick as selectKeys } from "lodash";`;
      const imports = findImportsInFile(code, "test.ts", "lodash");

      expect(imports).toHaveLength(1);
      expect(imports[0]?.type).toBe("reexport");
      // Should extract original name
      expect(imports[0]?.specifiers).toEqual(["pick"]);
    });
  });

  describe("analyzeImports", () => {
    it("analyzes lodash imports in test fixture project", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // Should find files with lodash imports
      expect(result.package).toBe("lodash");
      expect(result.files.length).toBeGreaterThan(0);

      // Should have found the named imports file
      const namedFile = result.files.find((f) => f.path.includes("named-imports.ts"));
      expect(namedFile).toBeDefined();
      expect(namedFile?.imports).toContain("debounce");
      expect(namedFile?.imports).toContain("throttle");

      // Should have breakdown
      expect(result.breakdown.namedImports.length).toBeGreaterThan(0);
    });

    it("analyzes scoped package imports", async () => {
      const result = await analyzeImports("@tanstack/react-query", { cwd: FIXTURES_PATH });

      expect(result.package).toBe("@tanstack/react-query");
      expect(result.files.length).toBeGreaterThan(0);

      const scopedFile = result.files.find((f) => f.path.includes("scoped-import.ts"));
      expect(scopedFile).toBeDefined();
      expect(scopedFile?.imports).toContain("useQuery");
      expect(scopedFile?.imports).toContain("useMutation");
    });

    it("returns empty results for package not found", async () => {
      const result = await analyzeImports("nonexistent-package", { cwd: FIXTURES_PATH });

      expect(result.package).toBe("nonexistent-package");
      expect(result.totalImports).toBe(0);
      expect(result.files).toHaveLength(0);
    });

    it("counts default imports in breakdown", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // Should have at least one default import from default-import.ts
      expect(result.breakdown.defaultImports).toBeGreaterThan(0);
    });

    it("counts namespace imports in breakdown", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // Should have at least one namespace import from namespace-import.ts
      expect(result.breakdown.namespaceImports).toBeGreaterThan(0);
    });

    it("excludes node_modules by default", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // Should not include any files from node_modules
      const nodeModulesFiles = result.files.filter((f) => f.path.includes("node_modules"));
      expect(nodeModulesFiles).toHaveLength(0);
    });

    it("tracks line numbers correctly", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // All files should have line numbers
      for (const file of result.files) {
        expect(file.lines.length).toBeGreaterThan(0);
        for (const line of file.lines) {
          expect(typeof line).toBe("number");
          expect(line).toBeGreaterThan(0);
        }
      }
    });

    it("finds multiple imports in single file", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // multiple-imports.ts has 3 import statements
      const multipleFile = result.files.find((f) => f.path.includes("multiple-imports.ts"));
      expect(multipleFile).toBeDefined();
      expect(multipleFile?.lines.length).toBe(3);
    });

    it("finds subpath imports", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // subpath-import.ts imports from lodash/debounce and lodash/throttle
      const subpathFile = result.files.find((f) => f.path.includes("subpath-import.ts"));
      expect(subpathFile).toBeDefined();
      expect(subpathFile?.lines.length).toBe(2);
    });

    it("finds re-exports", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // reexport.ts has re-exports
      const reexportFile = result.files.find((f) => f.path.includes("reexport.ts"));
      expect(reexportFile).toBeDefined();
    });

    it("does not include files without the package", async () => {
      const result = await analyzeImports("lodash", { cwd: FIXTURES_PATH });

      // no-lodash.ts should not be in the results
      const noLodashFile = result.files.find((f) => f.path.includes("no-lodash.ts"));
      expect(noLodashFile).toBeUndefined();
    });
  });
});
