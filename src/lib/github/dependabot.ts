import { createLogger } from "../logger.ts";
import { exec } from "../utils/exec.ts";
import { getUpdateType, type UpdateType } from "../utils/semver.ts";

const log = createLogger("dependabot");

/**
 * Check status for a PR.
 */
export type CheckStatus = "passing" | "failing" | "pending" | "none";

/**
 * A single Dependabot pull request with parsed information.
 */
export interface DependabotPR {
  number: number;
  title: string;
  package: string;
  from: string;
  to: string;
  updateType: UpdateType;
  url: string;
  createdAt: string;
  mergeable: boolean;
  checks: CheckStatus;
}

/**
 * Summary of Dependabot PRs by update type.
 */
export interface DependabotSummary {
  total: number;
  patch: number;
  minor: number;
  major: number;
  mergeable: number;
}

/**
 * Result of fetching and analyzing Dependabot PRs.
 */
export interface DependabotResult {
  pullRequests: DependabotPR[];
  summary: DependabotSummary;
}

/**
 * Error types for dependabot operations.
 */
export type DependabotErrorType =
  | "gh_not_installed"
  | "gh_not_authenticated"
  | "not_git_repo"
  | "no_github_remote"
  | "unknown";

/**
 * Error result when dependabot operation fails.
 */
export interface DependabotError {
  error: true;
  type: DependabotErrorType;
  message: string;
}

/**
 * Options for the dependabot analyzer.
 */
export interface DependabotOptions {
  cwd?: string;
}

// ============================================================================
// GitHub CLI Output Types
// ============================================================================

interface StatusCheckRollup {
  __typename: string;
  conclusion?: string;
  status?: string;
  state?: string;
}

interface GhPrListItem {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  mergeable: string;
  headRefName: string;
  statusCheckRollup: StatusCheckRollup[] | null;
}

// ============================================================================
// PR Title Parsing
// ============================================================================

/**
 * Parsed information from a Dependabot PR title.
 */
export interface ParsedPRTitle {
  package: string;
  from: string;
  to: string;
}

/**
 * Parse a Dependabot PR title to extract package and version information.
 *
 * Supports patterns like:
 * - "Bump lodash from 4.17.20 to 4.17.21"
 * - "Bump @types/node from 18.0.0 to 20.0.0"
 * - "Update eslint requirement from ^8.0.0 to ^9.0.0"
 * - "Bump lodash from 4.17.20 to 4.17.21 in /packages/app"
 *
 * @param title - The PR title to parse
 * @returns Parsed title info or null if not a valid Dependabot title
 */
export function parseDependabotTitle(title: string): ParsedPRTitle | null {
  // Pattern for "Bump" or "Update" style titles
  // Handles scoped packages like @types/node
  // Handles version ranges like ^8.0.0
  // Handles "in /path" suffix
  const pattern =
    /^(?:Bump|Update)\s+((?:@[\w-]+\/)?[\w.-]+)(?:\s+requirement)?\s+from\s+([^\s]+)\s+to\s+([^\s]+)(?:\s+in\s+.*)?$/i;

  const match = title.match(pattern);
  if (!match) {
    return null;
  }

  const [, packageName, fromVersion, toVersion] = match;

  if (!packageName || !fromVersion || !toVersion) {
    return null;
  }

  // Clean version strings - remove common prefixes like ^, ~, =, v
  const cleanVersion = (v: string): string => {
    return v.replace(/^[\^~>=<v]+/, "");
  };

  return {
    package: packageName,
    from: cleanVersion(fromVersion),
    to: cleanVersion(toVersion),
  };
}

// ============================================================================
// Check Status Processing
// ============================================================================

/**
 * Determine the overall check status from statusCheckRollup.
 *
 * @param statusCheckRollup - The status check rollup from GitHub
 * @returns The aggregated check status
 */
