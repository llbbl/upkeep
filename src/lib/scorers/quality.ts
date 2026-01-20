/**
 * Quality score calculator for JavaScript/TypeScript projects.
 *
 * Calculates a weighted quality score based on multiple metrics:
 * - Dependency Freshness (20%)
 * - Security (25%)
 * - Test Coverage (20%)
 * - TypeScript Strictness (10%)
 * - Linting Setup (10%)
 * - Dead Code (15%)
 */

import { analyzeAudit } from "../analyzers/audit.ts";
import { analyzeCoverage } from "../analyzers/coverage.ts";
import { analyzeDeps } from "../analyzers/deps.ts";
import { analyzeLinting } from "../analyzers/linting.ts";
import { analyzeTsConfig } from "../analyzers/tsconfig.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("quality");

// ============================================================================
// Types
// ============================================================================

export type Grade = "A" | "B" | "C" | "D" | "F";

export type RecommendationPriority = "high" | "medium" | "low";

export interface MetricBreakdown {
  score: number;
  weight: number;
  details: string;
}

export interface Recommendation {
  priority: RecommendationPriority;
  action: string;
}

export interface QualityBreakdown {
  dependencyFreshness: MetricBreakdown;
  security: MetricBreakdown;
  testCoverage: MetricBreakdown;
  typescriptStrictness: MetricBreakdown;
  linting: MetricBreakdown;
  deadCode: MetricBreakdown;
}

export interface QualityReport {
  score: number;
  grade: Grade;
  breakdown: QualityBreakdown;
  recommendations: Recommendation[];
}

export interface QualityOptions {
  cwd?: string;
}

// ============================================================================
// Constants
// ============================================================================

const WEIGHTS = {
  dependencyFreshness: 20,
  security: 25,
  testCoverage: 20,
  typescriptStrictness: 10,
  linting: 10,
  deadCode: 15,
} as const;

// ============================================================================
// Grade Calculation
// ============================================================================

/**
 * Determine letter grade from numeric score.
 *
 * Grade Scale:
 * - A: 90-100
 * - B: 80-89
 * - C: 70-79
 * - D: 60-69
 * - F: 0-59
 */
export function getGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ============================================================================
// Metric Calculations
// ============================================================================

/**
 * Calculate dependency freshness score.
 *
 * Score = (up-to-date packages / total packages) * 100
 */
export function calculateDependencyFreshnessScore(
  total: number,
  outdated: number
): MetricBreakdown {
  if (total === 0) {
    return {
      score: 100,
      weight: WEIGHTS.dependencyFreshness,
      details: "No dependencies",
    };
  }

  const upToDate = total - outdated;
  const score = Math.round((upToDate / total) * 100);
  const details =
    outdated === 0 ? "All packages up-to-date" : `${outdated} of ${total} packages outdated`;

  return {
    score,
    weight: WEIGHTS.dependencyFreshness,
    details,
  };
}

/**
 * Calculate security score.
 *
 * Deductions:
 * - Critical: -25 per vulnerability
 * - High: -15 per vulnerability
 * - Moderate: -5 per vulnerability
 * - Low: -2 per vulnerability
 */
export function calculateSecurityScore(
  critical: number,
  high: number,
  moderate: number,
  low: number
): MetricBreakdown {
  const total = critical + high + moderate + low;

  if (total === 0) {
    return {
      score: 100,
      weight: WEIGHTS.security,
      details: "No vulnerabilities found",
    };
  }

  const deduction = critical * 25 + high * 15 + moderate * 5 + low * 2;
  const score = Math.max(0, 100 - deduction);

  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (high > 0) parts.push(`${high} high`);
  if (moderate > 0) parts.push(`${moderate} moderate`);
  if (low > 0) parts.push(`${low} low`);

  const details = `${parts.join(", ")} vulnerabilities`;

  return {
    score,
    weight: WEIGHTS.security,
    details,
  };
}

/**
 * Calculate test coverage score.
 *
 * Score = coverage percentage directly.
 */
