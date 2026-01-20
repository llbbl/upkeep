import { createLogger } from "../logger.ts";
import { type ExecResult, exec } from "../utils/exec.ts";
import { detectPackageManager, type PackageManagerName } from "./package-manager.ts";

const log = createLogger("audit");

/**
 * Severity levels for vulnerabilities.
 */
export type Severity = "critical" | "high" | "moderate" | "low" | "info";

/**
 * Information about a single vulnerability.
 */
export interface Vulnerability {
  package: string;
  severity: Severity;
  title: string;
  path: string;
  fixAvailable: boolean;
  fixVersion: string | null;
}

/**
 * Summary of vulnerabilities by severity.
 */
export interface AuditSummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  total: number;
}

/**
 * Result of a security audit.
 */
export interface AuditResult {
  vulnerabilities: Vulnerability[];
  summary: AuditSummary;
}

/**
 * Options for the audit analyzer.
 */
export interface AuditOptions {
  cwd?: string;
}

// ============================================================================
// npm audit JSON format (v2+)
// ============================================================================

interface NpmVia {
  source?: number;
  name?: string;
  dependency?: string;
  title?: string;
  url?: string;
  severity?: string;
  cwe?: string[];
  cvss?: { score: number; vectorString: string };
  range?: string;
}

interface NpmFixInfo {
  name: string;
  version: string;
  isSemVerMajor: boolean;
}

interface NpmVulnerability {
  name: string;
  severity: string;
  isDirect: boolean;
  via: (NpmVia | string)[];
  effects: string[];
  range: string;
  nodes: string[];
  fixAvailable: boolean | NpmFixInfo;
}

interface NpmAuditOutput {
  auditReportVersion?: number;
  vulnerabilities: Record<string, NpmVulnerability>;
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
    dependencies?: {
      prod: number;
      dev: number;
      optional: number;
      peer: number;
      peerOptional: number;
      total: number;
    };
  };
}

// ============================================================================
// pnpm audit JSON format
// ============================================================================

interface PnpmAdvisory {
  id: number;
  module_name: string;
  severity: string;
  title: string;
  url: string;
  vulnerable_versions: string;
  patched_versions: string;
  overview: string;
  recommendation: string;
  cwe: string[];
  cvss?: { score: number; vectorString: string };
  findings: Array<{
    version: string;
    paths: string[];
  }>;
}

interface PnpmAuditOutput {
  actions?: unknown[];
  advisories: Record<string, PnpmAdvisory>;
  muted?: unknown[];
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
    };
    dependencies?: number;
    devDependencies?: number;
    optionalDependencies?: number;
    totalDependencies?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// yarn audit JSON format (NDJSON)
// ============================================================================

interface YarnAdvisoryData {
  resolution: {
    id: number;
    path: string;
    dev: boolean;
    optional: boolean;
    bundled: boolean;
  };
  advisory: {
    id: number;
    module_name: string;
    severity: string;
    title: string;
    url: string;
    vulnerable_versions: string;
    patched_versions: string;
    overview: string;
    recommendation: string;
    cwe: string[];
  };
}

interface YarnAuditAdvisory {
  type: "auditAdvisory";
  data: YarnAdvisoryData;
}

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
    dependencies?: number;
    devDependencies?: number;
    optionalDependencies?: number;
    totalDependencies?: number;
  };
}

// ============================================================================
// Parsers
// ============================================================================

/**
 * Normalize severity to our standard levels.
 */
function normalizeSeverity(severity: string): Severity {
  const s = severity.toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "moderate" || s === "medium") return "moderate";
  if (s === "low") return "low";
  return "info";
}

/**
 * Extract fix version from npm's fixAvailable field.
 */
function extractNpmFixVersion(fixAvailable: boolean | NpmFixInfo): string | null {
  if (typeof fixAvailable === "object" && fixAvailable.version) {
    return fixAvailable.version;
  }
  return null;
}

/**
 * Extract title from npm's via field.
 */
function extractNpmTitle(via: (NpmVia | string)[]): string {
  for (const v of via) {
    if (typeof v === "object" && v.title) {
      return v.title;
    }
  }
  return "Unknown vulnerability";
}

/**
 * Build dependency path for npm vulnerabilities.
 * Uses effects array to show the chain.
 */
