# Claude Code skills

upkeep ships four Claude Code skills as a plugin, distributed through its own
marketplace.

## Installing

```text
/plugin marketplace add llbbl/upkeep
/plugin install upkeep@llbbl-upkeep
```

This installs all four skills, namespaced under the `upkeep` plugin.

The skills shell out to the `upkeep` CLI, so install the binary first and make
sure it is on your `PATH` — see [INSTALLATION.md](INSTALLATION.md).

## The four skills

Each answers a different question. They overlap less than they look like they do.

| Skill | Question it answers |
|-------|---------------------|
| `/upkeep:deps` | What is outdated? |
| `/upkeep:audit` | What is vulnerable? |
| `/upkeep:quality` | How healthy is this project overall? |
| `/upkeep:trim` | What are we carrying but not using? |

### `/upkeep:deps`

Upgrade dependencies with risk assessment:

- Prioritizes Dependabot PRs and security fixes
- Assesses risk before each upgrade
- Runs tests and rolls back on failure

### `/upkeep:audit`

Security audit with fix recommendations:

- Explains each vulnerability rather than just listing IDs
- Shows the dependency path that pulls it in
- Guides through safe fixes

### `/upkeep:quality`

Improve project health:

- Explains the quality metrics behind the score
- Provides actionable improvements
- Tracks progress over time

### `/upkeep:trim`

Find dependency weight you carry but never use:

- Traces why each package is in the tree
- Distinguishes unused weight from merely outdated or vulnerable packages
- Prefers overriding to a patched version over outright removal

This is the gap the other three leave: a dependency can be perfectly current,
carry no advisories, and still be pure dead weight. `deps` will not flag it
because it is not outdated, and `audit` will not flag it unless it happens to
drag an advisory along with it.
