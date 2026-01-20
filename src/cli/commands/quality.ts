/**
 * Generate quality score and report.
 *
 * This command analyzes the project and generates a quality score
 * based on multiple metrics including dependency freshness, security,
 * test coverage, TypeScript strictness, linting setup, and dead code.
 */
import { createLogger } from "../../lib/logger.ts";
import { assessQuality } from "../../lib/scorers/quality.ts";

const log = createLogger("quality-cmd");

export async function quality(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
upkeep quality - Generate quality score

Usage: upkeep quality [options]

Options:
  --json        Output as JSON (default)
  --help, -h    Show this help message

Metrics:
  - Dependency Freshness (20%)
  - Security (25%)
  - Test Coverage (20%)
  - TypeScript Strictness (10%)
  - Linting Setup (10%)
  - Dead Code (15%)

Output:
  JSON object with overall score, grade, and breakdown by metric

Grade Scale:
  A: 90-100
  B: 80-89
  C: 70-79
  D: 60-69
  F: 0-59
`);
    return;
  }

  log.info("Running quality assessment");

  const report = await assessQuality({ cwd: process.cwd() });

  // Output JSON to stdout
  console.log(JSON.stringify(report, null, 2));
}
