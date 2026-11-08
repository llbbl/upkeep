import "../../setup/require-sandbox.test.ts";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec } from "../../../src/lib/utils/exec.ts";

describe("exec", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "upkeep-exec-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it.each(["rm", "sh", "/bin/echo", "/bin/rm", "./bun", "", "./npm", "npm "])(
    "refuses the exact command %j before spawning",
    async (command) => {
      for (const name of ["rm", "sh", "bun", "npm", "npm "]) {
        await symlink(process.execPath, join(cwd, name));
      }
      const marker = join(cwd, "spawned");
      const script = `await Bun.write(${JSON.stringify(marker)}, "spawned")`;

      const args = command === "/bin/rm" ? ["--version"] : ["-e", script];
      const error = await exec(command, args, { cwd, env: { HOME: cwd, PATH: cwd } }).catch(
        (error: unknown) => error
      );
      expect(existsSync(marker)).toBe(false);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`Command not allowed: ${command}`);
    }
  );

  it.each(["npm", "pnpm", "yarn", "bun", "gh", "git"])("allows the command %s", async (command) => {
    try {
      const result = await exec(command, ["--version"], { cwd, env: { HOME: cwd } });
      expect(result.exitCode).toBe(0);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`Failed to execute command: ${command} --version`);
      expect((error as Error).cause).toBeInstanceOf(Error);
    }
  });

  it("wraps a missing allowed binary with its cause", async () => {
    const error = await exec("git", undefined, { cwd, env: { HOME: cwd, PATH: cwd } }).catch(
      (error: unknown) => error
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Failed to execute command: git ");
    expect((error as Error).cause).toBeInstanceOf(Error);
  });

  it("wraps spawn errors containing timeout wording with their cause", async () => {
    const args = ["timed out\u0000"];
    const error = await exec("bun", args, { cwd, env: { HOME: cwd } }).catch(
      (error: unknown) => error
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`Failed to execute command: bun ${args[0]}`);
    expect((error as Error).cause).toBeInstanceOf(TypeError);
  });

  it("resolves non-zero exits and captures stderr", async () => {
    const result = await exec("bun", ["-e", 'process.stderr.write("failure"); process.exit(3)'], {
      cwd,
      env: { HOME: cwd },
    });

    expect(result).toEqual({ stdout: "", stderr: "failure", exitCode: 3 });
  });

  it("times out and reaps the child process", async () => {
    const pidFile = join(cwd, "child.pid");
    const script = `require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); await Bun.sleep(10000)`;
    const started = performance.now();

    await expect(
      exec("bun", ["-e", script], { cwd, timeout: 3000, env: { HOME: cwd } })
    ).rejects.toThrow("Command timed out after 3000ms:");
    expect(performance.now() - started).toBeLessThan(7000);
    expect(existsSync(pidFile), "Child never wrote its PID before the 3000ms timeout").toBe(true);
    const pid = Number(await Bun.file(pidFile).text());
    expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);

    let alive = true;
    try {
      const deadline = performance.now() + 1000;
      while (performance.now() < deadline) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
            throw error;
          }
          alive = false;
          break;
        }
        // The child may need a scheduling turn to be reaped after its signal.
        await Bun.sleep(20);
      }
      expect(alive, `Child ${pid} is still running after exec timed out`).toBe(false);
    } finally {
      if (alive) {
        try {
          process.kill(pid);
        } catch (error) {
          expect((error as NodeJS.ErrnoException).code, "Could not clean up the test child").toBe(
            "ESRCH"
          );
        }
      }
    }
  }, 10000);

  it("clears the timer so a standalone caller exits promptly", async () => {
    const moduleUrl = new URL("../../../src/lib/utils/exec.ts", import.meta.url).href;
    const script = `
      import { exec } from ${JSON.stringify(moduleUrl)};
      const result = await exec("bun", ["-e", "void 0"], {
        cwd: ${JSON.stringify(cwd)}, timeout: 20000, env: { HOME: ${JSON.stringify(cwd)} }
      });
      if (result.exitCode !== 0) process.exit(1);
    `;
    const started = performance.now();
    const result = await exec("bun", ["-e", script], {
      cwd,
      timeout: 5000,
      env: { HOME: cwd },
    });

    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(performance.now() - started).toBeLessThan(5000);
  }, 10000);

  it("keeps stdout and stderr separate", async () => {
    const result = await exec(
      "bun",
      ["-e", 'process.stdout.write("output"); process.stderr.write("diagnostic")'],
      { cwd, env: { HOME: cwd } }
    );

    expect(result).toEqual({ stdout: "output", stderr: "diagnostic", exitCode: 0 });
  });

  it("drains a megabyte of stderr alongside stdout", async () => {
    const result = await exec(
      "bun",
      ["-e", 'process.stderr.write("x".repeat(1024 * 1024)); process.stdout.write("done")'],
      { cwd, timeout: 3000, env: { HOME: cwd } }
    );

    expect(result).toEqual({ stdout: "done", stderr: "x".repeat(1024 * 1024), exitCode: 0 });
  });

  it("round-trips UTF-8 on both streams", async () => {
    const stdout = "hello 🌍 café 日本語";
    const stderr = "warning ⚠️ naïve 中文";
    const result = await exec(
      "bun",
      [
        "-e",
        `process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(stderr)})`,
      ],
      { cwd, env: { HOME: cwd } }
    );

    expect(result).toEqual({ stdout, stderr, exitCode: 0 });
  });

  it("returns empty strings for empty output", async () => {
    const result = await exec("bun", ["-e", "void 0"], { cwd, env: { HOME: cwd } });

    expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
  });

  it("passes shell metacharacters as a literal argument", async () => {
    const argument = "$HOME; echo pwned";
    const result = await exec("bun", ["-e", "process.stdout.write(process.argv[1])", argument], {
      cwd,
      env: { HOME: cwd },
    });

    expect(result).toEqual({ stdout: argument, stderr: "", exitCode: 0 });
  });

  it("uses the requested cwd", async () => {
    const result = await exec("bun", ["-e", "process.stdout.write(process.cwd())"], {
      cwd,
      env: { HOME: cwd },
    });

    expect(result.stdout).toBe(cwd);
  });

  it("merges env overrides with the inherited environment", async () => {
    const result = await exec(
      "bun",
      [
        "-e",
        "process.stdout.write(JSON.stringify([process.env.HOME, process.env.UPKEEP_SANDBOX]))",
      ],
      { cwd, env: { HOME: cwd, PATH: process.env.PATH ?? "" } }
    );

    expect(JSON.parse(result.stdout)).toEqual([cwd, "1"]);
  });

  it("defaults cwd to the current process directory", async () => {
    const result = await exec("bun", ["-e", "process.stdout.write(process.cwd())"], {
      env: { HOME: cwd },
    });

    expect(result.stdout).toBe(process.cwd());
  });

  it("uses the inherited environment when options are omitted", async () => {
    const result = await exec("bun", ["-e", "process.stdout.write(process.env.UPKEEP_SANDBOX)"]);

    expect(result.stdout).toBe("1");
  });
});
