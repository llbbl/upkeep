/**
 * Assess upgrade risk for a package.
 *
 * This command analyzes the risk of upgrading a package based on
 * multiple factors including update type, usage scope, critical paths,
 * and test coverage.
 */

import { assessRisk, type RiskAssessment } from "../../lib/scorers/risk.ts";

function formatRiskOutput(assessment: RiskAssessment): void {
  console.log(JSON.stringify(assessment, null, 2));
}

export async function risk(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
upkeep risk - Assess upgrade risk

Usage: upkeep risk <package> [options]

Arguments:
  package           Name of the package to assess

Options:
  --from <version>  Current version (auto-detected if not specified)
  --to <version>    Target version (latest if not specified)
  --help, -h        Show this help message

Risk Factors:
  - Update type (major/minor/patch)
  - Number of files using the package
  - Critical path usage (API routes, auth, etc.)
  - Test coverage of files using the package

Output:
  JSON object with risk score, level, and recommendations

Risk Levels:
  - low: 0-25
  - medium: 26-50
  - high: 51-75
  - critical: 76-100
`);
    return;
  }

  const packageName = args[0];

  if (!packageName) {
    console.error("Error: Package name is required");
    console.error("Usage: upkeep risk <package> [--from version] [--to version]");
    process.exit(1);
  }

  // Parse --from and --to options
  let fromVersion: string | undefined;
  let toVersion: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === "--from" && nextArg) {
      fromVersion = nextArg;
      i++;
    } else if (arg === "--to" && nextArg) {
      toVersion = nextArg;
      i++;
    }
  }

  try {
    const assessment = await assessRisk(packageName, {
      fromVersion,
      toVersion,
      cwd: process.cwd(),
    });

    formatRiskOutput(assessment);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("Error: An unexpected error occurred");
    }
    process.exit(1);
  }
}
