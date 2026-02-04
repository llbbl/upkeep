# Upkeep Project Instructions

## Commit Conventions

This project uses **conventional commits** for automated changelog generation with git-cliff.

**Always use these prefixes:**

| Prefix | When to use |
|--------|-------------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `docs:` | Documentation changes |
| `perf:` | Performance improvements |
| `refactor:` | Code refactoring (no feature/fix) |
| `test:` | Adding or updating tests |
| `ci:` | CI/CD changes |
| `chore:` | Maintenance, dependencies, etc. |

**Format:** `<type>(<optional scope>): <description>`

**Examples:**
```
feat: add new quality metric for bundle size
fix(cli): handle missing package.json gracefully
docs: update installation instructions
chore: bump biome to v2.4.0
```

## Build & Test

```bash
bun install          # Install dependencies
bun test             # Run tests
bun run lint         # Lint code
bun run typecheck    # Type check
bun run build:all    # Build all platform binaries
```

## Releasing

See `docs/RELEASING.md` for full instructions.

**Use the justfile for version management:**
```bash
just bump-patch   # 0.1.2 → 0.1.3
just bump-minor   # 0.1.2 → 0.2.0
just bump-major   # 0.1.2 → 1.0.0

just show-versions  # Check all version values
just version-sync   # Sync all files to package.json version
```

This automatically updates:
- `package.json`
- `src/cli/index.ts` (VERSION constant)
- All skill frontmatters (`skills/*/SKILL.md`)

Then push:
```bash
git push origin main --tags
```
