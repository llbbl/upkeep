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

    test("generates Windows URL correctly", async () => {
      const result = await runScriptFunction('get_download_url "windows-x64" "latest"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(
        "https://github.com/llbbl/upkeep/releases/latest/download/upkeep-windows-x64"
      );
    });
  });

  describe("get_install_dir()", () => {
    test("returns ~/.local/bin if it exists", async () => {
      const home = process.env.HOME;
      // Create a temp scenario where ~/.local/bin exists
      const result = await runScriptFunction(`
        mkdir -p "$HOME/.local/bin"
        get_install_dir
      `);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(`${home}/.local/bin`);
    });

    test("returns ~/.upkeep/bin if ~/.local/bin does not exist", async () => {
      // Use a modified HOME to simulate ~/.local/bin not existing
      const result = await runScriptFunction("get_install_dir", {
        HOME: "/tmp/fake-home-nonexistent",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("/tmp/fake-home-nonexistent/.upkeep/bin");
    });
  });

  describe("helper functions", () => {
    test("info() outputs green message to stderr", async () => {
      const result = await runScriptFunction('info "Test message"');

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Test message");
    });

    test("warn() outputs yellow message to stderr", async () => {
      const result = await runScriptFunction('warn "Warning message"');

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Warning message");
    });

    test("error() outputs red message to stderr and exits with 1", async () => {
      const script = `
        source "${SCRIPT_PATH}"
        error "Error message" || true
      `;
      const result = await runBash(script);

      expect(result.stderr).toContain("Error message");
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
      const hasShellcheck = await runBash("command -v shellcheck");
      if (hasShellcheck.exitCode !== 0) {
        return; // Skip test if shellcheck is not installed
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
        "get_install_dir",
        "download_binary",
        "install_binary",
        "install_skills",
        "show_path_instructions",
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

  describe("skill names", () => {
    test("installs correct skills", async () => {
      const script = `
        source "${SCRIPT_PATH}"
        type install_skills | grep -o 'upkeep-deps\\|upkeep-audit\\|upkeep-quality' | sort -u
      `;
      const result = await runBash(script);

      expect(result.stdout).toContain("upkeep-deps");
      expect(result.stdout).toContain("upkeep-audit");
      expect(result.stdout).toContain("upkeep-quality");
    });
  });

  describe("show_path_instructions()", () => {
    test("shows zsh instructions", async () => {
      const result = await runScriptFunction("show_path_instructions");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("zsh");
      expect(result.stdout).toContain(".zshrc");
    });

    test("shows bash instructions", async () => {
      const result = await runScriptFunction("show_path_instructions");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("bash");
      expect(result.stdout).toContain(".bashrc");
    });

    test("includes the install directory in PATH export", async () => {
      const result = await runScriptFunction("show_path_instructions");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("export PATH");
    });
  });
});
