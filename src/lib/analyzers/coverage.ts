import { createLogger } from "../logger.ts";

const log = createLogger("coverage");

/**
 * Supported coverage report sources.
 */
export type CoverageSource = "istanbul" | "c8" | "vitest" | "unknown";

/**
 * Result of analyzing coverage reports.
 */
export interface CoverageAnalysis {
  found: boolean;
  percentage: number | null;
  source: CoverageSource | null;
  details: string;
}

/**
 * Options for the coverage analyzer.
 */
export interface CoverageAnalyzerOptions {
  cwd?: string;
}

/**
 * Istanbul/nyc coverage-summary.json format.
 */
interface IstanbulCoverageSummary {
  total: {
    lines: { pct: number };
    statements: { pct: number };
    functions: { pct: number };
    branches: { pct: number };
  };
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
 * Try to parse Istanbul/nyc coverage-summary.json.
 */
async function parseIstanbulCoverage(cwd: string): Promise<number | null> {
  const paths = [
    `${cwd}/coverage/coverage-summary.json`,
    `${cwd}/.nyc_output/coverage-summary.json`,
  ];

  for (const path of paths) {
    if (await fileExists(path)) {
      try {
        const content = await Bun.file(path).text();
        const data = JSON.parse(content) as IstanbulCoverageSummary;

        if (data.total?.lines?.pct !== undefined) {
          log.debug({ path, percentage: data.total.lines.pct }, "Found Istanbul coverage");
          return Math.round(data.total.lines.pct);
        }
      } catch (error) {
        log.debug({ error, path }, "Failed to parse Istanbul coverage");
      }
    }
  }

  return null;
}

/**
 * Try to parse Vitest coverage (also uses Istanbul format).
 */
async function parseVitestCoverage(cwd: string): Promise<number | null> {
  // Vitest uses Istanbul format by default
  const path = `${cwd}/coverage/coverage-summary.json`;

  if (await fileExists(path)) {
    try {
      const content = await Bun.file(path).text();
      const data = JSON.parse(content) as IstanbulCoverageSummary;

      if (data.total?.lines?.pct !== undefined) {
        log.debug({ path, percentage: data.total.lines.pct }, "Found Vitest coverage");
        return Math.round(data.total.lines.pct);
      }
    } catch (error) {
      log.debug({ error, path }, "Failed to parse Vitest coverage");
    }
  }

  return null;
}

/**
 * Try to parse coverage from lcov.info file.
 */
async function parseLcovCoverage(cwd: string): Promise<number | null> {
  const paths = [`${cwd}/coverage/lcov.info`, `${cwd}/lcov.info`];

  for (const path of paths) {
    if (await fileExists(path)) {
      try {
        const content = await Bun.file(path).text();

        // Parse lcov format to extract line coverage
        let linesFound = 0;
        let linesHit = 0;

        for (const line of content.split("\n")) {
          if (line.startsWith("LF:")) {
            linesFound += Number.parseInt(line.slice(3), 10) || 0;
          } else if (line.startsWith("LH:")) {
            linesHit += Number.parseInt(line.slice(3), 10) || 0;
          }
        }

        if (linesFound > 0) {
          const percentage = Math.round((linesHit / linesFound) * 100);
          log.debug({ path, percentage, linesFound, linesHit }, "Found lcov coverage");
          return percentage;
        }
      } catch (error) {
        log.debug({ error, path }, "Failed to parse lcov coverage");
      }
    }
  }

  return null;
}

/**
 * Try to parse c8 coverage (JSON reporter).
 */
async function parseC8Coverage(cwd: string): Promise<number | null> {
  const path = `${cwd}/coverage/coverage-summary.json`;

  // c8 can output in Istanbul format, so this is similar
  if (await fileExists(path)) {
    try {
      const content = await Bun.file(path).text();
      const data = JSON.parse(content) as IstanbulCoverageSummary;

      if (data.total?.lines?.pct !== undefined) {
        log.debug({ path, percentage: data.total.lines.pct }, "Found c8 coverage");
        return Math.round(data.total.lines.pct);
      }
    } catch (error) {
      log.debug({ error, path }, "Failed to parse c8 coverage");
    }
  }

  return null;
}

/**
 * Determine the coverage source based on project configuration.
 */
async function detectCoverageSource(cwd: string): Promise<CoverageSource | null> {
  // Check package.json for coverage tools
  const packageJsonPath = `${cwd}/package.json`;

  if (await fileExists(packageJsonPath)) {
    try {
      const content = await Bun.file(packageJsonPath).text();
      const pkg = JSON.parse(content) as {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };

      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

      if ("@vitest/coverage-v8" in deps || "@vitest/coverage-istanbul" in deps) {
        return "vitest";
      }

      if ("c8" in deps) {
        return "c8";
      }

      if ("nyc" in deps || "istanbul" in deps) {
        return "istanbul";
      }
    } catch (error) {
      log.trace(
        { error, path: packageJsonPath },
        "Failed to parse package.json for coverage source"
      );
    }
  }

  // Check for coverage directory
  if (await fileExists(`${cwd}/coverage`)) {
    return "unknown";
  }

  return null;
}

/**
 * Analyze test coverage in a project.
 *
 * Looks for coverage reports in common locations:
 * - coverage/coverage-summary.json (Istanbul/nyc/c8/Vitest format)
 * - coverage/lcov.info (lcov format)
 *
 * @param options - Analyzer options
 * @returns The coverage analysis result
 */
export async function analyzeCoverage(
  options: CoverageAnalyzerOptions = {}
): Promise<CoverageAnalysis> {
  const { cwd = process.cwd() } = options;

  log.info({ cwd }, "Starting coverage analysis");

  // Try each coverage format
  let percentage = await parseIstanbulCoverage(cwd);
  let source: CoverageSource | null = percentage !== null ? "istanbul" : null;

  if (percentage === null) {
    percentage = await parseVitestCoverage(cwd);
    if (percentage !== null) source = "vitest";
  }

  if (percentage === null) {
    percentage = await parseC8Coverage(cwd);
    if (percentage !== null) source = "c8";
  }

  if (percentage === null) {
    percentage = await parseLcovCoverage(cwd);
    if (percentage !== null) source = await detectCoverageSource(cwd);
  }

  if (percentage === null) {
    log.info("No coverage data found");
    return {
      found: false,
      percentage: null,
      source: null,
      details: "No coverage data found",
    };
  }

  const details = `${percentage}% line coverage`;
  log.info({ percentage, source }, "Coverage analysis complete");

  return {
    found: true,
    percentage,
    source,
    details,
  };
}

// Export internals for testing
export const internals = {
  fileExists,
  parseIstanbulCoverage,
  parseVitestCoverage,
  parseLcovCoverage,
  parseC8Coverage,
  detectCoverageSource,
};
