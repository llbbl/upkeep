#!/usr/bin/env bun

import { logger } from "../lib/logger.ts";
import { audit } from "./commands/audit.ts";
import { dependabot } from "./commands/dependabot.ts";
import { deps } from "./commands/deps.ts";
import { detect } from "./commands/detect.ts";
import { imports } from "./commands/imports.ts";
import { quality } from "./commands/quality.ts";
import { risk } from "./commands/risk.ts";

const HELP_TEXT = `
upkeep - A JS/TS repository maintenance toolkit

Usage: upkeep [options] <command> [command-options]

Commands:
  detect              Detect project configuration
  deps                Analyze dependency health
  audit               Security-focused audit
  quality             Generate quality score
  imports <package>   Analyze where a package is used
  dependabot          Fetch and analyze Dependabot PRs
  risk <package>      Assess upgrade risk for a package

Options:
  --help, -h          Show this help message
  --version, -v       Show version
  --verbose           Enable verbose output (info level logging)
  --log-level=<level> Set log level (trace, debug, info, warn, error)

Examples:
  upkeep detect
  upkeep --verbose deps
  upkeep --log-level=debug audit
  upkeep imports lodash
  upkeep risk next --from 14.0.0 --to 15.0.0
`;

const VERSION = "0.1.4";

type CommandHandler = (args: string[]) => Promise<void>;

const commands: Record<string, CommandHandler> = {
  detect,
  deps,
  audit,
  quality,
  imports,
  dependabot,
  risk,
};

function showHelp(): void {
  console.log(HELP_TEXT);
}

function showVersion(): void {
  console.log(`upkeep v${VERSION}`);
}

/**
 * Parse global options from args and return remaining args.
 * Sets logger level based on --verbose or --log-level flags.
 */
function parseGlobalOptions(args: string[]): string[] {
  const remaining: string[] = [];

  for (const arg of args) {
    if (arg === "--verbose") {
      logger.level = "info";
    } else if (arg.startsWith("--log-level=")) {
      const level = arg.split("=")[1] ?? "";
      const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
      if (validLevels.includes(level as (typeof validLevels)[number])) {
        logger.level = level;
      } else {
        console.error(`Invalid log level: ${level}`);
        console.error(`Valid levels: ${validLevels.join(", ")}`);
        process.exit(1);
      }
    } else {
      remaining.push(arg);
    }
  }

  return remaining;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  // Parse global options first (--verbose, --log-level)
  const args = parseGlobalOptions(rawArgs);

  const command = args[0];
  const commandArgs = args.slice(1);

  logger.debug({ args: rawArgs }, "CLI started");

  // Show help if no command or if --help is the first arg (before command)
  if (args.length === 0 || command === "--help" || command === "-h") {
    showHelp();
    process.exit(0);
  }

  // Show version if --version is the first arg
  if (command === "--version" || command === "-v") {
    showVersion();
    process.exit(0);
  }

  if (!command) {
    showHelp();
    process.exit(0);
    return;
  }

  const handler = commands[command];

  if (!handler) {
    logger.error({ command }, "Unknown command");
    console.error(`Unknown command: ${command}`);
    console.error('Run "upkeep --help" for usage information.');
    process.exit(1);
  }

  logger.info({ command }, "Running command");

  try {
    await handler(commandArgs);
    logger.debug({ command }, "Command completed successfully");
  } catch (error) {
    logger.error({ command, error }, "Command failed");
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    } else {
      console.error("An unexpected error occurred");
    }
    process.exit(1);
  }
}

main();