function buildNpmPath(vuln: NpmVulnerability, allVulns: Record<string, NpmVulnerability>): string {
  const parts: string[] = [];

  // Start with the direct dependencies that are affected
  if (vuln.effects.length > 0) {
    // Build path by walking up through effects
    const buildPathRecursive = (name: string, visited: Set<string>): string[] => {
      if (visited.has(name)) return [name];
      visited.add(name);

      const v = allVulns[name];
      if (!v) return [name];

      // If this package has effects, it's deeper in the tree
      if (v.effects.length > 0) {
        // Get the path through the first effect
        const parentPath = buildPathRecursive(v.effects[0] ?? "", visited);
        return [...parentPath, name];
      }

      return [name];
    };

    const pathParts = buildPathRecursive(vuln.name, new Set());
    // Reverse to get root > ... > vulnerable
    return pathParts.reverse().join(" > ");
  }

  // If no effects, this is likely a direct dependency
  parts.push(vuln.name);
  return parts.join(" > ");
}

/**
 * Parse npm audit JSON output.
 */
export function parseNpmAudit(output: string): AuditResult | null {
  if (!output.trim()) {
    return null;
  }

  try {
    const data = JSON.parse(output) as NpmAuditOutput;

    if (!data.metadata?.vulnerabilities) {
      return null;
    }

    const vulnerabilities: Vulnerability[] = [];
    const vulns = data.vulnerabilities ?? {};

    for (const [, vuln] of Object.entries(vulns)) {
      // Skip if this is just an effect of another vulnerability
      // We only want to report the actual vulnerable packages
      const isViaString = vuln.via.some((v) => typeof v === "string");
      if (isViaString && vuln.via.length === 1) {
        // This is likely a passthrough - the actual vuln is in the via reference
        continue;
      }

      const title = extractNpmTitle(vuln.via);
      const fixAvailable = vuln.fixAvailable !== false;
      const fixVersion = extractNpmFixVersion(vuln.fixAvailable);
      const path = buildNpmPath(vuln, vulns);

      vulnerabilities.push({
        package: vuln.name,
        severity: normalizeSeverity(vuln.severity),
        title,
        path,
        fixAvailable,
        fixVersion,
      });
    }

    const meta = data.metadata.vulnerabilities;
    const summary: AuditSummary = {
      critical: meta.critical ?? 0,
      high: meta.high ?? 0,
      moderate: meta.moderate ?? 0,
      low: meta.low ?? 0,
      total: meta.total ?? 0,
    };

    return { vulnerabilities, summary };
  } catch (error) {
    log.warn({ error }, "Failed to parse npm audit output");
    return null;
  }
}

/**
 * Parse pnpm audit JSON output.
 */
export function parsePnpmAudit(output: string): AuditResult | null {
  if (!output.trim()) {
    return null;
  }

  try {
    const data = JSON.parse(output) as PnpmAuditOutput;

    if (data.error) {
      log.warn({ error: data.error }, "pnpm audit returned an error");
      return null;
    }

    if (!data.metadata?.vulnerabilities) {
      return null;
    }

    const vulnerabilities: Vulnerability[] = [];
    const advisories = data.advisories ?? {};

    for (const [, advisory] of Object.entries(advisories)) {
      // Build paths from findings
      const paths: string[] = [];
      for (const finding of advisory.findings ?? []) {
        for (const p of finding.paths ?? []) {
          paths.push(p);
        }
      }

      // Use the first path, or just the package name
      const path = paths[0] ?? advisory.module_name;

      // Determine fix version from patched_versions
      let fixVersion: string | null = null;
      if (advisory.patched_versions && advisory.patched_versions !== "<0.0.0") {
        // patched_versions is a semver range, extract a version if possible
        const match = advisory.patched_versions.match(/(\d+\.\d+\.\d+)/);
        if (match) {
          fixVersion = match[1] ?? null;
        }
      }

      vulnerabilities.push({
        package: advisory.module_name,
        severity: normalizeSeverity(advisory.severity),
        title: advisory.title,
        path: path.replace(/>/g, " > "),
        fixAvailable: fixVersion !== null,
        fixVersion,
      });
    }

    const meta = data.metadata.vulnerabilities;
    const total =
      (meta.critical ?? 0) +
      (meta.high ?? 0) +
      (meta.moderate ?? 0) +
      (meta.low ?? 0) +
      (meta.info ?? 0);

    const summary: AuditSummary = {
      critical: meta.critical ?? 0,
      high: meta.high ?? 0,
      moderate: meta.moderate ?? 0,
      low: meta.low ?? 0,
      total,
    };

    return { vulnerabilities, summary };
  } catch (error) {
    log.warn({ error }, "Failed to parse pnpm audit output");
    return null;
  }
}

