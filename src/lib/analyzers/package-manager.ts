import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger.ts";

const log = createLogger("package-manager");

export type PackageManagerName = "bun" | "pnpm" | "yarn" | "npm";

export interface PackageManagerInfo {
  name: PackageManagerName;
  lockfile: string | null;
  installCommand: string;
  upgradeCommand: string;
  hasMultipleLockfiles: boolean;
  detectedLockfiles: string[];
  corepackSpec: string | null;
}

interface PackageManagerConfig {
  name: PackageManagerName;
  lockfile: string;
  installCommand: string;
  upgradeCommand: string;
}

/**
 * Bun lockfile names - bun.lock (text, newer) and bun.lockb (binary, older)
 */
const BUN_LOCKFILES = ["bun.lock", "bun.lockb"] as const;

/**
 * Package manager configurations in priority order.
 * When multiple lockfiles exist, the first match wins.
 */
const PACKAGE_MANAGERS: PackageManagerConfig[] = [
  {
    name: "bun",
    lockfile: "bun.lock", // Primary lockfile name (newer text format)
    installCommand: "bun install",
    upgradeCommand: "bun update",
  },
  {
    name: "pnpm",
    lockfile: "pnpm-lock.yaml",
    installCommand: "pnpm install",
    upgradeCommand: "pnpm update",
  },
  {
    name: "yarn",
    lockfile: "yarn.lock",
    installCommand: "yarn install",
    upgradeCommand: "yarn upgrade",
  },
  {
    name: "npm",
    lockfile: "package-lock.json",
    installCommand: "npm install",
    upgradeCommand: "npm update",
  },
];

/**
 * Default package manager info when no lockfile is detected.
 * Falls back to npm as it's the most common default.
 */
const DEFAULT_PACKAGE_MANAGER: PackageManagerInfo = {
  name: "npm",
  lockfile: null,
  installCommand: "npm install",
  upgradeCommand: "npm update",
  hasMultipleLockfiles: false,
  detectedLockfiles: [],
  corepackSpec: null,
};

/**
 * Parse the corepack packageManager field from package.json.
 * Format: "name@version" (e.g., "pnpm@8.15.0")
 */
function parseCorepackSpec(packageManagerField: string): PackageManagerName | null {
  const match = packageManagerField.match(/^(bun|pnpm|yarn|npm)@/);
  return match?.[1] as PackageManagerName | null;
}

/**
 * Read package.json and extract the packageManager field if present.
 */
async function readPackageJson(projectPath: string): Promise<{ packageManager?: string } | null> {
  const packageJsonPath = join(projectPath, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const content = await Bun.file(packageJsonPath).text();
    return JSON.parse(content) as { packageManager?: string };
  } catch {
    return null;
  }
}

/**
 * Detect which lockfiles exist in the project directory.
 */
function detectLockfiles(projectPath: string): string[] {
  const detected: string[] = [];

  log.debug({ projectPath }, "Scanning for lockfiles");

  for (const pm of PACKAGE_MANAGERS) {
    // For bun, check both bun.lock and bun.lockb
    const lockfilesToCheck = pm.name === "bun" ? BUN_LOCKFILES : [pm.lockfile];

    for (const lockfile of lockfilesToCheck) {
      const lockfilePath = join(projectPath, lockfile);
      const exists = existsSync(lockfilePath);
      log.trace({ lockfile, path: lockfilePath, exists }, "Checking lockfile");
      if (exists) {
        detected.push(lockfile);
        break; // Only add one bun lockfile
      }
    }
  }

  log.debug({ detected }, "Lockfile scan complete");
  return detected;
}

/**
 * Detect the package manager used in a project.
 *
 * Detection priority:
 * 1. Lockfile presence (bun.lockb > pnpm-lock.yaml > yarn.lock > package-lock.json)
 * 2. Corepack packageManager field in package.json
 * 3. Falls back to npm if nothing is detected
 *
 * @param projectPath - Path to the project directory (defaults to cwd)
 * @returns Package manager information
 */
export async function detectPackageManager(
  projectPath: string = process.cwd()
): Promise<PackageManagerInfo> {
  log.debug({ projectPath }, "Starting package manager detection");

  const detectedLockfiles = detectLockfiles(projectPath);
  const packageJson = await readPackageJson(projectPath);
  const corepackSpec = packageJson?.packageManager ?? null;

  log.debug({ corepackSpec }, "Read corepack spec from package.json");

  // If no lockfiles found, check corepack or fall back to default
  if (detectedLockfiles.length === 0) {
    log.debug("No lockfiles found, checking corepack specification");

    if (corepackSpec) {
      const corepackPm = parseCorepackSpec(corepackSpec);
      log.debug({ corepackPm }, "Parsed corepack package manager");

      if (corepackPm) {
        const config = PACKAGE_MANAGERS.find((pm) => pm.name === corepackPm);
        if (config) {
          log.info(
            { packageManager: config.name, source: "corepack" },
            "Package manager detected from corepack"
          );
          return {
            name: config.name,
            lockfile: null,
            installCommand: config.installCommand,
            upgradeCommand: config.upgradeCommand,
            hasMultipleLockfiles: false,
            detectedLockfiles: [],
            corepackSpec,
          };
        }
      }
    }

    log.info(
      { packageManager: "npm", source: "default" },
      "No package manager detected, using default"
    );
    return { ...DEFAULT_PACKAGE_MANAGER, corepackSpec };
  }

  // Find the first matching package manager based on priority
  const [primaryLockfile] = detectedLockfiles;
  if (!primaryLockfile) {
    // This should never happen since we checked length above, but satisfies TypeScript
    return { ...DEFAULT_PACKAGE_MANAGER, corepackSpec };
  }

  // Handle both bun.lock and bun.lockb mapping to bun
  const isBunLockfile = BUN_LOCKFILES.includes(primaryLockfile as (typeof BUN_LOCKFILES)[number]);
  const config = PACKAGE_MANAGERS.find((pm) =>
    isBunLockfile ? pm.name === "bun" : pm.lockfile === primaryLockfile
  );

  if (!config) {
    // This should never happen, but TypeScript requires handling it
    log.warn({ primaryLockfile }, "Unexpected: no config found for detected lockfile");
    return { ...DEFAULT_PACKAGE_MANAGER, detectedLockfiles, corepackSpec };
  }

  if (detectedLockfiles.length > 1) {
    log.warn(
      { packageManager: config.name, detectedLockfiles },
      "Multiple lockfiles detected, using highest priority"
    );
  } else {
    log.info(
      { packageManager: config.name, lockfile: config.lockfile, source: "lockfile" },
      "Package manager detected from lockfile"
    );
  }

  return {
    name: config.name,
    lockfile: primaryLockfile, // Use the actual detected lockfile (e.g., bun.lock vs bun.lockb)
    installCommand: config.installCommand,
    upgradeCommand: config.upgradeCommand,
    hasMultipleLockfiles: detectedLockfiles.length > 1,
    detectedLockfiles,
    corepackSpec,
  };
}
