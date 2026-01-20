/**
 * Risk assessment for package upgrades.
 *
 * Calculates a risk score based on multiple factors:
 * - Update type (major/minor/patch)
 * - Usage scope (number of files importing the package)
 * - Critical path usage (API routes, middleware, auth)
 * - Test coverage (files with corresponding test files)
 */

import { analyzeImports } from "../analyzers/imports.ts";
import { createLogger } from "../logger.ts";
import { exec } from "../utils/exec.ts";
import { getUpdateType, type UpdateType } from "../utils/semver.ts";

const log = createLogger("risk");

// ============================================================================
// Types
// ============================================================================

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskFactor {
  score: number;
  reason: string;
}

export interface RiskFactors {
  updateType: RiskFactor;
  usageScope: RiskFactor;
  criticalPaths: RiskFactor;
  testCoverage: RiskFactor;
}

export interface RiskAssessment {
  package: string;
  from: string;
  to: string;
  updateType: UpdateType;
  riskScore: number;
  riskLevel: RiskLevel;
  factors: RiskFactors;
  recommendations: string[];
}

export interface RiskAssessmentOptions {
  cwd?: string | undefined;
  fromVersion?: string | undefined;
  toVersion?: string | undefined;
}

// ============================================================================
// Version Detection
// ============================================================================

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Clean version string by removing semver range prefixes.
 * E.g., "^1.2.3" -> "1.2.3", "~1.2.3" -> "1.2.3"
 */
export function cleanVersionString(version: string): string {
  return version.replace(/^[\^~>=<]+/, "");
}

/**
 * Get the current version of a package from package.json.
 */
export async function getCurrentVersion(packageName: string, cwd: string): Promise<string | null> {
  try {
    const packageJsonPath = `${cwd}/package.json`;
    const content = await Bun.file(packageJsonPath).text();
    const pkg: PackageJson = JSON.parse(content);

    const version = pkg.dependencies?.[packageName] ?? pkg.devDependencies?.[packageName];

    if (!version) {
      return null;
    }

    return cleanVersionString(version);
  } catch (error) {
    log.debug({ error, packageName, cwd }, "Failed to read package.json");
    return null;
  }
}

/**
 * Get the latest version of a package from npm registry.
 * Uses the safe exec utility that uses Bun.spawn with array arguments
 * (no shell injection risk).
 */
export async function getLatestVersion(packageName: string, cwd: string): Promise<string | null> {
  try {
    // Use npm view to get the latest version
    // The exec utility uses Bun.spawn with array args, which is safe
    const result = await exec("npm", ["view", packageName, "version"], { cwd });

    if (result.exitCode !== 0) {
      log.debug({ stderr: result.stderr, packageName }, "npm view failed");
      return null;
    }

    return result.stdout.trim();
  } catch (error) {
    log.debug({ error, packageName }, "Failed to get latest version");
    return null;
  }
}

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Calculate score for update type factor (0-40 points).
 */
export function scoreUpdateType(updateType: UpdateType): RiskFactor {
  switch (updateType) {
    case "major":
      return { score: 40, reason: "Major version bump" };
    case "minor":
      return { score: 15, reason: "Minor version bump" };
    case "patch":
      return { score: 5, reason: "Patch version bump" };
    case "none":
      return { score: 0, reason: "No version change" };
  }
}

/**
 * Calculate score for usage scope factor (0-30 points).
 */
export function scoreUsageScope(fileCount: number): RiskFactor {
  if (fileCount === 0) {
    return { score: 0, reason: "Not used in any files" };
  }

  if (fileCount <= 5) {
    return { score: 10, reason: `Used in ${fileCount} file${fileCount > 1 ? "s" : ""}` };
  }

  if (fileCount <= 20) {
    return { score: 20, reason: `Used in ${fileCount} files` };
  }

  return { score: 30, reason: `Used in ${fileCount} files` };
}

/**
 * Critical path patterns to check for.
 */
