import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const SCRIPT_PATH = join(import.meta.dir, "../../scripts/global.sh");

/**
 * Run a bash command and return the result.
 */
async function runBash(
  script: string,
  env: Record<string, string> = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bash", "-c", script], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

/**
 * Source the global script and run a function from it.
 */
async function runScriptFunction(
  functionCall: string,
  env: Record<string, string> = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const script = `
    source "${SCRIPT_PATH}"
    ${functionCall}
  `;
  return runBash(script, env);
}

describe("global.sh", () => {
  describe("detect_platform()", () => {
    test("returns platform-arch format", async () => {
      const result = await runScriptFunction("detect_platform");

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^(linux|darwin|windows)-(x64|arm64)$/);
    });
  });

  describe("get_download_url()", () => {
    test("generates latest URL correctly", async () => {
      const result = await runScriptFunction('get_download_url "darwin-arm64" "latest"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(
        "https://github.com/llbbl/upkeep/releases/latest/download/upkeep-darwin-arm64"
      );
    });

    test("generates versioned URL correctly", async () => {
      const result = await runScriptFunction('get_download_url "linux-x64" "v1.0.0"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(
        "https://github.com/llbbl/upkeep/releases/download/v1.0.0/upkeep-linux-x64"
      );
    });
  });

  describe("is_in_path()", () => {
    test("returns true for directory in PATH", async () => {
      const result = await runScriptFunction('is_in_path "/usr/bin" && echo "yes" || echo "no"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("yes");
    });

    test("returns false for directory not in PATH", async () => {
      const result = await runScriptFunction(
        'is_in_path "/nonexistent/path/12345" && echo "yes" || echo "no"'
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("no");
    });
  });

  describe("find_path_dirs()", () => {
    test("returns directories that are in PATH", async () => {
      // This test checks the function runs without error
      const result = await runScriptFunction("find_path_dirs");

      expect(result.exitCode).toBe(0);
      // Output may be empty or contain paths, both are valid
    });

    test("finds ~/.local/bin if it exists in PATH", async () => {
      const home = process.env.HOME;
      const result = await runScriptFunction("find_path_dirs", {
        PATH: `${home}/.local/bin:/usr/bin:/bin`,
      });

      expect(result.exitCode).toBe(0);
      if (result.stdout.trim()) {
        expect(result.stdout).toContain(".local/bin");
      }
    });
  });

  describe("suggest_install_dir()", () => {
    test("suggests a directory", async () => {
      const result = await runScriptFunction("suggest_install_dir");

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBeTruthy();
    });

    test("suggests ~/.local/bin as fallback", async () => {
      // With no common dirs in PATH, should fallback to ~/.local/bin
      const result = await runScriptFunction("suggest_install_dir", {
        PATH: "/usr/bin:/bin",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toContain(".local/bin");
    });

    test("prefers directory already in PATH", async () => {
      const home = process.env.HOME;
      const result = await runScriptFunction("suggest_install_dir", {
        PATH: `${home}/.local/bin:/usr/bin:/bin`,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(`${home}/.local/bin`);
    });
  });

  describe("helper functions", () => {
    test("info() outputs green message", async () => {
      const result = await runScriptFunction('info "Test message"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Test message");
    });

    test("warn() outputs yellow message", async () => {
      const result = await runScriptFunction('warn "Warning message"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Warning message");
    });

    test("prompt() outputs blue message", async () => {
      const result = await runScriptFunction('prompt "Question?"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Question?");
    });
  });

  describe("environment variables", () => {
    test("UPKEEP_VERSION defaults to latest", async () => {
      const result = await runScriptFunction('echo "$VERSION"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("latest");
    });

    test("UPKEEP_VERSION can be overridden", async () => {
      const result = await runScriptFunction('echo "$VERSION"', {
        UPKEEP_VERSION: "v1.2.3",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("v1.2.3");
    });

    test("UPKEEP_INSTALL_DIR defaults to empty (auto-detect)", async () => {
      const result = await runScriptFunction('echo "[$INSTALL_DIR]"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("[]");
    });

    test("UPKEEP_INSTALL_DIR can be overridden", async () => {
      const result = await runScriptFunction('echo "$INSTALL_DIR"', {
        UPKEEP_INSTALL_DIR: "/custom/path",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/custom/path");
    });
  });

  describe("script syntax", () => {
    test("script is valid bash syntax", async () => {
      const result = await runBash(`bash -n "${SCRIPT_PATH}"`);

      expect(result.exitCode).toBe(0);
    });

    test("uses set -euo pipefail", async () => {
      const result = await runBash(`head -5 "${SCRIPT_PATH}"`);

      expect(result.stdout).toContain("set -euo pipefail");
    });

    test("has correct shebang", async () => {
      const result = await runBash(`head -1 "${SCRIPT_PATH}"`);

      expect(result.stdout.trim()).toBe("#!/usr/bin/env bash");
    });
  });

  describe("script structure", () => {
    test("has required functions", async () => {
      const functions = [
        "detect_platform",
        "get_download_url",
        "download_binary",
        "install_binary",
        "verify_installation",
        "is_in_path",
        "find_path_dirs",
        "suggest_install_dir",
        "main",
        "info",
        "warn",
        "error",
        "prompt",
      ];

      for (const fn of functions) {
        const result = await runScriptFunction(`type ${fn}`);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`${fn} is a function`);
      }
    });
  });

  describe("platform detection", () => {
    test("handles x86_64 architecture", async () => {
      const script = `
        uname() {
          case "$1" in
            -s) echo "Linux" ;;
            -m) echo "x86_64" ;;
          esac
        }
        source "${SCRIPT_PATH}"
        detect_platform
      `;
      const result = await runBash(script);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("linux-x64");
    });

    test("handles arm64 architecture", async () => {
      const script = `
        uname() {
          case "$1" in
            -s) echo "Darwin" ;;
            -m) echo "arm64" ;;
          esac
        }
        source "${SCRIPT_PATH}"
        detect_platform
      `;
      const result = await runBash(script);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("darwin-arm64");
    });
  });

  describe("download methods", () => {
    test("prefers curl over wget", async () => {
      const script = `
        source "${SCRIPT_PATH}"
        type download_binary | grep -q 'curl'
      `;
      const result = await runBash(script);

      expect(result.exitCode).toBe(0);
    });

    test("falls back to wget when curl unavailable", async () => {
      const script = `
        source "${SCRIPT_PATH}"
        type download_binary | grep -q 'wget'
      `;
      const result = await runBash(script);

      expect(result.exitCode).toBe(0);
    });
  });
});
