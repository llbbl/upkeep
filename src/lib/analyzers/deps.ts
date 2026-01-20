import { createLogger } from "../logger.ts";
import { type ExecResult, exec } from "../utils/exec.ts";
import { getUpdateType, type UpdateType } from "../utils/semver.ts";
import { detectPackageManager, type PackageManagerName } from "./package-manager.ts";

const log = createLogger("deps");

/**
 * Information about a single outdated package.
 */
export interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  updateType: UpdateType;
  isDevDep: boolean;
}

/**
 * Security vulnerability counts by severity.
 */
export interface SecuritySummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
}

/**
 * Result of analyzing dependencies.
 */
export interface DepsAnalysis {
  total: number;
  outdated: number;
  major: number;
  minor: number;
  patch: number;
  security: SecuritySummary | null;
  packages: OutdatedPackage[];
}

/**
 * Options for the deps analyzer.
 */
export interface DepsAnalyzerOptions {
  cwd?: string;
  includeSecurity?: boolean;
  onlyOutdated?: boolean;
}

// ============================================================================
// Package Manager Output Parsers
// ============================================================================

/**
 * npm outdated --json format:
 * {
 *   "lodash": {
 *     "current": "4.17.20",
 *     "wanted": "4.17.21",
 *     "latest": "4.17.21",
 *     "dependent": "my-project",
 *     "location": "node_modules/lodash"
 *   }
 * }
 */
interface NpmOutdatedEntry {
  current: string;
  wanted: string;
  latest: string;
  dependent: string;
  location: string;
}

type NpmOutdatedOutput = Record<string, NpmOutdatedEntry>;

/**
 * pnpm outdated --format json format:
 * {
 *   "lodash": {
 *     "current": "4.17.20",
 *     "latest": "4.17.21",
 *     "wanted": "4.17.21",
 *     "isDeprecated": false,
 *     "dependencyType": "dependencies" | "devDependencies"
 *   }
 * }
 */
interface PnpmOutdatedEntry {
  current: string;
  latest: string;
  wanted: string;
  isDeprecated: boolean;
  dependencyType: "dependencies" | "devDependencies" | "optionalDependencies";
}

type PnpmOutdatedOutput = Record<string, PnpmOutdatedEntry>;

/**
 * yarn outdated --json format (NDJSON with multiple lines):
 * {"type":"table","data":{"head":["Package","Current","Wanted","Latest","Package Type","URL"],"body":[["lodash","4.17.0","4.17.0","4.17.21","dependencies","https://lodash.com/"]]}}
 */
interface YarnOutdatedTable {
  type: "table";
  data: {
    head: string[];
    body: string[][];
  };
}

/**
 * bun outdated format (table output, no JSON):
 * | Package          | Current | Update | Latest  |
 * |------------------|---------|--------|---------|
 * | lodash           | 4.17.0  | 4.17.0 | 4.17.21 |
 * | typescript (dev) | 5.9.2   | 5.9.2  | 5.9.3   |
 */

// ============================================================================
// Audit Output Parsers
// ============================================================================

/**
 * npm audit --json format (v2):
 * {
 *   "metadata": {
 *     "vulnerabilities": {
 *       "info": 0,
 *       "low": 0,
 *       "moderate": 2,
 *       "high": 1,
 *       "critical": 0,
 *       "total": 3
 *     }
 *   }
 * }
 */
interface NpmAuditOutput {
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
  };
}

/**
 * pnpm audit --json format:
 * {
 *   "metadata": {
 *     "vulnerabilities": {
 *       "info": 0,
 *       "low": 0,
 *       "moderate": 3,
 *       "high": 3,
 *       "critical": 1
 *     }
 *   }
 * }
 */
interface PnpmAuditOutput {
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * yarn audit --json format (NDJSON, last line is summary):
 * {"type":"auditSummary","data":{"vulnerabilities":{"info":0,"low":0,"moderate":3,"high":3,"critical":1}}}
 */
interface YarnAuditSummary {
  type: "auditSummary";
  data: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
    };
  };
}

