import ts from "typescript";
import { createLogger } from "../logger.ts";

const log = createLogger("imports");

// ============================================================================
// Types
// ============================================================================

/**
 * Information about imports in a single file.
 */
export interface FileImportInfo {
  path: string;
  imports: string[];
  lines: number[];
}

/**
 * Breakdown of import types found.
 */
export interface ImportBreakdown {
  namedImports: string[];
  defaultImports: number;
  namespaceImports: number;
}

/**
 * Result of analyzing imports for a package.
 */
export interface ImportsAnalysis {
  package: string;
  totalImports: number;
  files: FileImportInfo[];
  breakdown: ImportBreakdown;
}

/**
 * Options for the imports analyzer.
 */
export interface ImportsAnalyzerOptions {
  cwd?: string;
  extensions?: string[];
  excludeDirs?: string[];
}

/**
 * Represents a single import found in a file.
 */
export interface ImportInfo {
  line: number;
  type: "named" | "default" | "namespace" | "require" | "dynamic" | "reexport";
  specifiers: string[];
}

// ============================================================================
// File Discovery
// ============================================================================

/**
 * Default file extensions to search.
 */
const DEFAULT_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];

/**
 * Default directories to exclude.
 */
const DEFAULT_EXCLUDE_DIRS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  "out",
  ".cache",
];

/**
 * Find all JS/TS files in the project.
 */
async function findFiles(cwd: string, options: ImportsAnalyzerOptions): Promise<string[]> {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const excludeDirs = options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS;

  const pattern = `**/*.{${extensions.join(",")}}`;
  const glob = new Bun.Glob(pattern);

  const files: string[] = [];

  for await (const file of glob.scan({ cwd, onlyFiles: true })) {
    // Check if file is in an excluded directory
    const shouldExclude = excludeDirs.some(
      (dir) => file.startsWith(`${dir}/`) || file.includes(`/${dir}/`)
    );

    if (!shouldExclude) {
      files.push(file);
    }
  }

  log.debug({ fileCount: files.length, cwd }, "Found files to analyze");
  return files;
}

// ============================================================================
// Package Name Matching
// ============================================================================

/**
 * Check if a module specifier matches the target package.
 *
 * Handles:
 * - Exact match: 'lodash' matches 'lodash'
 * - Subpath: 'lodash/debounce' matches 'lodash'
 * - Scoped packages: '@tanstack/react-query' matches '@tanstack/react-query'
 * - Scoped subpath: '@tanstack/react-query/something' matches '@tanstack/react-query'
 */
export function matchesPackage(moduleSpecifier: string, targetPackage: string): boolean {
  // Exact match
  if (moduleSpecifier === targetPackage) {
    return true;
  }

  // Subpath match: 'lodash/debounce' starts with 'lodash/'
  if (moduleSpecifier.startsWith(`${targetPackage}/`)) {
    return true;
  }

  return false;
}

/**
 * Extract the subpath from a module specifier.
 * Returns null if it's not a subpath import.
 */
export function extractSubpath(moduleSpecifier: string, targetPackage: string): string | null {
  if (moduleSpecifier === targetPackage) {
    return null;
  }

  if (moduleSpecifier.startsWith(`${targetPackage}/`)) {
    return moduleSpecifier.slice(targetPackage.length + 1);
  }

  return null;
}

// ============================================================================
// AST Parsing
// ============================================================================

/**
 * Parse a file and find all imports of the target package.
 */
