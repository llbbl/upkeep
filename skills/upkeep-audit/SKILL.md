---
name: upkeep-audit
version: 0.1.6
description: Security audit with fix recommendations for JS/TS projects
allowed-tools: Bash, Read, Grep, Glob, Edit
---

# /upkeep-audit

Security audit with intelligent fix recommendations for JavaScript/TypeScript projects.

## Overview

This skill helps you:
1. Identify security vulnerabilities in dependencies
2. Understand the severity and impact of each vulnerability
3. Assess the risk of applying fixes
4. Apply fixes safely with testing

## Git Workflow Defaults

**IMPORTANT:** Always follow these defaults unless the user explicitly requests otherwise:

1. **Work in a branch** - Never commit directly to main. Create a feature branch:
   ```bash
   git checkout -b security/fix-vulnerabilities
   ```

2. **Create a PR** - After committing fixes, create a pull request:
   ```bash
   gh pr create --title "fix: resolve security vulnerabilities" --body "## Summary
   - Fixed X vulnerabilities (Y critical, Z high)

   ## Vulnerabilities Fixed
   [list vulnerabilities]

   ## Testing
   - All tests passing
   - Audit re-run shows resolved issues"
   ```

3. **No attribution** - Do NOT include any of these in commits or PRs:
   - `Co-Authored-By: Claude` or any Claude attribution
   - `🤖 Generated with Claude Code` or similar footers
   - Any AI/assistant attribution or emoji markers

## Prerequisites

- The `upkeep` binary must be installed and available on your `PATH`. Install it with:
  ```bash
  brew install llbbl/tap/upkeep
  ```
  (or download a binary from the [GitHub releases](https://github.com/llbbl/upkeep/releases)).
- Before running any `upkeep` command, verify it is on `PATH` and stop with a clear message if not:
  ```bash
  command -v upkeep >/dev/null 2>&1 || {
    echo "upkeep not found on PATH — install it with: brew install llbbl/tap/upkeep" >&2
    exit 1
  }
  ```

## Workflow

### Step 1: Run Security Audit

```bash
upkeep audit --json
```

This returns vulnerabilities with:
- Package name
- Severity (critical, high, moderate, low)
- Title/description
- Dependency path (how the vulnerable package is reached)
- Whether a fix is available
- Fix version

### Step 2: Present Vulnerabilities by Severity

Group and present vulnerabilities in order:
1. **Critical** - Immediate action required
2. **High** - Should be fixed soon
3. **Moderate** - Fix when convenient
4. **Low** - Informational

For each vulnerability, explain:
- What the vulnerability is
- How it could be exploited
- The dependency path (is it direct or transitive?)

### Step 3: Assess Fix Risk

For each fixable vulnerability:

```bash
upkeep risk <package> --from <current> --to <fix-version> --json
```

This helps understand:
- Is the fix a major/minor/patch update?
- How widely is this package used in the codebase?
- Is it used in critical paths?

### Step 4: Apply Fixes

**For direct dependencies:**
```bash
<pm> update <package>
# or for specific version:
<pm> install <package>@<fix-version>
```

**For transitive dependencies:**
The fix often requires updating a parent dependency. Check which direct dependency pulls in the vulnerable package and update that instead.

Use `upkeep imports <parent-package>` to understand the impact.

### Step 5: Verify Fixes

1. Re-run audit: `upkeep audit --json`
2. Run tests: `<pm> test`
3. Check for regressions

### Step 6: Handle Unfixable Vulnerabilities

Some vulnerabilities may not have fixes yet. Options:
1. **Accept the risk** - Document why it's acceptable
2. **Find alternatives** - Replace the package
3. **Override** - Use npm/yarn/pnpm override to force a version (risky)
4. **Wait** - Monitor for a fix

## Example Session

User: "Check my project for security issues"

1. Run `upkeep detect --json` to understand the project
2. Run `upkeep audit --json` to scan for vulnerabilities
3. Present findings grouped by severity
4. For each fixable vulnerability:
   - Explain the issue
   - Show the dependency path
   - Assess fix risk
   - Offer to apply fix
5. Re-run audit to confirm fixes
6. Summarize changes

## Priority Matrix

| Severity | Direct Dep | Transitive Dep |
|----------|------------|----------------|
| Critical | Fix immediately | Fix immediately |
| High | Fix soon | Assess risk, fix if low risk |
| Moderate | Schedule fix | Fix if easy, otherwise accept |
| Low | Optional | Usually accept |

## Commands Reference

| Command | Purpose |
|---------|---------|
| `upkeep audit` | Run security audit |
| `upkeep detect` | Detect package manager |
| `upkeep risk <pkg>` | Assess upgrade risk |
| `upkeep imports <pkg>` | Find package usage |
| `upkeep deps` | List all outdated packages |

## Handling Common Scenarios

### Vulnerability in Dev Dependency

Lower priority since it doesn't affect production. Still fix if:
- It's a build tool that could be exploited during CI
- It's used in tests that handle sensitive data

### Vulnerability with No Fix

1. Check if a fork/patch exists
2. Consider using `npm-force-resolutions` or similar
3. Document the accepted risk
4. Set a reminder to check for fixes

### Breaking Change Required for Fix

1. Assess impact with `upkeep risk`
2. Check migration guides
3. Consider if the security risk outweighs the migration effort
4. For critical vulns, usually worth the effort