// ============================================================================
// Parsers
// ============================================================================

function parseNpmOutdated(output: string): OutdatedPackage[] {
  if (!output.trim()) {
    return [];
  }

  try {
    const data = JSON.parse(output) as NpmOutdatedOutput;
    const packages: OutdatedPackage[] = [];

    for (const [name, info] of Object.entries(data)) {
      // npm doesn't directly tell us if it's a devDep in outdated output
      // We'll mark all as non-dev for now (can be enhanced by reading package.json)
      packages.push({
        name,
        current: info.current,
        latest: info.latest,
        updateType: getUpdateType(info.current, info.latest),
        isDevDep: false,
      });
    }

    return packages;
  } catch (error) {
    log.warn({ error, output }, "Failed to parse npm outdated output");
    return [];
  }
}

function parsePnpmOutdated(output: string): OutdatedPackage[] {
  if (!output.trim()) {
    return [];
  }

  try {
    const data = JSON.parse(output) as PnpmOutdatedOutput;
    const packages: OutdatedPackage[] = [];

    for (const [name, info] of Object.entries(data)) {
      packages.push({
        name,
        current: info.current,
        latest: info.latest,
        updateType: getUpdateType(info.current, info.latest),
        isDevDep: info.dependencyType === "devDependencies",
      });
    }

    return packages;
  } catch (error) {
    log.warn({ error, output }, "Failed to parse pnpm outdated output");
    return [];
  }
}

function parseYarnOutdated(output: string): OutdatedPackage[] {
  if (!output.trim()) {
    return [];
  }

  const packages: OutdatedPackage[] = [];

  // Yarn outputs NDJSON (newline-delimited JSON)
  const lines = output.trim().split("\n");

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type: string; data?: unknown };

      if (parsed.type === "table") {
        const tableData = parsed as YarnOutdatedTable;
        const headers = tableData.data.head;
        const body = tableData.data.body;

        // Find column indices
        const packageIdx = headers.indexOf("Package");
        const currentIdx = headers.indexOf("Current");
        const latestIdx = headers.indexOf("Latest");
        const typeIdx = headers.indexOf("Package Type");

        if (packageIdx === -1 || currentIdx === -1 || latestIdx === -1) {
          continue;
        }

        for (const row of body) {
          const name = row[packageIdx];
          const current = row[currentIdx];
          const latest = row[latestIdx];
          const pkgType = typeIdx !== -1 ? row[typeIdx] : "dependencies";

          if (name && current && latest) {
            packages.push({
              name,
              current,
              latest,
              updateType: getUpdateType(current, latest),
              isDevDep: pkgType === "devDependencies",
            });
          }
        }
      }
    } catch (error) {
      // NDJSON may contain non-JSON lines (info messages, etc.)
      log.trace({ line, error }, "Skipping non-JSON line in yarn outdated output");
    }
  }

  return packages;
}

function parseBunOutdated(output: string): OutdatedPackage[] {
  const packages: OutdatedPackage[] = [];

  // Bun outputs a table format, not JSON
  // | Package          | Current | Update | Latest  |
  // |------------------|---------|--------|---------|
  // | lodash           | 4.17.0  | 4.17.0 | 4.17.21 |
  // | typescript (dev) | 5.9.2   | 5.9.2  | 5.9.3   |

  const lines = output.split("\n");

  for (const line of lines) {
    // Skip header lines, separator lines, and empty lines
    if (!line.includes("|") || line.includes("Package") || line.includes("---")) {
      continue;
    }

    // Parse table row: | name | current | update | latest |
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length >= 4) {
      const nameCell = cells[0];
      const currentCell = cells[1];
      const latestCell = cells[3];

      // Skip if any required cell is missing
      if (!nameCell || !currentCell || !latestCell) {
        continue;
      }

      // Check for (dev) suffix
      const isDevDep = nameCell.includes("(dev)");
      const name = nameCell.replace(/\s*\(dev\)\s*/, "").trim();

      if (name && currentCell && latestCell) {
        packages.push({
          name,
          current: currentCell,
          latest: latestCell,
          updateType: getUpdateType(currentCell, latestCell),
          isDevDep,
        });
      }
    }
  }

  return packages;
}

