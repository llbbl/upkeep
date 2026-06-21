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

upkeep has two parts that install independently:

- **The `upkeep` CLI binary** — via Homebrew or the install script (below).
- **The Claude Code skills** — via the [plugin marketplace](#claude-code-skills) (`/plugin install upkeep@llbbl-upkeep`).

## Installation

### Homebrew (Recommended)

```bash
brew install llbbl/tap/upkeep
```

### Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash
```

This installs the `upkeep` CLI binary to `~/.local/bin/` (or `~/.upkeep/bin/` if that doesn't exist). It no longer installs the skills — those come from the plugin marketplace (see [Claude Code Skills](#claude-code-skills)).

To install a specific version:

```bash
UPKEEP_VERSION=v0.2.0 curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash
```

### Manual Installation

Download the appropriate archive from [releases](https://github.com/llbbl/upkeep/releases) and extract the `upkeep` binary (verify against `checksums.txt`):

| Platform | Asset |
|----------|-------|
| Linux x64 | `upkeep_<version>_linux_amd64.tar.gz` |
| Linux ARM64 | `upkeep_<version>_linux_arm64.tar.gz` |
| macOS ARM64 (Apple Silicon) | `upkeep_<version>_darwin_arm64.tar.gz` |
| macOS x64 (Intel) | `upkeep_<version>_darwin_amd64.tar.gz` |
| Windows x64 | `upkeep_<version>_windows_amd64.exe` |

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

# Enable verbose output
upkeep --verbose detect

# Set specific log level
upkeep --log-level=debug audit
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

upkeep ships its Claude Code skills as a plugin distributed through its own marketplace. Install them with:

```text
/plugin marketplace add llbbl/upkeep
/plugin install upkeep@llbbl-upkeep
```

This installs all three skills, namespaced under the `upkeep` plugin. The skills shell out to the `upkeep` CLI, so make sure the binary is installed and on your `PATH` first (see [Installation](#installation)).

### `/upkeep:deps`

Upgrade dependencies with intelligent risk assessment:
- Prioritizes Dependabot PRs and security fixes
- Assesses risk before each upgrade
- Runs tests and rolls back on failure

### `/upkeep:audit`

Security audit with fix recommendations:
- Explains each vulnerability
- Shows dependency paths
- Guides through safe fixes

### `/upkeep:quality`

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
just dev detect

# Run tests
just test

# Type check
just typecheck

# Lint
just lint

# Build binary
just build

# Build for all platforms
just build-all

# Version management
just bump-patch   # 0.1.2 → 0.1.3
just bump-minor   # 0.1.2 → 0.2.0
just show-versions
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
├── deps/                     # Dependency upgrade skill (/upkeep:deps)
├── audit/                    # Security audit skill (/upkeep:audit)
└── quality/                  # Quality improvement skill (/upkeep:quality)

.claude-plugin/
├── plugin.json              # Plugin manifest (the `upkeep` plugin)
└── marketplace.json         # Marketplace manifest (`llbbl-upkeep`)

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