export function findImportsInFile(
  code: string,
  filename: string,
  targetPackage: string
): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // Create a source file from the code
  const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);

  // Visit each node in the AST
  function visit(node: ts.Node): void {
    // Handle: import { a, b } from 'pkg' / import pkg from 'pkg' / import * as pkg from 'pkg'
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier)) {
        const moduleName = moduleSpecifier.text;

        if (matchesPackage(moduleName, targetPackage)) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          const importClause = node.importClause;

          if (importClause) {
            const specifiers: string[] = [];
            let type: ImportInfo["type"] = "named";

            // Default import: import pkg from 'pkg'
            if (importClause.name) {
              type = "default";
              specifiers.push(importClause.name.text);
            }

            // Named bindings
            if (importClause.namedBindings) {
              // Namespace import: import * as pkg from 'pkg'
              if (ts.isNamespaceImport(importClause.namedBindings)) {
                type = "namespace";
                specifiers.push(`* as ${importClause.namedBindings.name.text}`);
              }
              // Named imports: import { a, b } from 'pkg'
              else if (ts.isNamedImports(importClause.namedBindings)) {
                type = importClause.name ? "default" : "named"; // Mixed: import pkg, { a } from 'pkg'
                for (const element of importClause.namedBindings.elements) {
                  if (element.propertyName) {
                    // import { original as alias }
                    specifiers.push(element.propertyName.text);
                  } else {
                    specifiers.push(element.name.text);
                  }
                }
              }
            }

            // Handle subpath imports by including the subpath in specifiers
            const subpath = extractSubpath(moduleName, targetPackage);
            if (subpath && specifiers.length === 0) {
              // For default imports from subpaths like: import debounce from 'lodash/debounce'
              specifiers.push(subpath);
            }

            imports.push({ line, type, specifiers });
          } else {
            // Side-effect import: import 'pkg'
            imports.push({ line, type: "named", specifiers: [] });
          }
        }
      }
    }

    // Handle: export { a, b } from 'pkg'
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const moduleName = node.moduleSpecifier.text;

        if (matchesPackage(moduleName, targetPackage)) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          const specifiers: string[] = [];

          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              if (element.propertyName) {
                specifiers.push(element.propertyName.text);
              } else {
                specifiers.push(element.name.text);
              }
            }
          }

          imports.push({ line, type: "reexport", specifiers });
        }
      }
    }

    // Handle: const pkg = require('pkg')
    if (ts.isCallExpression(node)) {
      const expression = node.expression;

      // require('pkg')
      if (ts.isIdentifier(expression) && expression.text === "require") {
        const args = node.arguments;
        const firstArg = args[0];
        if (firstArg && ts.isStringLiteral(firstArg)) {
          const moduleName = firstArg.text;

          if (matchesPackage(moduleName, targetPackage)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            const specifiers: string[] = [];

            // Try to get the variable name from the parent
            const parent = node.parent;
            if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
              specifiers.push(parent.name.text);
            }

            // Handle subpath imports
            const subpath = extractSubpath(moduleName, targetPackage);
            if (subpath && specifiers.length === 0) {
              specifiers.push(subpath);
            }

            imports.push({ line, type: "require", specifiers });
          }
        }
      }

      // Dynamic import: import('pkg')
      if (expression.kind === ts.SyntaxKind.ImportKeyword) {
        const args = node.arguments;
        const firstArg = args[0];
        if (firstArg && ts.isStringLiteral(firstArg)) {
          const moduleName = firstArg.text;

          if (matchesPackage(moduleName, targetPackage)) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            const specifiers: string[] = [];

            // Handle subpath imports
            const subpath = extractSubpath(moduleName, targetPackage);
            if (subpath) {
              specifiers.push(subpath);
            }

            imports.push({ line, type: "dynamic", specifiers });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return imports;
}

// ============================================================================
// Main Analyzer
// ============================================================================

/**
 * Analyze imports of a package across the codebase.
 */
export async function analyzeImports(
  packageName: string,
  options: ImportsAnalyzerOptions = {}
): Promise<ImportsAnalysis> {
  const cwd = options.cwd ?? process.cwd();

  log.info({ packageName, cwd }, "Starting import analysis");

  // Find all source files
  const files = await findFiles(cwd, options);

  // Analyze each file
  const fileImports: FileImportInfo[] = [];
  const allNamedImports = new Set<string>();
  let defaultImportCount = 0;
  let namespaceImportCount = 0;
  let totalImportCount = 0;

  for (const file of files) {
    const filePath = `${cwd}/${file}`;

    try {
      const content = await Bun.file(filePath).text();
      const imports = findImportsInFile(content, file, packageName);

      if (imports.length > 0) {
        const lines: number[] = [];
        const importSpecifiers: string[] = [];

        for (const imp of imports) {
          lines.push(imp.line);
          totalImportCount++;

          // Track import types for breakdown
          switch (imp.type) {
            case "default":
              defaultImportCount++;
              break;
            case "namespace":
              namespaceImportCount++;
              break;
          }

          // Collect specifiers
          for (const spec of imp.specifiers) {
            if (!spec.startsWith("* as ")) {
              allNamedImports.add(spec);
              importSpecifiers.push(spec);
            }
          }
        }

        // Use relative path from cwd
        fileImports.push({
          path: file,
          imports: importSpecifiers,
          lines,
        });
      }
    } catch (error) {
      log.warn({ file, error }, "Failed to analyze file");
    }
  }

  log.info(
    { packageName, fileCount: fileImports.length, totalImports: totalImportCount },
    "Import analysis complete"
  );

  return {
    package: packageName,
    totalImports: totalImportCount,
    files: fileImports,
    breakdown: {
      namedImports: Array.from(allNamedImports).sort(),
      defaultImports: defaultImportCount,
      namespaceImports: namespaceImportCount,
    },
  };
}

// Export internals for testing
export const internals = {
  findFiles,
  findImportsInFile,
  matchesPackage,
  extractSubpath,
};