// ============================================================================
// Security Audit Parsers
// ============================================================================

function parseNpmAudit(output: string): SecuritySummary | null {
  if (!output.trim()) {
    return null;
  }

  try {
    const data = JSON.parse(output) as NpmAuditOutput;
    const vulns = data.metadata?.vulnerabilities;

    if (!vulns) {
      return null;
    }

    return {
      critical: vulns.critical ?? 0,
      high: vulns.high ?? 0,
      moderate: vulns.moderate ?? 0,
      low: vulns.low ?? 0,
    };
  } catch (error) {
    log.warn({ error }, "Failed to parse npm audit output");
    return null;
  }
}

function parsePnpmAudit(output: string): SecuritySummary | null {
  if (!output.trim()) {
    return null;
  }

  try {
    const data = JSON.parse(output) as PnpmAuditOutput;

    // Check for error response
    if (data.error) {
      log.warn({ error: data.error }, "pnpm audit returned an error");
      return null;
    }

    const vulns = data.metadata?.vulnerabilities;

    if (!vulns) {
      return null;
    }

    return {
      critical: vulns.critical ?? 0,
      high: vulns.high ?? 0,
      moderate: vulns.moderate ?? 0,
      low: vulns.low ?? 0,
    };
  } catch (error) {
    log.warn({ error }, "Failed to parse pnpm audit output");
    return null;
  }
}

function parseYarnAudit(output: string): SecuritySummary | null {
  if (!output.trim()) {
    return null;
  }

  // Yarn outputs NDJSON, find the auditSummary line
  const lines = output.trim().split("\n");

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type: string; data?: unknown };

      if (parsed.type === "auditSummary") {
        const summary = parsed as YarnAuditSummary;
        const vulns = summary.data.vulnerabilities;

        return {
          critical: vulns.critical ?? 0,
          high: vulns.high ?? 0,
          moderate: vulns.moderate ?? 0,
          low: vulns.low ?? 0,
        };
      }
    } catch (error) {
      // NDJSON may contain non-JSON lines (info messages, etc.)
      log.trace({ line, error }, "Skipping non-JSON line in yarn audit output");
    }
  }

  return null;
}

// ============================================================================
// Main Analyzer
// ============================================================================

/**
 * Get the command and arguments for running outdated check.
 */
function getOutdatedCommand(pm: PackageManagerName): { command: string; args: string[] } {
  switch (pm) {
    case "npm":
      return { command: "npm", args: ["outdated", "--json"] };
    case "pnpm":
      return { command: "pnpm", args: ["outdated", "--format", "json"] };
    case "yarn":
      return { command: "yarn", args: ["outdated", "--json"] };
    case "bun":
      return { command: "bun", args: ["outdated"] };
  }
}

/**
 * Get the command and arguments for running security audit.
 */
function getAuditCommand(pm: PackageManagerName): { command: string; args: string[] } {
  switch (pm) {
    case "npm":
      return { command: "npm", args: ["audit", "--json"] };
    case "pnpm":
      return { command: "pnpm", args: ["audit", "--json"] };
    case "yarn":
      return { command: "yarn", args: ["audit", "--json"] };
    case "bun":
      // Bun doesn't have a native audit command yet
      // Fall back to npm audit
      return { command: "npm", args: ["audit", "--json"] };
  }
}

/**
 * Parse outdated output based on package manager.
 */
function parseOutdatedOutput(pm: PackageManagerName, output: string): OutdatedPackage[] {
  switch (pm) {
    case "npm":
      return parseNpmOutdated(output);
    case "pnpm":
      return parsePnpmOutdated(output);
    case "yarn":
      return parseYarnOutdated(output);
    case "bun":
      return parseBunOutdated(output);
  }
}

/**
 * Parse audit output based on package manager.
 */
