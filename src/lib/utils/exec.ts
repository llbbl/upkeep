import { createLogger } from "../logger.ts";

const log = createLogger("exec");

// Fail closed; add a command only when a caller needs it.
const ALLOWED_COMMANDS = new Set(["npm", "pnpm", "yarn", "bun", "gh", "git"]);

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
 * Arguments are passed directly to the allowed executable without shell interpretation.
 * Non-zero exits resolve with their output; spawn failures and timeouts reject.
 */
export async function exec(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  if (!ALLOWED_COMMANDS.has(command)) {
    log.warn({ command }, "Command not allowed");
    throw new Error(`Command not allowed: ${command}`);
  }

  const { cwd = process.cwd(), timeout = 30000, env } = options;

  log.debug({ command, args, cwd }, "Executing command");

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  try {
    const proc = Bun.spawn([command, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: env ? { ...process.env, ...env } : process.env,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill();
        reject(new Error(`Command timed out after ${timeout}ms: ${command} ${args.join(" ")}`));
      }, timeout);
    });

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
    if (timedOut) {
      throw error;
    }
    log.error({ error, command, args }, "Command execution failed");
    throw new Error(`Failed to execute command: ${command} ${args.join(" ")}`, { cause: error });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
