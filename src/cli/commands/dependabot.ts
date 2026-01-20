import { analyzeDependabot, isDependabotError } from "../../lib/github/dependabot.ts";

/**
 * Fetch and analyze Dependabot PRs from GitHub.
 *
 * This command requires the `gh` CLI to be authenticated and will
 * fetch pending Dependabot pull requests for the current repository.
 */
export async function dependabot(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
upkeep dependabot - Fetch and analyze Dependabot PRs

Usage: upkeep dependabot [options]

Requirements:
  - gh CLI must be installed and authenticated
  - Current directory must be a git repository with a GitHub remote

Options:
  --help, -h    Show this help message

Output:
  JSON object with pending Dependabot PRs and summary including:
  - PR number, title, and URL
  - Package name and version information (from/to)
  - Update type (major, minor, patch)
  - CI check status (passing, failing, pending, none)
  - Mergeability status

Example output:
  {
    "pullRequests": [
      {
        "number": 42,
        "title": "Bump lodash from 4.17.20 to 4.17.21",
        "package": "lodash",
        "from": "4.17.20",
        "to": "4.17.21",
        "updateType": "patch",
        "url": "https://github.com/owner/repo/pull/42",
        "createdAt": "2024-01-15T10:00:00Z",
        "mergeable": true,
        "checks": "passing"
      }
    ],
    "summary": {
      "total": 5,
      "patch": 3,
      "minor": 1,
      "major": 1,
      "mergeable": 4
    }
  }
`);
    return;
  }

  const result = await analyzeDependabot({ cwd: process.cwd() });

  if (isDependabotError(result)) {
    // Output error as JSON for consistent output format
    console.log(JSON.stringify({ error: result.message, type: result.type }, null, 2));
    process.exit(1);
  }

  // Output JSON to stdout
  console.log(JSON.stringify(result, null, 2));
}