const CRITICAL_PATH_PATTERNS = {
  api: /(?:^|\/)api\//,
  routes: /(?:^|\/)routes\//,
  middleware: /middleware/i,
  auth: /auth/i,
} as const;

export interface CriticalPathResult {
  hasApiRoutes: boolean;
  hasMiddleware: boolean;
  hasAuth: boolean;
}

/**
 * Detect critical path usage in file paths.
 */
export function detectCriticalPaths(filePaths: string[]): CriticalPathResult {
  const result: CriticalPathResult = {
    hasApiRoutes: false,
    hasMiddleware: false,
    hasAuth: false,
  };

  for (const path of filePaths) {
    if (CRITICAL_PATH_PATTERNS.api.test(path) || CRITICAL_PATH_PATTERNS.routes.test(path)) {
      result.hasApiRoutes = true;
    }
    if (CRITICAL_PATH_PATTERNS.middleware.test(path)) {
      result.hasMiddleware = true;
    }
    if (CRITICAL_PATH_PATTERNS.auth.test(path)) {
      result.hasAuth = true;
    }
  }

  return result;
}

/**
 * Calculate score for critical path factor (0-20 points).
 */
export function scoreCriticalPaths(filePaths: string[]): RiskFactor {
  const critical = detectCriticalPaths(filePaths);

  let score = 0;
  const reasons: string[] = [];

  if (critical.hasApiRoutes) {
    score += 10;
    reasons.push("API routes");
  }

  if (critical.hasMiddleware) {
    score += 5;
    reasons.push("middleware");
  }

  if (critical.hasAuth) {
    score += 5;
    reasons.push("auth");
  }

  if (reasons.length === 0) {
    return { score: 0, reason: "Not used in critical paths" };
  }

  return {
    score: Math.min(score, 20), // Cap at 20
    reason: `Used in ${reasons.join(" and ")}`,
  };
}

/**
 * Check if a test file exists for a source file.
 */