/**
 * Parse yarn audit NDJSON output.
 */
export function parseYarnAudit(output: string): AuditResult | null {
  if (!output.trim()) {
    return null;
  }

  const lines = output.trim().split("\n");
  const vulnerabilities: Vulnerability[] = [];
  let summary: AuditSummary | null = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { type: string; data?: unknown };

      if (parsed.type === "auditAdvisory") {
        const advisory = parsed as YarnAuditAdvisory;
        const { resolution, advisory: adv } = advisory.data;

        // Determine fix version from patched_versions
        let fixVersion: string | null = null;
        if (adv.patched_versions && adv.patched_versions !== "<0.0.0") {
          const match = adv.patched_versions.match(/(\d+\.\d+\.\d+)/);
          if (match) {
            fixVersion = match[1] ?? null;
          }
        }

        vulnerabilities.push({
          package: adv.module_name,
          severity: normalizeSeverity(adv.severity),
          title: adv.title,
          path: resolution.path.replace(/>/g, " > "),
          fixAvailable: fixVersion !== null,
          fixVersion,
        });
      } else if (parsed.type === "auditSummary") {
        const summaryData = parsed as YarnAuditSummary;
        const meta = summaryData.data.vulnerabilities;
        const total =
          (meta.critical ?? 0) +
          (meta.high ?? 0) +
          (meta.moderate ?? 0) +
          (meta.low ?? 0) +
          (meta.info ?? 0);

        summary = {
          critical: meta.critical ?? 0,
          high: meta.high ?? 0,
          moderate: meta.moderate ?? 0,
          low: meta.low ?? 0,
          total,
        };
      }
    } catch (error) {
      // NDJSON may contain non-JSON lines (info messages, etc.)
      log.trace({ line, error }, "Skipping non-JSON line in yarn audit output");
    }
  }

  if (!summary) {
    // Calculate summary from vulnerabilities if not provided
    if (vulnerabilities.length === 0) {
      return null;
    }

    summary = {
      critical: vulnerabilities.filter((v) => v.severity === "critical").length,
      high: vulnerabilities.filter((v) => v.severity === "high").length,
      moderate: vulnerabilities.filter((v) => v.severity === "moderate").length,
      low: vulnerabilities.filter((v) => v.severity === "low").length,
      total: vulnerabilities.length,
    };
  }

  return { vulnerabilities, summary };
}

// ============================================================================
// Audit Command Runner
// ============================================================================

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
 * Parse audit output based on package manager.
 */
function parseAuditOutput(pm: PackageManagerName, output: string): AuditResult | null {
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
 * Perform a security audit on a project.
 *
 * @param options - Audit options
 * @returns The audit result with vulnerabilities and summary
 */
export async function analyzeAudit(options: AuditOptions = {}): Promise<AuditResult> {
  const { cwd = process.cwd() } = options;

  log.info({ cwd }, "Starting security audit");

  // Detect package manager
  const pmInfo = await detectPackageManager(cwd);
  const pm = pmInfo.name;
  log.debug({ pm, lockfile: pmInfo.lockfile }, "Detected package manager");

  // Run audit check
  const auditResult = await runAuditCheck(pm, cwd);

  // Audit commands exit with non-zero when vulnerabilities are found
  // This is expected behavior, so we process the output regardless
  const output = auditResult.stdout || auditResult.stderr;
  const result = parseAuditOutput(pm, output);

  if (!result) {
    log.debug("No vulnerabilities found or unable to parse audit output");
    return {
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        total: 0,
      },
    };
  }

  log.info(
    {
      total: result.summary.total,
      critical: result.summary.critical,
      high: result.summary.high,
    },
    "Security audit complete"
  );

  return result;
}

// Export parsers for testing
export const parsers = {
  parseNpmAudit,
  parsePnpmAudit,
  parseYarnAudit,
};
