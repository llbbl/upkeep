# Releasing

Releases are **automated**. Merging a PR into `main` triggers the
[`auto-release`](../.github/workflows/auto-release.yml) workflow, which derives the
next version from the commit messages, bumps every version-bearing file, tags,
builds all five platform binaries, and publishes a GitHub Release.

You do not normally run any release command by hand.

## How the version is chosen

The workflow reads every commit since the last tag and applies conventional-commit
rules:

| Commits since last tag | Bump |
|---|---|
| Any `feat!:`, `fix!:`, `refactor!:`, or `BREAKING CHANGE` | major |
| Any `feat:` | minor |
| Anything else | patch |

This is why the commit conventions in [`CLAUDE.md`](../CLAUDE.md) matter — the
prefix you write directly decides the version number.

Commits whose message starts with `chore(release):` are skipped, so the workflow's
own bump commit does not retrigger it.

## What the workflow does

1. **version** — computes the next version, runs `just set-version X.Y.Z`,
   verifies with `just typecheck` and `just test`, then commits
   `chore(release): bump version to vX.Y.Z` and pushes an annotated tag.
2. **build** — compiles the binary for `linux-x64`, `linux-arm64`, `darwin-x64`,
   `darwin-arm64`, and `windows-x64` on matching runners.
3. **release** — packages each Unix binary as
   `upkeep_<version>_<os>_<arch>.tar.gz` (with the binary named `upkeep` inside),
   ships Windows as a raw `.exe`, writes `checksums.txt`, generates the changelog
   with git-cliff, and creates the GitHub Release.

The Homebrew tap (`llbbl/tap`) consumes `checksums.txt` to render per-platform
`url` + `sha256`, so the archive naming and the checksums file are part of the
public contract — changing either will break `brew install llbbl/tap/upkeep`.

## Version-bearing files

A release must update **all** of these in lockstep. Both `just set-version` and
`just update-all-versions` write every one of them:

- `package.json`
- `src/cli/index.ts` (the `VERSION` constant)
- `skills/audit/SKILL.md`, `skills/deps/SKILL.md`, `skills/quality/SKILL.md`, `skills/trim/SKILL.md` (frontmatter)
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json` (`metadata.version`)

Check them at any time:

```bash
just show-versions
```

If you add another file that carries the version, add it to `update-all-versions`,
`set-version`, and `show-versions` in the [`justfile`](../justfile), **and** to the
`git add` list in both `commit-version` and the workflow's "Commit and tag" step.
Missing any one of those is how a file silently drifts out of sync.

## Manual release (escape hatch)

Only needed if the workflow is broken or you are releasing from a machine on
purpose. From a clean `main`:

```bash
just bump-patch   # 0.4.0 -> 0.4.1
just bump-minor   # 0.4.0 -> 0.5.0
just bump-major   # 0.4.0 -> 1.0.0
```

Each bumps `package.json`, syncs every file above, commits, and creates the tag.
Then:

```bash
git push origin main --tags
```

To set an exact version instead of bumping:

```bash
just set-version 1.2.3
```

> **Note:** `set-version` uses GNU `sed -i` and is intended for the Linux CI
> runner. `update-all-versions` (used by the `bump-*` recipes) uses BSD `sed -i ''`
> for macOS. Use the `bump-*` recipes locally on a Mac.

## Verifying a release

```bash
gh release view vX.Y.Z
```

Expect five binaries plus `checksums.txt`. Confirm the tap still resolves:

```bash
brew update && brew info llbbl/tap/upkeep
```
