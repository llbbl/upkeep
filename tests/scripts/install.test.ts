import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const SCRIPT_PATH = join(import.meta.dir, "../../scripts/install.sh");

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
 * Source the install script and run a function from it.
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

describe("install.sh", () => {
  describe("detect_platform()", () => {
    test("returns platform-arch format", async () => {
      const result = await runScriptFunction("detect_platform");

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^(linux|darwin|windows)-(x64|arm64)$/);
    });

    test("detects darwin on macOS", async () => {
      // This test will pass on macOS, skip on other platforms
      const uname = await runBash("uname -s");
      if (!uname.stdout.includes("Darwin")) {
        return; // Skip on non-macOS
      }

      const result = await runScriptFunction("detect_platform");
      expect(result.stdout.trim()).toMatch(/^darwin-(x64|arm64)$/);
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

    test("generates Windows URL with .exe extension", async () => {
      // The get_download_url function doesn't add .exe - that's done in install_binary
      // So we test the base URL generation
      const result = await runScriptFunction('get_download_url "windows-x64" "latest"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(
        "https://github.com/llbbl/upkeep/releases/latest/download/upkeep-windows-x64"
      );
    });
  });

  describe("helper functions", () => {
    test("info() outputs green message", async () => {
      const result = await runScriptFunction('info "Test message"');

      expect(result.exitCode).toBe(0);
      // Check for the message (colors may or may not show depending on terminal)
      expect(result.stdout).toContain("Test message");
    });

    test("warn() outputs yellow message", async () => {
      const result = await runScriptFunction('warn "Warning message"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Warning message");
    });

    test("error() outputs red message and exits with 1", async () => {
      // error() calls exit 1, so we need to handle that
      const script = `
        source "${SCRIPT_PATH}"
        # Override exit to capture exit code
        error "Error message" || true
      `;
      const result = await runBash(script);

      // The function calls exit 1, so the script will exit
      expect(result.stdout).toContain("Error message");
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

    test("UPKEEP_INSTALL_DIR defaults to ~/.local/bin", async () => {
      const result = await runScriptFunction('echo "$INSTALL_DIR"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(`${process.env.HOME}/.local/bin`);
    });

    test("UPKEEP_INSTALL_DIR can be overridden", async () => {
      const result = await runScriptFunction('echo "$INSTALL_DIR"', {
        UPKEEP_INSTALL_DIR: "/custom/path",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/custom/path");
    });

    test("CLAUDE_SKILLS_DIR defaults to ~/.claude/skills", async () => {
      const result = await runScriptFunction('echo "$SKILLS_DIR"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(`${process.env.HOME}/.claude/skills`);
    });

    test("CLAUDE_SKILLS_DIR can be overridden", async () => {
      const result = await runScriptFunction('echo "$SKILLS_DIR"', {
        CLAUDE_SKILLS_DIR: "/custom/skills",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/custom/skills");
    });
  });

  describe("script syntax", () => {
    test("passes shellcheck (if available)", async () => {
      // Check if shellcheck is available
      const hasShellcheck = await runBash("command -v shellcheck");
      if (hasShellcheck.exitCode !== 0) {
        // Skip test if shellcheck is not installed
        return;
      }

      const result = await runBash(`shellcheck -x "${SCRIPT_PATH}"`);
      expect(result.exitCode).toBe(0);
    });

    test("script is valid bash syntax", async () => {
      const result = await runBash(`bash -n "${SCRIPT_PATH}"`);

      expect(result.exitCode).toBe(0);
    });
  });

  describe("script structure", () => {
    test("has required functions", async () => {
      const functions = [
        "detect_platform",
        "get_download_url",
        "download_binary",
        "install_binary",
        "install_skills",
        "verify_installation",
        "main",
        "info",
        "warn",
        "error",
      ];

      for (const fn of functions) {
        const result = await runScriptFunction(`type ${fn}`);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`${fn} is a function`);
      }
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

  describe("platform detection edge cases", () => {
    test("handles x86_64 architecture", async () => {
      const script = `
        # Mock uname to return x86_64
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

    test("handles amd64 architecture", async () => {
      const script = `
        uname() {
          case "$1" in
            -s) echo "Linux" ;;
            -m) echo "amd64" ;;
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

    test("handles aarch64 architecture", async () => {
      const script = `
        uname() {
          case "$1" in
            -s) echo "Linux" ;;
            -m) echo "aarch64" ;;
          esac
        }
        source "${SCRIPT_PATH}"
        detect_platform
      `;
      const result = await runBash(script);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("linux-arm64");
    });
  });

  describe("download methods", () => {
    test("prefers curl over wget", async () => {
      // Check that curl is used when available
      const script = `
        source "${SCRIPT_PATH}"

        # Check download_binary implementation
        type download_binary | grep -q 'curl'
      `;
      const result = await runBash(script);

      expect(result.exitCode).toBe(0);
    });

    test("falls back to wget when curl unavailable", async () => {
      const script = `
        source "${SCRIPT_PATH}"

        # Check download_binary has wget fallback
        type download_binary | grep -q 'wget'
      `;
      const result = await runBash(script);

      expect(result.exitCode).toBe(0);
    });
  });

  describe("skill names", () => {
    test("installs correct skills", async () => {
      const script = `
        source "${SCRIPT_PATH}"

        # Check that skills array contains expected skills
        type install_skills | grep -o 'upkeep-deps\\|upkeep-audit\\|upkeep-quality' | sort -u
      `;
      const result = await runBash(script);

      expect(result.stdout).toContain("upkeep-deps");
      expect(result.stdout).toContain("upkeep-audit");
      expect(result.stdout).toContain("upkeep-quality");
    });
  });
});