export function determineCheckStatus(statusCheckRollup: StatusCheckRollup[] | null): CheckStatus {
  if (!statusCheckRollup || statusCheckRollup.length === 0) {
    return "none";
  }

  let hasPending = false;
  let hasFailing = false;
  let hasPassing = false;

  for (const check of statusCheckRollup) {
    // StatusCheckRollup can have different types with different fields
    // CheckRun uses conclusion, StatusContext uses state

    // Handle CheckRun (uses conclusion)
    if (check.conclusion) {
      const conclusion = check.conclusion.toUpperCase();
      if (conclusion === "SUCCESS") {
        hasPassing = true;
      } else if (
        conclusion === "FAILURE" ||
        conclusion === "TIMED_OUT" ||
        conclusion === "CANCELLED"
      ) {
        hasFailing = true;
      } else if (
        conclusion === "NEUTRAL" ||
        conclusion === "SKIPPED" ||
        conclusion === "ACTION_REQUIRED" ||
        conclusion === "STALE"
      ) {
        // Neutral/skipped don't affect overall status
        hasPassing = true;
      }
    }

    // Handle StatusContext (uses state)
    if (check.state) {
      const state = check.state.toUpperCase();
      if (state === "SUCCESS") {
        hasPassing = true;
      } else if (state === "FAILURE" || state === "ERROR") {
        hasFailing = true;
      } else if (state === "PENDING" || state === "EXPECTED") {
        hasPending = true;
      }
    }

    // Handle status field (some checks use this)
    if (check.status) {
      const status = check.status.toUpperCase();
      if (status === "IN_PROGRESS" || status === "QUEUED" || status === "WAITING") {
        hasPending = true;
      } else if (status === "COMPLETED") {
        // Completed without conclusion means we need to check conclusion field
        // which we already handle above
      }
    }
  }

  // Priority: failing > pending > passing > none
  if (hasFailing) {
    return "failing";
  }
  if (hasPending) {
    return "pending";
  }
  if (hasPassing) {
    return "passing";
  }

  return "none";
}

// ============================================================================
// GitHub CLI Interactions
// ============================================================================

/**
 * Check if the gh CLI is installed.
 */
async function isGhInstalled(cwd: string): Promise<boolean> {
  try {
    const result = await exec("gh", ["--version"], { cwd });
    return result.exitCode === 0;
  } catch (error) {
    log.trace({ error }, "gh --version check failed");
    return false;
  }
}

/**
 * Check if gh CLI is authenticated.
 */
async function isGhAuthenticated(cwd: string): Promise<boolean> {
  try {
    const result = await exec("gh", ["auth", "status"], { cwd });
    return result.exitCode === 0;
  } catch (error) {
    log.trace({ error }, "gh auth status check failed");
    return false;
  }
}

/**
 * Check if the current directory is a git repository.
 */
async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const result = await exec("git", ["rev-parse", "--git-dir"], { cwd });
    return result.exitCode === 0;
  } catch (error) {
    log.trace({ error }, "git repo check failed");
    return false;
  }
}

/**
 * Check if the git repo has a GitHub remote.
 */
async function hasGitHubRemote(cwd: string): Promise<boolean> {
  try {
    const result = await exec("gh", ["repo", "view", "--json", "name"], { cwd });
    return result.exitCode === 0;
  } catch (error) {
    log.trace({ error }, "GitHub remote check failed");
    return false;
  }
}

/**
 * Fetch Dependabot PRs from GitHub using gh CLI.
 */
async function fetchDependabotPRs(cwd: string): Promise<GhPrListItem[]> {
  // Try both "app/dependabot" and "dependabot[bot]" authors
  const authors = ["app/dependabot", "dependabot[bot]"];
  const allPRs: GhPrListItem[] = [];
  const seenNumbers = new Set<number>();

  for (const author of authors) {
    try {
      const result = await exec(
        "gh",
        [
          "pr",
          "list",
          "--author",
          author,
          "--json",
          "number,title,url,createdAt,mergeable,statusCheckRollup,headRefName",
        ],
        { cwd }
      );

      if (result.exitCode === 0 && result.stdout.trim()) {
        const prs = JSON.parse(result.stdout) as GhPrListItem[];
        for (const pr of prs) {
          if (!seenNumbers.has(pr.number)) {
            seenNumbers.add(pr.number);
            allPRs.push(pr);
          }
        }
      }
    } catch (error) {
      log.debug({ author, error }, "Failed to fetch PRs for author");
    }
  }

  return allPRs;
}

