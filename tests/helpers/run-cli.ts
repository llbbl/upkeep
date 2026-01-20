import { join } from "node:path";

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the upkeep CLI with the given arguments.
 *
 * @param args - CLI arguments to pass to the command
 * @param cwd - Working directory to run the command in (defaults to project root)
 * @returns Promise with stdout, stderr, and exit code
 */
export async function runCli(args: string[], cwd?: string): Promise<CliResult> {
  const projectRoot = join(import.meta.dir, "../..");
  const cliPath = join(projectRoot, "src/cli/index.ts");

  const proc = Bun.spawn(["bun", cliPath, ...args], {
    cwd: cwd ?? projectRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Disable debug logging in tests
      DEBUG: undefined,
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  await proc.exited;

  return {
    stdout,
    stderr,
    exitCode: proc.exitCode ?? 1,
  };
}

/**
 * Parse JSON output from CLI, throwing if invalid.
 */
export function parseJsonOutput<T>(stdout: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`Failed to parse JSON output: ${stdout}`);
  }
}

/**
 * Get the path to a test fixture directory.
 */
export function getFixturePath(fixtureName: string): string {
  return join(import.meta.dir, "../fixtures", fixtureName);
}
