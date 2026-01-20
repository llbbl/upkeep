import { analyzeDeps, type DepsAnalysis } from "../../lib/analyzers/deps.ts";
import { createLogger } from "../../lib/logger.ts";

const log = createLogger("deps-command");

interface DepsOptions {
  json: boolean;
  outdated: boolean;
  security: boolean;
}

function parseArgs(args: string[]): DepsOptions {
  return {
    json: args.includes("--json"),
    outdated: args.includes("--outdated"),
    security: args.includes("--security"),
  };
}

/**
 * Format the deps analysis result for output.
 * When --outdated is set, only include packages in the output.
 */
function formatOutput(result: DepsAnalysis, options: DepsOptions): object {
  if (options.outdated) {
    // Only show outdated packages
    return {
      outdated: result.outdated,
      major: result.major,
      minor: result.minor,
      patch: result.patch,
      packages: result.packages,
    };
  }

  // Full output
  return result;
}

/**
 * Analyze dependency health.
 *
 * This command will analyze all dependencies in the project and report:
 * - Total number of dependencies
 * - Outdated packages (major, minor, patch)
 * - Security vulnerabilities (with --security flag)
 */
export async function deps(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
upkeep deps - Analyze dependency health

Usage: upkeep deps [options]

Options:
  --json        Output as JSON (default)
  --outdated    Only show outdated packages
  --security    Include security audit
  --help, -h    Show this help message

Examples:
  upkeep deps
  upkeep deps --outdated
  upkeep deps --security
  upkeep deps --outdated --security
`);
    return;
  }

  const options = parseArgs(args);
  log.debug({ options }, "Parsed options");

  try {
    const result = await analyzeDeps({
      cwd: process.cwd(),
      includeSecurity: options.security,
    });

    const output = formatOutput(result, options);

    // Always output JSON for now (as per spec)
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    log.error({ error }, "Failed to analyze dependencies");

    if (error instanceof Error) {
      console.error(JSON.stringify({ error: error.message }, null, 2));
    } else {
      console.error(JSON.stringify({ error: "Unknown error occurred" }, null, 2));
    }

    process.exit(1);
  }
}