export function calculateTestCoverageScore(
  found: boolean,
  percentage: number | null
): MetricBreakdown {
  if (!found || percentage === null) {
    return {
      score: 0,
      weight: WEIGHTS.testCoverage,
      details: "No coverage data found",
    };
  }

  return {
    score: percentage,
    weight: WEIGHTS.testCoverage,
    details: `${percentage}% line coverage`,
  };
}

/**
 * Calculate TypeScript strictness score.
 *
 * Uses the score from the tsconfig analyzer directly.
 */
export function calculateTypescriptStrictnessScore(
  exists: boolean,
  tsconfigScore: number,
  details: string
): MetricBreakdown {
  if (!exists) {
    return {
      score: 0,
      weight: WEIGHTS.typescriptStrictness,
      details: "No tsconfig.json found",
    };
  }

  return {
    score: tsconfigScore,
    weight: WEIGHTS.typescriptStrictness,
    details,
  };
}

/**
 * Calculate linting score.
 *
 * Uses the score from the linting analyzer directly.
 */
export function calculateLintingScore(lintingScore: number, details: string): MetricBreakdown {
  return {
    score: lintingScore,
    weight: WEIGHTS.linting,
    details,
  };
}

/**
 * Calculate dead code score.
 *
 * For now, we use a simplified approach:
 * - Check tsconfig for noUnusedLocals and noUnusedParameters
 * - Use neutral score (50) if no detection available
 */
export function calculateDeadCodeScore(
  noUnusedLocals: boolean,
  noUnusedParameters: boolean
): MetricBreakdown {
  let score = 50; // Base neutral score
  const flags: string[] = [];

  if (noUnusedLocals) {
    score += 25;
    flags.push("noUnusedLocals");
  }

  if (noUnusedParameters) {
    score += 25;
    flags.push("noUnusedParameters");
  }

  const details =
    flags.length > 0
      ? `Enabled: ${flags.join(", ")}`
      : "Automated dead code detection not implemented";

  return {
    score,
    weight: WEIGHTS.deadCode,
    details,
  };
}

// ============================================================================
// Weighted Score Calculation
// ============================================================================

/**
 * Calculate the overall weighted score from individual metrics.
 */
export function calculateOverallScore(breakdown: QualityBreakdown): number {
  const metrics = [
    breakdown.dependencyFreshness,
    breakdown.security,
    breakdown.testCoverage,
    breakdown.typescriptStrictness,
    breakdown.linting,
    breakdown.deadCode,
  ];

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const metric of metrics) {
    totalWeightedScore += metric.score * metric.weight;
    totalWeight += metric.weight;
  }

  return Math.round(totalWeightedScore / totalWeight);
}

// ============================================================================
// Recommendations Generation
// ============================================================================

/**
 * Generate recommendations based on the quality breakdown.
 */
export function generateRecommendations(breakdown: QualityBreakdown): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Security recommendations (highest priority)
  if (breakdown.security.score < 100) {
    const details = breakdown.security.details;
    if (details.includes("critical")) {
      recommendations.push({
        priority: "high",
        action: "Fix critical severity vulnerabilities immediately",
      });
    }
    if (details.includes("high")) {
      recommendations.push({
        priority: "high",
        action: "Fix high severity vulnerabilities",
      });
    }
    if (details.includes("moderate")) {
      recommendations.push({
        priority: "medium",
        action: "Address moderate severity vulnerabilities",
      });
    }
  }

  // Dependency freshness recommendations
  if (breakdown.dependencyFreshness.score < 70) {
    recommendations.push({
      priority: "medium",
      action: "Update outdated dependencies",
    });
  } else if (breakdown.dependencyFreshness.score < 90) {
    recommendations.push({
      priority: "low",
      action: "Consider updating remaining outdated packages",
    });
  }

  // Test coverage recommendations
  if (
    breakdown.testCoverage.score === 0 &&
    breakdown.testCoverage.details.includes("No coverage")
  ) {
    recommendations.push({
      priority: "medium",
      action: "Set up test coverage reporting",
    });
  } else if (breakdown.testCoverage.score < 50) {
    recommendations.push({
      priority: "medium",
      action: "Increase test coverage (currently below 50%)",
    });
  } else if (breakdown.testCoverage.score < 80) {
    recommendations.push({
      priority: "low",
      action: "Improve test coverage to 80%+",
    });
  }

  // TypeScript strictness recommendations
  if (breakdown.typescriptStrictness.score === 0) {
    if (breakdown.typescriptStrictness.details.includes("No tsconfig")) {
      recommendations.push({
        priority: "medium",
        action: "Add TypeScript to the project",
      });
    }
  } else if (breakdown.typescriptStrictness.score < 40) {
    recommendations.push({
      priority: "medium",
      action: 'Enable "strict": true in tsconfig.json',
    });
  } else if (breakdown.typescriptStrictness.score < 100) {
    const missingFlags = breakdown.typescriptStrictness.details;
    if (missingFlags.includes("noUncheckedIndexedAccess")) {
      recommendations.push({
        priority: "low",
        action: "Enable noUncheckedIndexedAccess in tsconfig",
      });
    }
  }

  // Linting recommendations
  if (breakdown.linting.score === 0) {
    recommendations.push({
      priority: "medium",
      action: "Set up a linter (Biome or ESLint)",
    });
  } else if (breakdown.linting.score < 80 && breakdown.linting.details.includes("no Prettier")) {
    recommendations.push({
      priority: "low",
      action: "Add Prettier for consistent code formatting",
    });
  }

  return recommendations;
}

