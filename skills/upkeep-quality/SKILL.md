---
name: upkeep-quality
version: 69671VERSION
description: Generate and improve code quality scores for JS/TS projects
allowed-tools: Bash, Read, Grep, Glob, Edit
---

# /upkeep-quality

Generate comprehensive quality reports and actionable improvement recommendations.

## Overview

This skill helps you:
1. Assess overall project health with a quality score
2. Understand which areas need improvement
3. Get specific, actionable recommendations
4. Track quality improvements over time

## Git Workflow Defaults

**IMPORTANT:** Always follow these defaults unless the user explicitly requests otherwise:

1. **Work in a branch** - Never commit directly to main. Create a feature branch:
   ```bash
   git checkout -b chore/improve-quality
   ```

2. **Create a PR** - After committing improvements, create a pull request:
   ```bash
   gh pr create --title "chore: improve code quality" --body "## Summary
   - Improved quality score from X to Y (grade: Z)

   ## Changes
   [list improvements made]

   ## Quality Report
   [include before/after metrics]"
   ```

3. **No attribution** - Do NOT include any of these in commits or PRs:
   - `Co-Authored-By: Claude` or any Claude attribution
   - `🤖 Generated with Claude Code` or similar footers
   - Any AI/assistant attribution or emoji markers

## Prerequisites

- `./bin/upkeep` binary must be available in this skill's directory

## Quality Metrics

The quality score is calculated from 6 weighted metrics:

| Metric | Weight | What It Measures |
|--------|--------|------------------|
| Dependency Freshness | 20% | % of dependencies up-to-date |
| Security | 25% | Absence of vulnerabilities |
| Test Coverage | 20% | Code coverage percentage |
| TypeScript Strictness | 10% | Strict compiler options enabled |
| Linting Setup | 10% | Linter configuration quality |
| Dead Code | 15% | Unused code detection setup |

## Grade Scale

| Grade | Score Range | Meaning |
|-------|-------------|---------|
| A | 90-100 | Excellent - well maintained |
| B | 80-89 | Good - minor improvements needed |
| C | 70-79 | Fair - some attention required |
| D | 60-69 | Poor - significant improvements needed |
| F | 0-59 | Failing - major issues present |

## Workflow

### Step 1: Generate Quality Report

```bash
./bin/upkeep quality --json
```

This returns:
- Overall score (0-100)
- Letter grade (A-F)
- Breakdown of each metric
- Prioritized recommendations

### Step 2: Present the Report

Show the user:
1. Overall grade and score
2. Each metric's contribution
3. Which areas are dragging down the score

### Step 3: Explain Each Metric

For metrics scoring below 70, explain:
- Why it scored low
- What the impact is
- How to improve it

### Step 4: Offer to Fix Issues

Many issues can be fixed automatically:

**Dependency Freshness:**
- Use `/upkeep-deps` skill to update packages

**Security:**
- Use `/upkeep-audit` skill to fix vulnerabilities

**TypeScript Strictness:**
- Edit tsconfig.json to enable strict flags
- Run type checker to find new errors
- Fix type errors

**Linting Setup:**
- Add Biome or ESLint configuration
- Run linter with --fix

**Test Coverage:**
- Identify uncovered files
- Help write tests for critical paths

## Example Session

User: "How healthy is my project?"

1. Run `./bin/upkeep quality --json`
2. Present the grade and score prominently
3. Show the breakdown chart
4. Highlight areas needing attention
5. Present recommendations in priority order
6. Offer to help fix specific issues

## Improving Specific Metrics

### Dependency Freshness (Target: 90+)

```bash
# Check outdated packages
./bin/upkeep deps --json

# Update all patch versions (usually safe)
<pm> update
```

### Security (Target: 100)

```bash
# Find vulnerabilities
./bin/upkeep audit --json

# Fix what's available
<pm> audit fix  # npm
```

### Test Coverage (Target: 80+)

1. Check current coverage: Look for `coverage/` directory
2. Run tests with coverage: `<pm> test --coverage`
3. Identify uncovered files
4. Prioritize testing critical paths (API, auth, data handling)

### TypeScript Strictness (Target: 100)

Add to tsconfig.json:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

Then fix resulting type errors.

### Linting Setup (Target: 100)

For a new project, recommend Biome:
```bash
bunx @biomejs/biome init
```

For existing ESLint projects, ensure Prettier is configured too.

### Dead Code (Target: 75+)

Enable TypeScript dead code detection:
```json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

Consider adding `knip` or `ts-prune` for advanced detection.

## Commands Reference

| Command | Purpose |
|---------|---------|
| `./bin/upkeep quality` | Generate quality report |
| `./bin/upkeep detect` | Check project configuration |
| `./bin/upkeep deps` | Dependency freshness details |
| `./bin/upkeep audit` | Security details |

## Tracking Progress

After making improvements:
1. Re-run `./bin/upkeep quality --json`
2. Compare new score to previous
3. Celebrate improvements!
4. Plan next improvements if needed

## Common Improvement Paths

**F → D (Quick wins):**
- Fix critical/high vulnerabilities
- Update patch-level dependencies

**D → C (Foundation):**
- Add linting configuration
- Enable basic TypeScript strict mode

**C → B (Solid):**
- Achieve 60%+ test coverage
- Fix all high/moderate vulnerabilities
- Enable all TypeScript strict flags

**B → A (Excellence):**
- 80%+ test coverage
- All dependencies up-to-date
- No vulnerabilities
- Full TypeScript strictness
