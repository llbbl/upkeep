import { analyzeImports } from "../../lib/analyzers/imports.ts";
import { createLogger } from "../../lib/logger.ts";

const log = createLogger("imports-command");

interface ImportsOptions {
  json: boolean;
}

function parseArgs(args: string[]): ImportsOptions {
  return {
    json: args.includes("--json"),
  };
}

/**
 * Analyze where a package is used in the codebase.
 *
 * This command performs AST-based analysis to find all imports of a
 * specific package and reports where and how it's used.
 */
export async function imports(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
upkeep imports - Analyze package usage

Usage: upkeep imports <package> [options]

Arguments:
  package       Name of the package to analyze

Options:
  --json        Output as JSON (default)
  --help, -h    Show this help message

Output:
  JSON object with import locations and usage breakdown

Examples:
  upkeep imports lodash
  upkeep imports @tanstack/react-query
  upkeep imports lodash/debounce
`);
    return;
  }

  // Find the package name (first arg that doesn't start with --)
  const packageName = args.find((arg) => !arg.startsWith("--"));

  if (!packageName) {
    console.error("Error: Package name is required");
    console.error("Usage: upkeep imports <package>");
    process.exit(1);
  }

  const options = parseArgs(args);
  log.debug({ packageName, options }, "Parsed options");

  try {
    const result = await analyzeImports(packageName, {
      cwd: process.cwd(),
    });

    // Always output JSON (as per spec)
    console.log(JSON.stringify(result, null, 2));

    // Exit with code 0 even if no imports found (not an error condition)
  } catch (error) {
    log.error({ error }, "Failed to analyze imports");

    if (error instanceof Error) {
      console.error(JSON.stringify({ error: error.message }, null, 2));
    } else {
      console.error(JSON.stringify({ error: "Unknown error occurred" }, null, 2));
    }

    process.exit(1);
  }
}