function parseAuditOutput(pm: PackageManagerName, output: string): SecuritySummary | null {
  switch (pm) {
    case "npm":
    case "bun": // bun falls back to npm audit
      return parseNpmAudit(output);
    case "pnpm":
      return parsePnpmAudit(output);
    case "yarn":
      return parseYarnAudit(output);
  }
}

/**
 * Run the outdated check for a project.
 *
 * Note: This uses our custom exec utility which internally uses Bun.spawn,
 * a safe alternative that passes arguments directly without shell interpolation.
 */
async function runOutdatedCheck(pm: PackageManagerName, cwd: string): Promise<ExecResult> {
  const { command, args } = getOutdatedCommand(pm);
  log.debug({ pm, command, args }, "Running outdated check");

  return exec(command, args, { cwd });
}

/**
 * Run the security audit for a project.
 *
 * Note: This uses our custom exec utility which internally uses Bun.spawn,
 * a safe alternative that passes arguments directly without shell interpolation.
 */
async function runAuditCheck(pm: PackageManagerName, cwd: string): Promise<ExecResult> {
  const { command, args } = getAuditCommand(pm);
  log.debug({ pm, command, args }, "Running security audit");

  return exec(command, args, { cwd });
}

/**
 * Count total dependencies from package.json.
 */
async function countTotalDependencies(cwd: string): Promise<number> {
  try {
    const packageJsonPath = `${cwd}/package.json`;
    const content = await Bun.file(packageJsonPath).text();
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const depsCount = Object.keys(pkg.dependencies ?? {}).length;
    const devDepsCount = Object.keys(pkg.devDependencies ?? {}).length;

    return depsCount + devDepsCount;
  } catch (error) {
    log.warn({ error, cwd }, "Failed to count dependencies from package.json");
    return 0;
  }
}

/**
 * Analyze dependencies in a project.
 *
 * @param options - Analyzer options
 * @returns The dependency analysis result
 */
export async function analyzeDeps(options: DepsAnalyzerOptions = {}): Promise<DepsAnalysis> {
  const { cwd = process.cwd(), includeSecurity = false } = options;

  log.info({ cwd, includeSecurity }, "Starting dependency analysis");

  // Detect package manager
  const pmInfo = await detectPackageManager(cwd);
  const pm = pmInfo.name;
  log.debug({ pm, lockfile: pmInfo.lockfile }, "Detected package manager");

  // Run outdated check
  const outdatedResult = await runOutdatedCheck(pm, cwd);

  // Parse outdated output (combine stdout and stderr as some PMs output to stderr)
  const outdatedOutput = outdatedResult.stdout || outdatedResult.stderr;
  const packages = parseOutdatedOutput(pm, outdatedOutput);
  log.debug({ packageCount: packages.length }, "Parsed outdated packages");

  // Count update types
  const major = packages.filter((p) => p.updateType === "major").length;
  const minor = packages.filter((p) => p.updateType === "minor").length;
  const patch = packages.filter((p) => p.updateType === "patch").length;

  // Count total dependencies
  const total = await countTotalDependencies(cwd);

  // Run security audit if requested
  let security: SecuritySummary | null = null;
  if (includeSecurity) {
    const auditResult = await runAuditCheck(pm, cwd);
    const auditOutput = auditResult.stdout || auditResult.stderr;
    security = parseAuditOutput(pm, auditOutput);
    log.debug({ security }, "Parsed security audit");
  }

  const result: DepsAnalysis = {
    total,
    outdated: packages.length,
    major,
    minor,
    patch,
    security,
    packages,
  };

  log.info(
    { total, outdated: packages.length, major, minor, patch, hasSecurity: security !== null },
    "Dependency analysis complete"
  );

  return result;
}

// Export parsers for testing
export const parsers = {
  parseNpmOutdated,
  parsePnpmOutdated,
  parseYarnOutdated,
  parseBunOutdated,
  parseNpmAudit,
  parsePnpmAudit,
  parseYarnAudit,
};
