# Installation

upkeep has two parts that install independently:

- **The `upkeep` CLI binary** — via Homebrew, the install script, a manual download, or from source.
- **The Claude Code skills** — via the plugin marketplace. See [SKILLS.md](SKILLS.md).

The skills shell out to the CLI, so install the binary first and make sure it is on your `PATH`.

## Homebrew (recommended)

```bash
brew install llbbl/tap/upkeep
```

Upgrades come through the tap like any other formula:

```bash
brew update && brew upgrade upkeep
```

The tap tracks releases automatically, but on a deliberate delay — the formula is
bumped once a release is at least 24 hours old, so a brand-new version takes
roughly a day to become available through Homebrew. Use one of the methods below
if you need it immediately.

## Install script

```bash
curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash
```

This installs the binary to `~/.local/bin/`, falling back to `~/.upkeep/bin/` if
that directory does not exist. It installs the CLI only — the skills come from
the plugin marketplace.

To install a specific version:

```bash
UPKEEP_VERSION=v0.5.0 curl -fsSL https://raw.githubusercontent.com/llbbl/upkeep/main/scripts/install.sh | bash
```

## Manual download

Download the archive for your platform from
[releases](https://github.com/llbbl/upkeep/releases) and extract the `upkeep`
binary onto your `PATH`.

| Platform | Asset |
|----------|-------|
| Linux x64 | `upkeep_<version>_linux_amd64.tar.gz` |
| Linux ARM64 | `upkeep_<version>_linux_arm64.tar.gz` |
| macOS ARM64 (Apple Silicon) | `upkeep_<version>_darwin_arm64.tar.gz` |
| macOS x64 (Intel) | `upkeep_<version>_darwin_amd64.tar.gz` |
| Windows x64 | `upkeep_<version>_windows_amd64.exe` |

Every release also publishes `checksums.txt`. Verify before running:

```bash
sha256sum -c checksums.txt --ignore-missing
```

## From source

Requires [Bun](https://bun.sh) >= 1.3.

```bash
git clone https://github.com/llbbl/upkeep.git
cd upkeep
bun install
bun run build
```

The compiled binary lands at `dist/upkeep`. See [DEVELOPMENT.md](DEVELOPMENT.md)
for working on upkeep itself.

## Verifying the install

```bash
upkeep --version
```

If the command is not found, the install directory is not on your `PATH`. For the
install script's default location, add this to your shell profile:

```bash
export PATH="$HOME/.local/bin:$PATH"
```
