---
name: trim
version: 0.4.3
description: Find and remove JS/TS dependency weight you carry but never use
allowed-tools: Bash, Read, Grep, Glob, Edit, Task
---

# /upkeep:trim

Find dependency weight the project carries but does not use, and reduce it.

## Overview

Three different questions get confused. This skill answers the third:

| Question | Skill |
|---|---|
| What is outdated? | `/upkeep:deps` |
| What is vulnerable? | `/upkeep:audit` |
| **What is here that we do not use, and what does it cost?** | **`/upkeep:trim`** |

A package can be perfectly current, carry zero advisories, and still be pure dead weight — a native image library pulled in by a text-only code path, a polyfill for a runtime you dropped, three copies of the same package at different versions. None of that shows up as "outdated" or "vulnerable."

This skill inventories the weight, delegates per-package investigation to the `js-dep-analyst` agent, and then applies the cheapest lever that actually works.

## Git Workflow Defaults

**IMPORTANT:** Follow these unless the user explicitly requests otherwise.

1. **Work in a branch** - Never commit directly to main:
   ```bash
   git checkout -b deps/trim-unused
   ```
2. **Never edit a lockfile by hand** - Change manifests and let the package manager resolve.
3. **Always verify before committing** - A trim that breaks a runtime code path is worse than the weight it removed.
4. **No attribution** - Do NOT include any of these in commits or PRs:
   - `Co-Authored-By: Claude` or any Claude attribution
   - `🤖 Generated with Claude Code` or similar footers
   - Any AI/assistant attribution or emoji markers

## Prerequisites

- The `upkeep` binary must be installed and available on your `PATH`:
  ```bash
  brew install llbbl/tap/upkeep
  ```
- Before running any `upkeep` command, verify it is on `PATH` and stop with a clear message if not:
  ```bash
  command -v upkeep >/dev/null 2>&1 || {
    echo "upkeep not found on PATH — install it with: brew install llbbl/tap/upkeep" >&2
    exit 1
  }
  ```

## Workflow

### Step 1: Detect Project Configuration

```bash
upkeep detect --json
```

Note the package manager and its version — some levers are version-specific (see Step 6).

### Step 2: Inventory the Weight

Find the largest contributors before forming any theory:

```bash
du -sh node_modules/.pnpm/* 2>/dev/null | sort -rh | head -20
```

Native packages dominate. Anything shipping platform-specific `.node` files or a vendored C library is usually an order of magnitude larger than the JS around it — check those first.

Also look for duplicates, which are invisible to size sorting:

```bash
ls node_modules/.pnpm | sed -E 's/@[0-9].*//' | sort | uniq -d
```

### Step 3: Investigate Each Candidate

**Delegate this to the `js-dep-analyst` agent — one invocation per candidate, or one covering a small related set.** The investigation is read-heavy (dependency trees, parent manifests, registry lookups) and you want the verdict back, not the tree dumps in context.

Give the agent the package name and the project's actual use case. It returns a verdict with the chain, the dependency edge type, whether source reaches it, measured cost, and available levers.

For a quick single check without the agent:

```bash
pnpm why <pkg>          # or: npm ls <pkg>, yarn why <pkg>
upkeep imports <pkg> --json
```

### Step 4: Attribute Advisories Independently

If the project baselines advisories, trace each one to its owning package yourself.

**Do not trust the comment next to the baseline.** Those comments record what someone believed when they wrote them, they are rarely revisited, and they are frequently wrong about which dependency is responsible. A baseline saying "native runtime deps" can easily cover two advisories from two unrelated lineages.

```bash
upkeep audit --json
```

Cross-check each GHSA against the advisory database for the real package name, affected range, and — critically — whether a patched version already exists.

### Step 5: Check Whether the Fix Already Exists Upstream

Before designing a local workaround, check whether someone has already fixed it:

- Is there a patched version of the offending package published?
- Is there an open issue or PR in the parent package's repo?
- Has the parent already moved the dependency to `optionalDependencies` in a newer release?

An unmerged upstream PR is worth knowing about even if you cannot wait for it — it tells you the local workaround is temporary and should be removed later.

### Step 6: Pick the Cheapest Lever That Works

Try these in order. Stop at the first that holds.

**1. Override to a patched version.** Often the advisory is already fixed and you simply cannot reach the fix because an intermediate package pins below it with a caret range. `^0.34.5` can never resolve to `0.35.0`. An override that forces the patched version clears the advisory without removing anything or changing what you ship — by far the cheapest outcome.

**2. Override to remove.** pnpm supports dropping a dependency a parent does not need on your code path. Verify the current syntax and caveats against the package manager's own docs before relying on it — the documented guidance is aimed at optional dependencies, and behavior against a hard dependency may differ.

**3. Replace the parent.** If the parent exists only for a narrow purpose, a lighter package may cover it.

**4. Push upstream.** Ask for the dependency to be made optional. Slow, but it is the only fix that helps everyone and the only one you do not have to maintain.

**5. Accept it.** If no lever works, say so and document why. "No good lever exists today" is a legitimate outcome.

### Step 7: Verify

After any change, confirm the install actually shrank and nothing broke:

```bash
<pm> install
du -sh node_modules
<test command>
```

Exercise the real code path, not just the test suite. A dependency dropped because "source never imports it" can still be reached at runtime through a parent's internals.

## Heuristics That Are Easy To Get Wrong

**The package manager does not change the dependency graph.** npm, pnpm, yarn, and bun all resolve the same manifests to the same tree. Switching installers to shed a dependency does not work. Say so directly when it is proposed — it wastes real effort.

**"Not built" is not "not installed."** pnpm's `onlyBuiltDependencies` / `ignoredBuiltDependencies` and bun's `trustedDependencies` control whether *install scripts run*. The package is still downloaded and still on disk. Skipping the build avoids compile time and some supply-chain risk; the bytes stay. Never conflate the two.

**A caret range can strand you on a vulnerable version.** When an advisory has a published fix you cannot reach, the blocker is usually an intermediate package's range, not the dependency itself. This reframes "remove it" into "override it," which is far cheaper.

**Hard dependencies install unconditionally.** Check the parent's manifest to see whether it declares the package under `dependencies`, `optionalDependencies`, or `peerDependencies`. That single fact determines which levers exist.

**Removing weight is not always right.** If the cost is acceptable and no lever is clean, leaving it alone is the correct answer. The goal is an accurate picture, not a smaller tree at any price.

## Commands Reference

| Command | Purpose |
|---|---|
| `upkeep detect` | Detect package manager and version |
| `upkeep imports <pkg>` | AST analysis of where a package is used |
| `upkeep audit` | Security audit, for advisory attribution |
| `upkeep deps` | Outdated packages, for context |
| `pnpm why <pkg>` | Trace why a package is in the tree |

## Handling Common Scenarios

### The package is a hard dependency of something we need

No installer flag avoids it. Go to overrides, or upstream. Confirm first whether the code path that pulls it in is one you actually call.

### Multiple versions of the same package

Usually different parents pinning incompatible ranges. An override unifying them can work, but verify each parent tolerates the unified version — this is a common source of subtle runtime breakage.

### The dependency is only used by a code path we never call

The strongest case for trimming, and still worth verifying at runtime rather than by grep alone. Prefer an upstream request to make it optional, since that fixes it for every consumer.

### It is a dev dependency

Lower priority — it does not ship. Still worth trimming if it slows CI meaningfully or runs install scripts.
