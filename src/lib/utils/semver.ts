/**
 * Simple semver utilities for version comparison.
 *
 * These utilities handle basic semver parsing and comparison
 * without requiring external dependencies.
 */

export type UpdateType = "major" | "minor" | "patch" | "none";

export interface SemverParts {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  build: string | null;
}

/**
 * Parse a semver version string into its component parts.
 *
 * Handles versions with optional 'v' prefix and prerelease/build metadata.
 *
 * @param version - The version string to parse
 * @returns The parsed version parts, or null if invalid
 */
export function parseSemver(version: string): SemverParts | null {
  // Remove leading 'v' if present
  const cleaned = version.replace(/^v/, "");

  // Match semver pattern: major.minor.patch[-prerelease][+build]
  const match = cleaned.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
  );

  if (!match) {
    return null;
  }

  const [, majorStr, minorStr, patchStr, prerelease, build] = match;

  // These are guaranteed to be defined by the regex match structure
  if (majorStr === undefined || minorStr === undefined || patchStr === undefined) {
    return null;
  }

  const major = Number.parseInt(majorStr, 10);
  const minor = Number.parseInt(minorStr, 10);
  const patch = Number.parseInt(patchStr, 10);

  return {
    major,
    minor,
    patch,
    prerelease: prerelease ?? null,
    build: build ?? null,
  };
}

/**
 * Determine the type of update between two versions.
 *
 * @param current - The current version
 * @param latest - The latest version
 * @returns The update type (major, minor, patch, or none)
 */
export function getUpdateType(current: string, latest: string): UpdateType {
  const currentParts = parseSemver(current);
  const latestParts = parseSemver(latest);

  // If we can't parse either version, assume no update
  if (!currentParts || !latestParts) {
    return "none";
  }

  // If versions are equal, no update
  if (
    currentParts.major === latestParts.major &&
    currentParts.minor === latestParts.minor &&
    currentParts.patch === latestParts.patch
  ) {
    // Even if prereleases differ, we consider the base version
    return "none";
  }

  // Major version change
  if (latestParts.major > currentParts.major) {
    return "major";
  }

  // Minor version change (major stays same)
  if (latestParts.major === currentParts.major && latestParts.minor > currentParts.minor) {
    return "minor";
  }

  // Patch version change (major and minor stay same)
  if (
    latestParts.major === currentParts.major &&
    latestParts.minor === currentParts.minor &&
    latestParts.patch > currentParts.patch
  ) {
    return "patch";
  }

  // Latest is older than current (shouldn't normally happen)
  return "none";
}

/**
 * Compare two semver versions.
 *
 * @param a - First version
 * @param b - Second version
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const aParts = parseSemver(a);
  const bParts = parseSemver(b);

  // If we can't parse, treat as equal
  if (!aParts || !bParts) {
    return 0;
  }

  // Compare major
  if (aParts.major < bParts.major) return -1;
  if (aParts.major > bParts.major) return 1;

  // Compare minor
  if (aParts.minor < bParts.minor) return -1;
  if (aParts.minor > bParts.minor) return 1;

  // Compare patch
  if (aParts.patch < bParts.patch) return -1;
  if (aParts.patch > bParts.patch) return 1;

  // Versions are equal (ignoring prerelease/build for simplicity)
  return 0;
}

/**
 * Check if a version is valid semver.
 *
 * @param version - The version string to check
 * @returns True if valid semver
 */
export function isValidSemver(version: string): boolean {
  return parseSemver(version) !== null;
}