// ============================================================================
// Main Analyzer
// ============================================================================

/**
 * Parse a single PR from GitHub CLI output into a DependabotPR.
 */
export function parsePR(pr: GhPrListItem): DependabotPR | null {
  const parsed = parseDependabotTitle(pr.title);
  if (!parsed) {
    log.debug({ title: pr.title }, "Could not parse Dependabot PR title");
    return null;
  }

  const updateType = getUpdateType(parsed.from, parsed.to);
  const checks = determineCheckStatus(pr.statusCheckRollup);

  // mergeable can be "MERGEABLE", "CONFLICTING", "UNKNOWN", ""
  const mergeable = pr.mergeable?.toUpperCase() === "MERGEABLE";

  return {
    number: pr.number,
    title: pr.title,
    package: parsed.package,
    from: parsed.from,
    to: parsed.to,
    updateType,
    url: pr.url,
    createdAt: pr.createdAt,
    mergeable,
    checks,
  };
}

/**
 * Calculate summary statistics from parsed PRs.
 */
export function calculateSummary(prs: DependabotPR[]): DependabotSummary {
  return {
    total: prs.length,
    patch: prs.filter((pr) => pr.updateType === "patch").length,
    minor: prs.filter((pr) => pr.updateType === "minor").length,
    major: prs.filter((pr) => pr.updateType === "major").length,
    mergeable: prs.filter((pr) => pr.mergeable).length,
  };
}

/**
 * Analyze Dependabot PRs for a repository.
 *
 * @param options - Analyzer options
 * @returns The analysis result or an error object
 */
export async function analyzeDependabot(
  options: DependabotOptions = {}
): Promise<DependabotResult | DependabotError> {
  const { cwd = process.cwd() } = options;

  log.info({ cwd }, "Analyzing Dependabot PRs");

  // Check prerequisites
  if (!(await isGhInstalled(cwd))) {
    log.error("gh CLI is not installed");
    return {
      error: true,
      type: "gh_not_installed",
      message:
        "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/ and run 'gh auth login'.",
    };
  }

  if (!(await isGhAuthenticated(cwd))) {
    log.error("gh CLI is not authenticated");
    return {
      error: true,
      type: "gh_not_authenticated",
      message: "GitHub CLI is not authenticated. Run 'gh auth login' to authenticate.",
    };
  }

  if (!(await isGitRepo(cwd))) {
    log.error("Not a git repository");
    return {
      error: true,
      type: "not_git_repo",
      message:
        "Current directory is not a git repository. Run this command from within a git repository.",
    };
  }

  if (!(await hasGitHubRemote(cwd))) {
    log.error("No GitHub remote found");
    return {
      error: true,
      type: "no_github_remote",
      message:
        "Could not find a GitHub remote for this repository. Ensure the repository is hosted on GitHub.",
    };
  }

  // Fetch PRs
  const ghPRs = await fetchDependabotPRs(cwd);
  log.debug({ count: ghPRs.length }, "Fetched PRs from GitHub");

  // Parse PRs
  const pullRequests: DependabotPR[] = [];
  for (const ghPR of ghPRs) {
    const parsed = parsePR(ghPR);
    if (parsed) {
      pullRequests.push(parsed);
    }
  }

  // Sort by createdAt (newest first)
  pullRequests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const summary = calculateSummary(pullRequests);

  log.info(
    {
      total: summary.total,
      mergeable: summary.mergeable,
      major: summary.major,
      minor: summary.minor,
      patch: summary.patch,
    },
    "Dependabot analysis complete"
  );

  return {
    pullRequests,
    summary,
  };
}

/**
 * Type guard to check if result is an error.
 */
export function isDependabotError(
  result: DependabotResult | DependabotError
): result is DependabotError {
  return "error" in result && result.error === true;
}

// Export parsers for testing
export const parsers = {
  parseDependabotTitle,
  determineCheckStatus,
  parsePR,
  calculateSummary,
};
