set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
  @just --list

help:
  @just --list

install:
  bun install

dev *args:
  bun run dev {{args}}

build:
  bun run build

build-all:
  bun run build:all

test:
  bun test

test-watch:
  bun run test:watch

test-coverage:
  bun run test:coverage

typecheck:
  bun run typecheck

lint:
  bun run lint

lint-fix:
  bun run lint:fix

format:
  bun run format

check:
  just lint
  just typecheck
  just test

ci:
  just install
  just check
  just build

clean:
  rm -rf dist

bump-patch:
  just bump-version patch

bump-minor:
  just bump-version minor

bump-major:
  just bump-version major

bump-version bump:
  pnpm version {{bump}} --no-git-tag-version
  just update-all-versions
  just commit-version

update-all-versions:
  @VERSION=$(jq -r '.version' package.json); \
  sed -i '' 's/const VERSION = "[^"]*";/const VERSION = "'"$$VERSION"'";/' src/cli/index.ts; \
  sed -i '' 's/^version: .*/version: '"$$VERSION"'/' skills/upkeep-deps/SKILL.md; \
  sed -i '' 's/^version: .*/version: '"$$VERSION"'/' skills/upkeep-audit/SKILL.md; \
  sed -i '' 's/^version: .*/version: '"$$VERSION"'/' skills/upkeep-quality/SKILL.md; \
  echo "Updated versions to $$VERSION"

commit-version:
  @VERSION=$(jq -r '.version' package.json); \
  git add package.json src/cli/index.ts skills/*/SKILL.md; \
  git commit -m "chore: bump version to v$$VERSION"; \
  git tag v$$VERSION; \
  echo "Created tag v$$VERSION"; \
  echo "Push with: git push origin main --tags"

version-sync:
  just update-all-versions

show-versions:
  echo "=== Current Versions ==="
  echo "package.json:           $(jq -r '.version' package.json)"
  echo "src/cli/index.ts:       $(grep 'const VERSION' src/cli/index.ts | sed 's/.*"\(.*\)".*/\1/')"
  echo "upkeep-deps/SKILL.md:   $(grep '^version:' skills/upkeep-deps/SKILL.md | sed 's/version: //')"
  echo "upkeep-audit/SKILL.md:  $(grep '^version:' skills/upkeep-audit/SKILL.md | sed 's/version: //')"
  echo "upkeep-quality/SKILL.md: $(grep '^version:' skills/upkeep-quality/SKILL.md | sed 's/version: //')"
