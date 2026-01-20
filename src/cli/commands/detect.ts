import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { detectPackageManager } from "../../lib/analyzers/package-manager.ts";
import { createLogger } from "../../lib/logger.ts";

const log = createLogger("detect");

export interface DetectResult {
  packageManager: string;
  lockfile: string | null;
  typescript: boolean;
  biome: boolean;
  prettier: boolean;
  testRunner: string | null;
  coverage: boolean;
  ci: string | null;
}

/**
 * Check if any file matching a pattern exists in the directory.
 */
function fileExists(projectPath: string, filename: string): boolean {
  return existsSync(join(projectPath, filename));
}

/**
 * Check if any files matching patterns exist in the directory.
 */
async function anyFileMatches(projectPath: string, patterns: string[]): Promise<boolean> {
  for (const pattern of patterns) {
    if (fileExists(projectPath, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Detect TypeScript configuration.
 */
function detectTypeScript(projectPath: string): boolean {
  return fileExists(projectPath, "tsconfig.json");
}

/**
 * Detect Biome configuration.
 */
async function detectBiome(projectPath: string): Promise<boolean> {
  const biomeConfigs = ["biome.json", "biome.jsonc"];

  return anyFileMatches(projectPath, biomeConfigs);
}

/**
 * Detect Prettier configuration.
 */
async function detectPrettier(projectPath: string): Promise<boolean> {
  const prettierConfigs = [
    ".prettierrc",
    ".prettierrc.js",
    ".prettierrc.cjs",
    ".prettierrc.mjs",
    ".prettierrc.json",
    ".prettierrc.yaml",
    ".prettierrc.yml",
    ".prettierrc.toml",
    "prettier.config.js",
    "prettier.config.mjs",
    "prettier.config.cjs",
    "prettier.config.ts",
  ];

  return anyFileMatches(projectPath, prettierConfigs);
}

/**
 * Detect test runner from config files and package.json.
 */
async function detectTestRunner(projectPath: string): Promise<string | null> {
  // Check for vitest
  const vitestConfigs = [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mts",
    "vitest.config.mjs",
  ];
  if (await anyFileMatches(projectPath, vitestConfigs)) {
    return "vitest";
  }

  // Check for jest
  const jestConfigs = [
    "jest.config.ts",
    "jest.config.js",
    "jest.config.mjs",
    "jest.config.cjs",
    "jest.config.json",
  ];
  if (await anyFileMatches(projectPath, jestConfigs)) {
    return "jest";
  }

  // Check package.json scripts
  const packageJsonPath = join(projectPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const content = await Bun.file(packageJsonPath).text();
      const pkg = JSON.parse(content) as {
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };

      // Check scripts for test runner hints
      const testScript = pkg.scripts?.test ?? "";
      if (testScript.includes("vitest")) return "vitest";
      if (testScript.includes("jest")) return "jest";
      if (testScript.includes("mocha")) return "mocha";
      if (testScript.includes("ava")) return "ava";
      if (testScript.includes("tap")) return "tap";
      if (testScript.includes("bun test")) return "bun";

      // Check devDependencies
      const devDeps = pkg.devDependencies ?? {};
      if ("vitest" in devDeps) return "vitest";
      if ("jest" in devDeps) return "jest";
      if ("mocha" in devDeps) return "mocha";
      if ("ava" in devDeps) return "ava";
      if ("tap" in devDeps) return "tap";
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Detect coverage configuration.
 */
async function detectCoverage(projectPath: string): Promise<boolean> {
  // Check for coverage config files
  const coverageConfigs = [
    ".nycrc",
    ".nycrc.json",
    ".nycrc.yml",
    ".nycrc.yaml",
    ".c8rc",
    ".c8rc.json",
    "coverage",
  ];

  if (await anyFileMatches(projectPath, coverageConfigs)) {
    return true;
  }

  // Check package.json for coverage config or c8/nyc in devDependencies
  const packageJsonPath = join(projectPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const content = await Bun.file(packageJsonPath).text();
      const pkg = JSON.parse(content) as {
        nyc?: unknown;
        c8?: unknown;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };

      // Check for inline config
      if (pkg.nyc || pkg.c8) return true;

      // Check devDependencies
      const devDeps = pkg.devDependencies ?? {};
      if (
        "nyc" in devDeps ||
        "c8" in devDeps ||
        "@vitest/coverage-v8" in devDeps ||
        "@vitest/coverage-istanbul" in devDeps
      ) {
        return true;
      }

      // Check scripts for coverage commands
      const scripts = pkg.scripts ?? {};
      for (const script of Object.values(scripts)) {
        if (script.includes("--coverage") || script.includes("coverage")) {
          return true;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return false;
}

/**
 * Detect CI configuration.
 */
async function detectCI(projectPath: string): Promise<string | null> {
  // Check for GitHub Actions
  const githubWorkflowsPath = join(projectPath, ".github", "workflows");
  if (existsSync(githubWorkflowsPath)) {
    try {
      const files = await readdir(githubWorkflowsPath);
      const hasWorkflows = files.some((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
      if (hasWorkflows) return "github-actions";
    } catch {
      // Ignore errors
    }
  }

  // Check for GitLab CI
  if (fileExists(projectPath, ".gitlab-ci.yml")) {
    return "gitlab-ci";
  }

  // Check for CircleCI
  if (existsSync(join(projectPath, ".circleci", "config.yml"))) {
    return "circleci";
  }

  // Check for Travis CI
  if (fileExists(projectPath, ".travis.yml")) {
    return "travis-ci";
  }

  // Check for Jenkins
  if (fileExists(projectPath, "Jenkinsfile")) {
    return "jenkins";
  }

  // Check for Azure Pipelines
  if (fileExists(projectPath, "azure-pipelines.yml")) {
    return "azure-pipelines";
  }

  return null;
}

/**
 * Run project detection and output results.
 */
export async function detect(args: string[]): Promise<void> {
  const projectPath = process.cwd();

  log.debug({ projectPath }, "Starting project detection");

  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
upkeep detect - Detect project configuration

Usage: upkeep detect [options]

Options:
  --help, -h    Show this help message

Output:
  JSON object with detected project configuration
`);
    return;
  }

  log.debug("Detecting package manager");
  const pmInfo = await detectPackageManager(projectPath);
  log.debug({ packageManager: pmInfo.name, lockfile: pmInfo.lockfile }, "Package manager detected");

  log.debug("Detecting TypeScript configuration");
  const typescript = detectTypeScript(projectPath);
  log.debug({ typescript }, "TypeScript detection complete");

  log.debug("Detecting Biome configuration");
  const biome = await detectBiome(projectPath);
  log.debug({ biome }, "Biome detection complete");

  log.debug("Detecting Prettier configuration");
  const prettier = await detectPrettier(projectPath);
  log.debug({ prettier }, "Prettier detection complete");

  log.debug("Detecting test runner");
  const testRunner = await detectTestRunner(projectPath);
  log.debug({ testRunner }, "Test runner detection complete");

  log.debug("Detecting coverage configuration");
  const coverage = await detectCoverage(projectPath);
  log.debug({ coverage }, "Coverage detection complete");

  log.debug("Detecting CI configuration");
  const ci = await detectCI(projectPath);
  log.debug({ ci }, "CI detection complete");

  const result: DetectResult = {
    packageManager: pmInfo.name,
    lockfile: pmInfo.lockfile,
    typescript,
    biome,
    prettier,
    testRunner,
    coverage,
    ci,
  };

  // Warn about multiple lockfiles
  if (pmInfo.hasMultipleLockfiles) {
    log.warn(
      { detectedLockfiles: pmInfo.detectedLockfiles, primaryLockfile: pmInfo.lockfile },
      "Multiple lockfiles detected"
    );
    console.error(`Warning: Multiple lockfiles detected: ${pmInfo.detectedLockfiles.join(", ")}`);
    console.error(`Using ${pmInfo.lockfile} (highest priority)`);
  }

  log.debug({ result }, "Detection complete");
  console.log(JSON.stringify(result, null, 2));
}
