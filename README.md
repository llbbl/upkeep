# upkeep

A comprehensive maintenance toolkit for JavaScript and TypeScript repositories, built with [Bun](https://bun.sh).

## Features

- **Package Manager Agnostic** - Auto-detects and works with npm, yarn, pnpm, and bun
- **Dependency Analysis** - Find outdated packages with update type classification
- **Security Auditing** - Scan for vulnerabilities across all package managers
- **Import Analysis** - Track where packages are used with AST-based scanning
- **Quality Scoring** - Get a health score for your project (A-F grade)
- **Risk Assessment** - Evaluate upgrade risk before making changes
- **Dependabot Integration** - Manage Dependabot PRs from the command line

## Installation

### Claude Code Skills (Recommended)

For AI-powered maintenance workflows in Claude Code:

```bash
curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash
```

This installs Claude Code skills to `~/.claude/skills/` with the upkeep binary embedded in each skill.

### Global CLI

For standalone command-line usage:

```bash
curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/global.sh | bash
```

This installs the `upkeep` binary to a directory in your PATH (auto-detected, typically `~/.local/bin/`).

### Manual Installation

Download the appropriate binary from [releases](https://github.com/llbbl/upkeep/releases):

| Platform | Binary |
|----------|--------|
| Linux x64 | `upkeep-linux-x64` |
| macOS ARM64 (Apple Silicon) | `upkeep-darwin-arm64` |
| macOS x64 (Intel) | `upkeep-darwin-x64` |
| Windows x64 | `upkeep-windows-x64.exe` |

### From Source

```bash
git clone https://github.com/llbbl/upkeep.git
cd upkeep
bun install
bun run build
```

## Usage

### CLI Commands

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

### Example Output

#### `upkeep detect`

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

#### `upkeep quality`

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

## Claude Code Skills

upkeep includes skills for Claude Code that provide AI-powered workflows:

### `/upkeep-deps`

Upgrade dependencies with intelligent risk assessment:
- Prioritizes Dependabot PRs and security fixes
- Assesses risk before each upgrade
- Runs tests and rolls back on failure

### `/upkeep-audit`

Security audit with fix recommendations:
- Explains each vulnerability
- Shows dependency paths
- Guides through safe fixes

### `/upkeep-quality`

Improve project health:
- Explains quality metrics
- Provides actionable improvements
- Tracks progress over time

## Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- Node.js >= 20 (for compatibility testing)
- `gh` CLI (optional, for Dependabot features)

### Setup

```bash
git clone https://github.com/llbbl/upkeep.git
cd upkeep
bun install
```

### Commands

```bash
# Run in development
bun run dev -- detect

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Build binary
bun run build

# Build for all platforms
bun run build:all
```

### Project Structure

```
src/
├── cli/
│   ├── index.ts              # CLI entry point
│   └── commands/             # Command implementations
└── lib/
    ├── analyzers/            # Core analysis modules
    ├── scorers/              # Quality and risk scoring
    ├── github/               # GitHub/Dependabot integration
    ├── utils/                # Utilities (exec, semver)
    └── logger.ts             # Pino logging

skills/
├── upkeep-deps/              # Dependency upgrade skill
├── upkeep-audit/             # Security audit skill
└── upkeep-quality/           # Quality improvement skill

tests/
├── cli/                      # CLI integration tests
├── lib/                      # Unit tests
└── fixtures/                 # Test fixtures
```

## Configuration

upkeep works out of the box with no configuration. It automatically detects:

- Package manager from lockfiles
- TypeScript from tsconfig.json
- Linting from biome.json / .eslintrc
- Test runner from config files or package.json scripts
- CI from .github/workflows

## License

MIT
