---
name: upkeep-deps
version: 0.1.5
description: Upgrade JS/TS dependencies with risk assessment and Dependabot PR integration
allowed-tools: Bash, Read, Grep, Glob, Edit
---

# /upkeep-deps

Upgrade JavaScript/TypeScript dependencies with intelligent risk assessment.

## Overview

This skill helps you upgrade dependencies safely by:
1. Identifying outdated packages and pending Dependabot PRs
2. Assessing the risk of each upgrade
3. Executing upgrades with proper testing
4. Rolling back if tests fail

## Git Workflow Defaults

**IMPORTANT:** Always follow these defaults unless the user explicitly requests otherwise:

1. **Work in a branch** - Never commit directly to main. Create a feature branch:
   ```bash
   git checkout -b deps/update-packages
   ```

2. **Handle Dependabot PRs in main** - Merge existing Dependabot PRs to main first (they're already in PRs), then switch to a feature branch for additional updates.

3. **Create a PR** - After committing changes, create a pull request:
   ```bash
   gh pr create --title "chore: update dependencies" --body "## Summary
   - Updated X packages
   - Fixed Y vulnerabilities

   ## Changes
   [list changes]"
   ```

4. **No attribution** - Do NOT include any of these in commits or PRs:
   - `Co-Authored-By: Claude` or any Claude attribution
   - `🤖 Generated with Claude Code` or similar footers
   - Any AI/assistant attribution or emoji markers

## Prerequisites

- `./bin/upkeep` binary must be available in this skill's directory
- `gh` CLI for Dependabot PR integration (optional but recommended)

## Workflow

### Step 1: Detect Project Configuration

```bash
./bin/upkeep detect --json
```

This tells you:
- Which package manager to use (npm, yarn, pnpm, bun)
- What test runner is configured
- Whether TypeScript/linting is set up

### Step 2: Check for Dependabot PRs (if gh CLI available)

```bash
./bin/upkeep dependabot --json
```

Dependabot PRs are pre-tested and often the safest to merge first.

### Step 3: Get Outdated Packages

```bash
./bin/upkeep deps --json
```

This returns all outdated packages categorized by update type (major/minor/patch).

### Step 4: Prioritize Upgrades

Present upgrades to the user in this priority order:
1. **Dependabot PRs** - Already have PRs ready, checks may be passing
2. **Security fixes** - Check `./bin/upkeep audit --json` for vulnerabilities
3. **Patch updates** - Lowest risk, bug fixes only
4. **Minor updates** - New features, should be backward compatible
5. **Major updates** - Breaking changes, highest risk

### Step 5: For Each Upgrade

Before upgrading, assess the risk:

```bash
./bin/upkeep risk <package> --json
```

This analyzes:
- How many files use the package
- Whether it's used in critical paths (API routes, auth)
- Test coverage of affected files

Then show the user the risk assessment and ask for confirmation.

### Step 6: Execute Upgrade

Use the detected package manager:
- npm: `npm update <package>` or `npm install <package>@latest`
- yarn: `yarn upgrade <package>`
- pnpm: `pnpm update <package>`
- bun: `bun update <package>`

For major upgrades, use explicit version:
```bash
<pm> install <package>@<version>
```

### Step 7: Verify

1. Run tests: `<pm> test`
2. Run linter: `<pm> lint` or check with the detected linter
3. Run type check if TypeScript: `<pm> typecheck` or `tsc --noEmit`

### Step 8: Handle Results

**If tests pass:**
- Summarize changes made
- Offer to commit (if user wants)

**If tests fail:**
- Show test output
- Analyze failures - are they related to the upgrade?
- Offer to rollback: `git checkout package.json <lockfile>`
- Suggest fixes if obvious

## Example Session

User: "Update my dependencies"

1. Run `./bin/upkeep detect --json` to understand the project
2. Run `./bin/upkeep deps --json` to see what's outdated
3. Run `./bin/upkeep audit --json` to check for security issues
4. Present a prioritized list to the user
5. For approved upgrades, run risk assessment and execute
6. Test after each upgrade
7. Summarize all changes at the end

## Batch Upgrades

For low-risk upgrades (patches with good test coverage), offer to batch them:

```bash
<pm> update  # Updates all to latest within semver range
```

Only do this if:
- All updates are patch level
- Risk scores are all "low"
- User confirms

## Commands Reference

| Command | Purpose |
|---------|---------|
| `./bin/upkeep detect` | Detect project configuration |
| `./bin/upkeep deps` | List outdated packages |
| `./bin/upkeep audit` | Security vulnerability scan |
| `./bin/upkeep imports <pkg>` | Find where package is used |
| `./bin/upkeep risk <pkg>` | Assess upgrade risk |
| `./bin/upkeep dependabot` | List Dependabot PRs |
