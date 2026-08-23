# CLI reference

All commands emit JSON on stdout, so they compose with `jq` and are safe to pipe
into other tools. Diagnostics go to stderr.

## Commands

| Command | What it does |
|---------|--------------|
| `upkeep detect` | Report the detected project configuration |
| `upkeep deps` | Analyze outdated dependencies with update-type classification |
| `upkeep audit` | Scan for security vulnerabilities |
| `upkeep imports <package>` | Find where a package is imported, via AST analysis |
| `upkeep risk <package> --from <v> --to <v>` | Assess the risk of a specific upgrade |
| `upkeep quality` | Score overall project health (A–F grade) |
| `upkeep dependabot` | List open Dependabot PRs (requires the `gh` CLI) |

### Examples

```bash
# Detect project configuration
upkeep detect

# Analyze outdated dependencies
upkeep deps

# Security vulnerability scan
upkeep audit

# Find where a package is imported
upkeep imports lodash

# Assess upgrade risk
upkeep risk next --from 14.0.0 --to 15.0.0

# Get project quality score
upkeep quality

# List Dependabot PRs (requires gh CLI)
upkeep dependabot
```

## Global flags

| Flag | Effect |
|------|--------|
| `--verbose` | Enable verbose output |
| `--log-level=<level>` | Set the log level explicitly (e.g. `debug`) |
| `--version` | Print the version and exit |

```bash
upkeep --verbose detect
upkeep --log-level=debug audit
```

## Example output

### `upkeep detect`

```json
{
  "packageManager": "pnpm",
  "lockfile": "pnpm-lock.yaml",
  "typescript": true,
  "biome": true,
  "prettier": false,
  "testRunner": "vitest",
  "coverage": true,
  "ci": "github-actions"
}
```

### `upkeep quality`

```json
{
  "score": 85,
  "grade": "B",
  "breakdown": {
    "dependencyFreshness": { "score": 90, "weight": 20, "details": "3 of 45 packages outdated" },
    "security": { "score": 100, "weight": 25, "details": "No vulnerabilities" },
    "testCoverage": { "score": 75, "weight": 20, "details": "75% line coverage" },
    "typescriptStrictness": { "score": 80, "weight": 10, "details": "Missing: exactOptionalPropertyTypes" },
    "linting": { "score": 100, "weight": 10, "details": "Biome configured" },
    "deadCode": { "score": 70, "weight": 15, "details": "noUnusedLocals enabled" }
  },
  "recommendations": [
    { "priority": "medium", "action": "Update 3 outdated packages" }
  ]
}
```

The `quality` score is a weighted sum of the `breakdown` entries — the `weight`
values indicate how much each factor contributes to the total.

## Configuration

upkeep works out of the box with no configuration file. It detects:

- Package manager from lockfiles
- TypeScript from `tsconfig.json`
- Linting from `biome.json` / `.eslintrc`
- Test runner from config files or `package.json` scripts
- CI from `.github/workflows`

Run `upkeep detect` to see exactly what it found for your project.