export async function hasTestFile(filePath: string, cwd: string): Promise<boolean> {
  // Common test file patterns
  const basePath = filePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  const ext = filePath.match(/\.(ts|tsx|js|jsx|mjs|cjs)$/)?.[0] ?? ".ts";

  const testPatterns = [
    `${basePath}.test${ext}`,
    `${basePath}.spec${ext}`,
    `${basePath.replace(/\/([^/]+)$/, "/__tests__/$1")}${ext}`,
    `${basePath.replace(/^src\//, "tests/")}${ext.replace(/^\./, ".test.")}`,
    `${basePath.replace(/^src\//, "tests/")}.test${ext}`,
  ];

  for (const pattern of testPatterns) {
    const testPath = `${cwd}/${pattern}`;
    const file = Bun.file(testPath);
    if (await file.exists()) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate test coverage percentage for files.
 */
export async function calculateTestCoverage(filePaths: string[], cwd: string): Promise<number> {
  if (filePaths.length === 0) {
    return 100; // No files means nothing to test
  }

  let filesWithTests = 0;

  for (const filePath of filePaths) {
    if (await hasTestFile(filePath, cwd)) {
      filesWithTests++;
    }
  }

  return Math.round((filesWithTests / filePaths.length) * 100);
}

/**
 * Calculate score for test coverage factor (0-10 points).
 */
export function scoreTestCoverage(coveragePercent: number): RiskFactor {
  if (coveragePercent > 50) {
    return { score: 0, reason: `${coveragePercent}% of importing files have tests` };
  }

  if (coveragePercent > 0) {
    return { score: 5, reason: `${coveragePercent}% of importing files have tests` };
  }

  return { score: 10, reason: "No importing files have tests" };
}

// ============================================================================
// Risk Level Calculation
// ============================================================================

/**
 * Determine risk level from total score.
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score <= 25) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
}

// ============================================================================
// Recommendations Generation
// ============================================================================

/**
 * Generate recommendations based on risk factors.
 */
export function generateRecommendations(
  packageName: string,
  updateType: UpdateType,
  factors: RiskFactors,
  criticalPaths: CriticalPathResult
): string[] {
  const recommendations: string[] = [];

  // Update type recommendations
  if (updateType === "major") {
    recommendations.push(`Review ${packageName} migration guide`);
    recommendations.push("Run full test suite after upgrade");
  } else if (updateType === "minor") {
    recommendations.push(`Check ${packageName} changelog for new features`);
  }

  // Usage scope recommendations
  if (factors.usageScope.score >= 20) {
    recommendations.push("Consider incremental rollout");
  }

  // Critical path recommendations
  if (criticalPaths.hasApiRoutes) {
    recommendations.push("Test API routes manually");
  }

  if (criticalPaths.hasAuth) {
    recommendations.push("Verify auth flows");
  }

  if (criticalPaths.hasMiddleware) {
    recommendations.push("Check middleware compatibility");
  }

  // Test coverage recommendations
  if (factors.testCoverage.score >= 5) {
    recommendations.push("Add tests before upgrading");
  }

  return recommendations;
}

// ============================================================================
// Main Assessment Function
// ============================================================================

/**
 * Assess the risk of upgrading a package.
 */
export async function assessRisk(
  packageName: string,
  options: RiskAssessmentOptions = {}
): Promise<RiskAssessment> {
  const cwd = options.cwd ?? process.cwd();

  log.info({ packageName, cwd }, "Starting risk assessment");

  // Get versions
  let fromVersion = options.fromVersion;
  let toVersion = options.toVersion;

  if (!fromVersion) {
    const detected = await getCurrentVersion(packageName, cwd);
    if (!detected) {
      throw new Error(`Package "${packageName}" not found in package.json`);
    }
    fromVersion = detected;
  }

  if (!toVersion) {
    const latest = await getLatestVersion(packageName, cwd);
    if (!latest) {
      throw new Error(`Could not fetch latest version for "${packageName}"`);
    }
    toVersion = latest;
  }

  log.debug({ fromVersion, toVersion }, "Versions determined");

  // Get update type
  const updateType = getUpdateType(fromVersion, toVersion);

  // Analyze imports to get usage scope
  const importAnalysis = await analyzeImports(packageName, { cwd });
  const filePaths = importAnalysis.files.map((f) => f.path);
  const fileCount = filePaths.length;

  // Calculate critical paths
  const criticalPaths = detectCriticalPaths(filePaths);

  // Calculate test coverage
  const testCoverage = await calculateTestCoverage(filePaths, cwd);

  // Calculate factor scores
  const factors: RiskFactors = {
    updateType: scoreUpdateType(updateType),
    usageScope: scoreUsageScope(fileCount),
    criticalPaths: scoreCriticalPaths(filePaths),
    testCoverage: scoreTestCoverage(testCoverage),
  };

  // Calculate total risk score
  const riskScore =
    factors.updateType.score +
    factors.usageScope.score +
    factors.criticalPaths.score +
    factors.testCoverage.score;

  // Determine risk level
  const riskLevel = getRiskLevel(riskScore);

  // Generate recommendations
  const recommendations = generateRecommendations(packageName, updateType, factors, criticalPaths);

  log.info({ packageName, riskScore, riskLevel }, "Risk assessment complete");

  return {
    package: packageName,
    from: fromVersion,
    to: toVersion,
    updateType,
    riskScore,
    riskLevel,
    factors,
    recommendations,
  };
}

// Export internals for testing
export const internals = {
  cleanVersionString,
  getCurrentVersion,
  getLatestVersion,
  scoreUpdateType,
  scoreUsageScope,
  scoreCriticalPaths,
  scoreTestCoverage,
  detectCriticalPaths,
  hasTestFile,
  calculateTestCoverage,
  getRiskLevel,
  generateRecommendations,
};
