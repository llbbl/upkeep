import { analyzeAudit } from "../../lib/analyzers/audit.ts";

/**
 * Security-focused audit.
 *
 * This command performs a security audit of the project's dependencies
 * and reports vulnerabilities with fix recommendations.
 */
export async function audit(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
upkeep audit - Security-focused audit

Usage: upkeep audit [options]

Options:
  --help, -h    Show this help message

Output:
  JSON object with detailed vulnerability information including:
  - Package name
  - Severity level (critical, high, moderate, low)
  - Vulnerability title
  - Dependency path showing how the vulnerable package is reached
  - Fix availability and version

Example output:
  {
    "vulnerabilities": [
      {
        "package": "nth-check",
        "severity": "high",
        "title": "Inefficient Regular Expression Complexity",
        "path": "react-scripts > @svgr/webpack > @svgr/plugin-svgo > svgo > css-select > nth-check",
        "fixAvailable": true,
        "fixVersion": "2.0.1"
      }
    ],
    "summary": {
      "critical": 0,
      "high": 1,
      "moderate": 2,
      "low": 0,
      "total": 3
    }
  }
`);
    return;
  }

  const result = await analyzeAudit({ cwd: process.cwd() });

  // Output JSON to stdout
  console.log(JSON.stringify(result, null, 2));
}
