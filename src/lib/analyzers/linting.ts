import { createLogger } from "../logger.ts";

const log = createLogger("linting");

/**
 * Detected linter type.
 */
export type LinterType = "biome" | "eslint" | "none";

/**
 * Result of analyzing linting setup.
 */
export interface LintingAnalysis {
  linter: LinterType;
  prettier: boolean;
  score: number;
  details: string;
}

/**
 * Options for the linting analyzer.
 */
export interface LintingAnalyzerOptions {
  cwd?: string;
}

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    const file = Bun.file(path);
    return await file.exists();
  } catch (error) {
    log.trace({ error, path }, "File existence check failed");
    return false;
  }
}

/**
 * Check if any of the files exist.
 */
async function anyFileExists(cwd: string, filenames: string[]): Promise<boolean> {
  for (const filename of filenames) {
    if (await fileExists(`${cwd}/${filename}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Detect Biome configuration.
 */
async function detectBiome(cwd: string): Promise<boolean> {
  const biomeConfigs = ["biome.json", "biome.jsonc"];
  return anyFileExists(cwd, biomeConfigs);
}

/**
 * Detect ESLint configuration.
 */
async function detectEslint(cwd: string): Promise<boolean> {
  const eslintConfigs = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.mjs",
    ".eslintrc.json",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
  ];

  if (await anyFileExists(cwd, eslintConfigs)) {
    return true;
  }

  // Also check package.json for eslintConfig field
  const packageJsonPath = `${cwd}/package.json`;
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await Bun.file(packageJsonPath).text();
      const pkg = JSON.parse(content) as { eslintConfig?: unknown };
      if (pkg.eslintConfig) {
        return true;
      }
    } catch (error) {
      log.trace({ error, path: packageJsonPath }, "Failed to parse package.json for eslintConfig");
    }
  }

  return false;
}

/**
 * Detect Prettier configuration.
 */
async function detectPrettier(cwd: string): Promise<boolean> {
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

  if (await anyFileExists(cwd, prettierConfigs)) {
    return true;
  }

  // Also check package.json for prettier field
  const packageJsonPath = `${cwd}/package.json`;
  if (await fileExists(packageJsonPath)) {
    try {
      const content = await Bun.file(packageJsonPath).text();
      const pkg = JSON.parse(content) as { prettier?: unknown };
      if (pkg.prettier) {
        return true;
      }
    } catch (error) {
      log.trace({ error, path: packageJsonPath }, "Failed to parse package.json for prettier");
    }
  }

  return false;
}

/**
 * Calculate linting score.
 *
 * Scoring:
 * - Biome: 100 (includes formatting)
 * - ESLint + Prettier: 80
 * - ESLint only: 50
 * - Prettier only: 20
 * - None: 0
 */
function calculateScore(linter: LinterType, prettier: boolean): number {
  if (linter === "biome") {
    return 100;
  }

  if (linter === "eslint") {
    return prettier ? 80 : 50;
  }

  // No linter
  return prettier ? 20 : 0;
}

/**
 * Generate human-readable details about the linting setup.
 */
function generateDetails(linter: LinterType, prettier: boolean): string {
  if (linter === "biome") {
    return "Biome configured";
  }

  if (linter === "eslint") {
    return prettier ? "ESLint + Prettier configured" : "ESLint configured (no Prettier)";
  }

  if (prettier) {
    return "Prettier only (no linter)";
  }

  return "No linting configured";
}

/**
 * Analyze linting setup in a project.
 *
 * Checks for:
 * - Biome configuration (biome.json, biome.jsonc)
 * - ESLint configuration (.eslintrc*, eslint.config.*)
 * - Prettier configuration (.prettierrc*, prettier.config.*)
 *
 * @param options - Analyzer options
 * @returns The linting analysis result
 */
export async function analyzeLinting(
  options: LintingAnalyzerOptions = {}
): Promise<LintingAnalysis> {
  const { cwd = process.cwd() } = options;

  log.info({ cwd }, "Starting linting analysis");

  // Detect linting tools
  const hasBiome = await detectBiome(cwd);
  const hasEslint = await detectEslint(cwd);
  const hasPrettier = await detectPrettier(cwd);

  // Determine linter type (Biome takes precedence)
  let linter: LinterType = "none";
  if (hasBiome) {
    linter = "biome";
  } else if (hasEslint) {
    linter = "eslint";
  }

  // For Biome, we don't need separate Prettier (Biome handles formatting)
  const prettier = hasBiome ? false : hasPrettier;

  const score = calculateScore(linter, prettier);
  const details = generateDetails(linter, prettier);

  log.info({ linter, prettier, score }, "Linting analysis complete");

  return {
    linter,
    prettier,
    score,
    details,
  };
}

// Export internals for testing
export const internals = {
  fileExists,
  anyFileExists,
  detectBiome,
  detectEslint,
  detectPrettier,
  calculateScore,
  generateDetails,
};
