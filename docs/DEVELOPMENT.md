# Development

## Prerequisites

- [Bun](https://bun.sh) >= 1.3 (CI pins 1.4.0)
- [pnpm](https://pnpm.io/installation) 12.15.0, pinned in `package.json`
- [`just`](https://github.com/casey/just) — the task runner for every command below
- Docker with the `docker compose` plugin and a running daemon (required for tests)
- `gh` CLI (optional, for the Dependabot features)

## Setup

```bash
git clone https://github.com/llbbl/upkeep.git
cd upkeep
just install
```

`just install` runs `pnpm install --frozen-lockfile`. pnpm installs dependencies;
Bun remains the runtime for scripts, tests, and compiled binaries. CI uses
`pnpm/setup@v3` to read the pnpm version from `package.json`, install Bun 1.4.0,
cache the pnpm store, and perform one frozen-lockfile install per job.
The test image pins Node 24.13.0, Bun 1.4.0, pnpm 12.15.0, and Yarn 1.22.22.

To update dependencies, run `pnpm install` and commit the generated
`pnpm-lock.yaml`. `pnpm-workspace.yaml` keeps fixture projects outside the
workspace and requires explicit approval for dependency build scripts through
`allowBuilds`.

To put a locally built binary on your
`PATH` — for trying a change without waiting on a release and the tap's 24-hour
hold — use:

```bash
just install-local
```

That compiles for the host platform and installs to `~/.local/bin` (falling back
to `~/.upkeep/bin`). Override the destination with `UPKEEP_INSTALL_DIR`. It warns
if the target directory is not on your `PATH`.

## Commands

Run `just --list` for the full set. The ones you will use most:

| Command | What it does |
|---------|--------------|
| `just dev <args>` | Run the CLI from source, e.g. `just dev detect` |
| `just test` | Build the sandbox image and run the test suite |
| `just test-watch` | Run sandboxed tests with read-only `src/` and `tests/` mounts |
| `just test-coverage` | Run sandboxed tests with coverage |
| `just typecheck` | Type check with TypeScript |
| `just lint` | Lint with Biome |
| `just lint-fix` | Lint and apply fixes |
| `just check` | Lint, typecheck, and test — run this before pushing |
| `just build` | Compile the binary for the host platform to `dist/upkeep` |
| `just install-local` | Compile and install onto your `PATH` for local testing |
| `just coverage-check` | Run tests with coverage and enforce the floor (what CI runs) |
| `just build-all` | Compile for all five release targets |
| `just clean` | Remove `dist/` |

## Test sandbox

Run tests only through `just test`, `just test-watch`, `just test-coverage`, or
`just coverage-check`. Every test imports the sandbox guard before other imports,
so direct host runs are refused from the repository root or any child directory.
`just check` runs lint and typecheck on the host, then tests in Docker;
builds also stay on the host. Both CI and release verification run tests in the
container.

The multi-stage `Dockerfile.test` copies the allowed test inputs into the image. Normal
test and coverage runs have no host bind mounts. Dependencies are installed from
the frozen lockfile in a cached layer, so source edits rebuild only the final
copy layer. npm installs exact pnpm and Yarn versions globally to avoid Corepack
downloads during read-only test runs; npm itself comes with the pinned Node image.

The container runs as a non-root user with a read-only root filesystem, no Linux
capabilities, and no privilege escalation. Temporary files and package-manager
caches use `/tmp`, with `HOME=/tmp/home`. The build context allows only `src/`,
`tests/`, `scripts/`, and the package, lockfile, workspace, and TypeScript config
files. Other root files, including local agent context and credential files, are
excluded. Inside allowed directories it also excludes local agent configuration,
`.env*`, `.npmrc`, `.netrc`, `.yarnrc*`, names containing `token`, and `.pem`/`.key`
files at any depth, along with generated dependencies, builds, and coverage output.
The committed coverage-summary fixture is the sole coverage-output exception.
This allowlist and name filter do not identify secrets stored under other allowed
names; review the source and fixtures copied into the image.
Coverage is printed to the terminal; files inside
the temporary filesystem disappear when the container exits.

`just test-watch` additionally mounts only `src/` and `tests/` read-only so it can
see edits. Changes to dependencies or configuration require restarting the recipe.

Network access remains enabled because CLI tests contact the npm registry; the
sandbox does not prevent a malicious test from sending data over the network.
A PR that removes a test's first guard import is caught by `guard-coverage.test.ts`
in CI. The guard checks both `UPKEEP_SANDBOX=1` and `/.dockerenv` independently of
the working directory. A PR can still edit the guard, its coverage test, Docker
configuration, or recipes: review those changes and keep running tests through
`just`.

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

- `pnpm outdated` reports a newer version for the TypeScript 6 alias. That row is the
  intentionally pinned alias, not a stale dependency. Do not "fix" it.
- The `typecheck` script points at `./node_modules/typescript/bin/tsc` explicitly,
  because both packages ship a `tsc` binary.

## Coverage

```bash
just test-coverage    # report only
just coverage-check   # report and enforce the floor (what CI runs)
```

CI runs `scripts/check-coverage.sh` inside the test container, which fails the
build if aggregate coverage drops below the floor recorded in that script.
Locally, use `just coverage-check` to run the same gate in Docker.
The guard and its import-coverage check use test filenames, so Bun excludes them
from coverage and the aggregate gate retains its original measurement population.

The floor is enforced by our own script rather than Bun's built-in
`coverageThreshold` for two reasons, both verified on Bun 1.3.9:

- The table forms (`coverageThreshold = { line = ..., function = ... }` and a
  `[test.coverageThreshold]` section) are not enforced at all — an impossible
  0.99 threshold still exits 0.
- The single-number form *is* enforced, but **per file**, not against the
  aggregate. Since `src/lib/utils/exec.ts` is at 0% functions, any non-zero
  threshold fails the build (verified down to 0.02).

A gate that silently does nothing is worse than no gate, so the script parses the
aggregate row itself and fails closed if it cannot find or parse it. Once
`exec.ts` has real tests (issue #27), switching back to the built-in per-file
threshold becomes realistic.

One thing worth knowing when reading coverage numbers: `tests/cli/` runs the CLI
through `Bun.spawn`, and instrumentation does not follow into a child process.
Those tests contribute **nothing** to the percentages — everything measured comes
from `tests/lib/`. The CLI tests earn their place as end-to-end verification, not
as coverage.

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
