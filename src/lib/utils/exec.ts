import { createLogger } from "../logger.ts";

const log = createLogger("exec");

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Execute a shell command and capture its output.
 *
 * Uses Bun.spawn for process execution (safe from shell injection
 * as arguments are passed directly, not through a shell).
 *
 * @param command - The command to execute
 * @param args - Arguments to pass to the command
 * @param options - Optional execution options
 * @returns Promise resolving to the command result
 */
export async function exec(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const { cwd = process.cwd(), timeout = 30000, env } = options;

  log.debug({ command, args, cwd }, "Executing command");

  const proc = Bun.spawn([command, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: env ? { ...process.env, ...env } : process.env,
  });

  // Set up timeout with cleanup
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after ${timeout}ms: ${command} ${args.join(" ")}`));
    }, timeout);
  });

  try {
    // Race between command completion and timeout
    const result = await Promise.race([
      (async () => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        log.debug(
          { exitCode, stdoutLength: stdout.length, stderrLength: stderr.length },
          "Command completed"
        );

        return {
          stdout,
          stderr,
          exitCode,
        };
      })(),
      timeoutPromise,
    ]);

    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      throw error;
    }
    log.error({ error, command, args }, "Command execution failed");
    throw new Error(`Failed to execute command: ${command} ${args.join(" ")}`, { cause: error });
  } finally {
    // Always clear the timeout to prevent memory leaks
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Execute a command and return only stdout, throwing on non-zero exit.
 *
 * @param command - The command to execute
 * @param args - Arguments to pass to the command
 * @param options - Optional execution options
 * @returns Promise resolving to stdout
 * @throws Error if the command exits with non-zero code
 */
export async function execOrThrow(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<string> {
  const result = await exec(command, args, options);

  if (result.exitCode !== 0) {
    const error = new Error(
      `Command failed with exit code ${result.exitCode}: ${command} ${args.join(" ")}`
    );
    log.error({ exitCode: result.exitCode, stderr: result.stderr }, "Command failed");
    throw error;
  }

  return result.stdout;
}