// ============================================================================
// Main Quality Assessment
// ============================================================================

/**
 * Assess the quality of a JavaScript/TypeScript project.
 *
 * @param options - Quality assessment options
 * @returns The quality report with score, grade, breakdown, and recommendations
 */
export async function assessQuality(options: QualityOptions = {}): Promise<QualityReport> {
  const { cwd = process.cwd() } = options;

  log.info({ cwd }, "Starting quality assessment");

  // Run all analyzers in parallel
  const [depsResult, auditResult, coverageResult, tsconfigResult, lintingResult] =
    await Promise.all([
      analyzeDeps({ cwd }),
      analyzeAudit({ cwd }),
      analyzeCoverage({ cwd }),
      analyzeTsConfig({ cwd }),
      analyzeLinting({ cwd }),
    ]);

  log.debug(
    {
      deps: { total: depsResult.total, outdated: depsResult.outdated },
      audit: auditResult.summary,
      coverage: { found: coverageResult.found, percentage: coverageResult.percentage },
      tsconfig: { exists: tsconfigResult.exists, score: tsconfigResult.score },
      linting: { linter: lintingResult.linter, score: lintingResult.score },
    },
    "Analyzer results"
  );

  // Calculate individual metric scores
  const breakdown: QualityBreakdown = {
    dependencyFreshness: calculateDependencyFreshnessScore(depsResult.total, depsResult.outdated),
    security: calculateSecurityScore(
      auditResult.summary.critical,
      auditResult.summary.high,
      auditResult.summary.moderate,
      auditResult.summary.low
    ),
    testCoverage: calculateTestCoverageScore(coverageResult.found, coverageResult.percentage),
    typescriptStrictness: calculateTypescriptStrictnessScore(
      tsconfigResult.exists,
      tsconfigResult.score,
      tsconfigResult.details
    ),
    linting: calculateLintingScore(lintingResult.score, lintingResult.details),
    deadCode: calculateDeadCodeScore(
      tsconfigResult.strictFlags.noUnusedLocals,
      tsconfigResult.strictFlags.noUnusedParameters
    ),
  };

  // Calculate overall score and grade
  const score = calculateOverallScore(breakdown);
  const grade = getGrade(score);

  // Generate recommendations
  const recommendations = generateRecommendations(breakdown);

  log.info(
    { score, grade, recommendationCount: recommendations.length },
    "Quality assessment complete"
  );

  return {
    score,
    grade,
    breakdown,
    recommendations,
  };
}

// Export internals for testing
export const internals = {
  WEIGHTS,
  getGrade,
  calculateDependencyFreshnessScore,
  calculateSecurityScore,
  calculateTestCoverageScore,
  calculateTypescriptStrictnessScore,
  calculateLintingScore,
  calculateDeadCodeScore,
  calculateOverallScore,
  generateRecommendations,
};
