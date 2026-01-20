import { createLogger } from "../logger.ts";

const log = createLogger("tsconfig");

/**
 * TypeScript strict flags that contribute to strictness score.
 */
export interface TsConfigStrictFlags {
  strict: boolean;
  noUncheckedIndexedAccess: boolean;
  noImplicitReturns: boolean;
  noFallthroughCasesInSwitch: boolean;
  exactOptionalPropertyTypes: boolean;
  noImplicitOverride: boolean;
  noUnusedLocals: boolean;
  noUnusedParameters: boolean;
}

/**
 * Result of analyzing tsconfig.json.
 */
export interface TsConfigAnalysis {
  exists: boolean;
  strict: boolean;
  strictFlags: TsConfigStrictFlags;
  score: number;
  details: string;
}

/**
 * Options for the tsconfig analyzer.
 */
export interface TsConfigAnalyzerOptions {
  cwd?: string;
}

/**
 * tsconfig.json structure (partial, only what we need).
 */
interface TsConfigJson {
  compilerOptions?: {
    strict?: boolean;
    noUncheckedIndexedAccess?: boolean;
    noImplicitReturns?: boolean;
    noFallthroughCasesInSwitch?: boolean;
    exactOptionalPropertyTypes?: boolean;
    noImplicitOverride?: boolean;
    noUnusedLocals?: boolean;
    noUnusedParameters?: boolean;
  };
  extends?: string;
}

/**
 * Score weights for individual strict flags.
 */
const FLAG_SCORES = {
  strict: 40,
  noUncheckedIndexedAccess: 20,
  noImplicitReturns: 10,
  noFallthroughCasesInSwitch: 10,
  exactOptionalPropertyTypes: 10,
  noImplicitOverride: 10,
} as const;

/**
 * Parse tsconfig.json and resolve extends chain.
 */
async function parseTsConfig(cwd: string): Promise<TsConfigJson | null> {
  const tsconfigPath = `${cwd}/tsconfig.json`;

  try {
    const file = Bun.file(tsconfigPath);
    if (!(await file.exists())) {
      log.debug({ path: tsconfigPath }, "tsconfig.json not found");
      return null;
    }

    const content = await file.text();
    // Remove comments from JSON (tsconfig allows comments)
    const jsonWithoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    const config = JSON.parse(jsonWithoutComments) as TsConfigJson;

    // If extends is present, we should merge with the base config
    // For simplicity, we only look at the top-level config for now
    // A more complete implementation would resolve the extends chain
    if (config.extends) {
      log.debug({ extends: config.extends }, "tsconfig extends another config");
    }

    return config;
  } catch (error) {
    log.warn({ error, path: tsconfigPath }, "Failed to parse tsconfig.json");
    return null;
  }
}

/**
 * Extract strict flags from tsconfig compiler options.
 */
function extractStrictFlags(config: TsConfigJson): TsConfigStrictFlags {
  const opts = config.compilerOptions ?? {};

  return {
    strict: opts.strict ?? false,
    noUncheckedIndexedAccess: opts.noUncheckedIndexedAccess ?? false,
    noImplicitReturns: opts.noImplicitReturns ?? false,
    noFallthroughCasesInSwitch: opts.noFallthroughCasesInSwitch ?? false,
    exactOptionalPropertyTypes: opts.exactOptionalPropertyTypes ?? false,
    noImplicitOverride: opts.noImplicitOverride ?? false,
    noUnusedLocals: opts.noUnusedLocals ?? false,
    noUnusedParameters: opts.noUnusedParameters ?? false,
  };
}

/**
 * Calculate strictness score from flags.
 * Full score (100) if all main flags are enabled.
 */
function calculateScore(flags: TsConfigStrictFlags): number {
  let score = 0;

  if (flags.strict) score += FLAG_SCORES.strict;
  if (flags.noUncheckedIndexedAccess) score += FLAG_SCORES.noUncheckedIndexedAccess;
  if (flags.noImplicitReturns) score += FLAG_SCORES.noImplicitReturns;
  if (flags.noFallthroughCasesInSwitch) score += FLAG_SCORES.noFallthroughCasesInSwitch;
  if (flags.exactOptionalPropertyTypes) score += FLAG_SCORES.exactOptionalPropertyTypes;
  if (flags.noImplicitOverride) score += FLAG_SCORES.noImplicitOverride;

  return score;
}

/**
 * Generate human-readable details about the analysis.
 */
function generateDetails(flags: TsConfigStrictFlags, score: number): string {
  if (score === 100) {
    return "All strict flags enabled";
  }

  const enabled: string[] = [];
  const disabled: string[] = [];

  if (flags.strict) {
    enabled.push("strict");
  } else {
    disabled.push("strict");
  }

  const additionalFlags: Array<keyof TsConfigStrictFlags> = [
    "noUncheckedIndexedAccess",
    "noImplicitReturns",
    "noFallthroughCasesInSwitch",
    "exactOptionalPropertyTypes",
    "noImplicitOverride",
  ];

  for (const flag of additionalFlags) {
    if (flags[flag]) {
      enabled.push(flag);
    } else {
      disabled.push(flag);
    }
  }

  if (enabled.length === 0) {
    return "No strict flags enabled";
  }

  if (disabled.length <= 2) {
    return `Missing: ${disabled.join(", ")}`;
  }

  return `Enabled: ${enabled.join(", ")}`;
}

/**
 * Analyze TypeScript configuration strictness.
 *
 * @param options - Analyzer options
 * @returns The tsconfig analysis result
 */
export async function analyzeTsConfig(
  options: TsConfigAnalyzerOptions = {}
): Promise<TsConfigAnalysis> {
  const { cwd = process.cwd() } = options;

  log.info({ cwd }, "Starting tsconfig analysis");

  const config = await parseTsConfig(cwd);

  if (!config) {
    log.info("No tsconfig.json found");
    return {
      exists: false,
      strict: false,
      strictFlags: {
        strict: false,
        noUncheckedIndexedAccess: false,
        noImplicitReturns: false,
        noFallthroughCasesInSwitch: false,
        exactOptionalPropertyTypes: false,
        noImplicitOverride: false,
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
      score: 0,
      details: "No tsconfig.json found",
    };
  }

  const strictFlags = extractStrictFlags(config);
  const score = calculateScore(strictFlags);
  const details = generateDetails(strictFlags, score);

  log.info({ score, strict: strictFlags.strict }, "tsconfig analysis complete");

  return {
    exists: true,
    strict: strictFlags.strict,
    strictFlags,
    score,
    details,
  };
}

// Export internals for testing
export const internals = {
  parseTsConfig,
  extractStrictFlags,
  calculateScore,
  generateDetails,
  FLAG_SCORES,
};
