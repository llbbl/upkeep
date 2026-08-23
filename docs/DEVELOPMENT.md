# Development

## Prerequisites

- [Bun](https://bun.sh) >= 1.3 (CI pins 1.4.0)
- [`just`](https://github.com/casey/just) — the task runner for every command below
- `gh` CLI (optional, for the Dependabot features)

## Setup

```bash
git clone https://github.com/llbbl/upkeep.git
cd upkeep
just install
```

`just install` installs dependencies. It does not install the binary onto your
`PATH` — use `just build` and run `./dist/upkeep` to exercise a local build.

## Commands

Run `just --list` for the full set. The ones you will use most:

| Command | What it does |
|---------|--------------|
| `just dev <args>` | Run the CLI from source, e.g. `just dev detect` |
| `just test` | Run the test suite |
| `just test-watch` | Run tests in watch mode |
| `just test-coverage` | Run tests with coverage |
| `just typecheck` | Type check with TypeScript |
| `just lint` | Lint with Biome |
| `just lint-fix` | Lint and apply fixes |
| `just check` | Lint, typecheck, and test — run this before pushing |
| `just build` | Compile the binary for the host platform to `dist/upkeep` |
| `just build-all` | Compile for all five release targets |
| `just clean` | Remove `dist/` |

## Versioning

Versions are managed through the justfile, never by hand — the version string
lives in eight files and they must move together.

```bash
just show-versions   # print all eight, to confirm they agree
just bump-patch      # 0.5.0 -> 0.5.1
just bump-minor      # 0.5.0 -> 0.6.0
just bump-major      # 0.5.0 -> 1.0.0
```

In practice you rarely run these — releases are automated on merge to `main`.
See [RELEASING.md](RELEASING.md) for how the version is derived from commit
messages and what the release workflow does.

## TypeScript setup

The project depends on TypeScript twice, deliberately:

- `typescript` (7.x) — used to typecheck the repo
- `typescript-api` (an alias for `typescript@6.0.3`) — used at *runtime* by the
  import analyzer

TypeScript 7 is the Go-port compiler. Its npm root export is only the version
string; the JS compiler API moved behind `typescript/unstable/*` and is backed by
a per-platform native executable, which `bun build --compile` cannot bundle into
the cross-compiled binaries. So runtime AST parsing stays on the v6 API. The
reasoning is recorded at the top of `src/lib/analyzers/imports.ts`.

Two consequences worth knowing:

- `bun outdated` permanently reports `typescript 6.0.3 -> 7.0.2`. That row is the
  intentionally pinned alias, not a stale dependency. Do not "fix" it.
- The `typecheck` script points at `./node_modules/typescript/bin/tsc` explicitly,
  because both packages ship a `tsc` binary.

## Project structure

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
├── quality/                  # Quality improvement skill (/upkeep:quality)
└── trim/                     # Unused-dependency skill (/upkeep:trim)

.claude-plugin/
├── plugin.json               # Plugin manifest (the `upkeep` plugin)
└── marketplace.json          # Marketplace manifest (`llbbl-upkeep`)

tests/
├── cli/                      # CLI integration tests
├── lib/                      # Unit tests
└── fixtures/                 # Test fixtures
```

## Commit conventions

This project uses conventional commits — the prefix directly determines the next
released version, so it is load-bearing rather than cosmetic. See
[CLAUDE.md](../CLAUDE.md) for the table and [RELEASING.md](RELEASING.md) for how
the mapping works.
