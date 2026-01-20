# Upkeep Version Management
#
# Usage:
#   make bump-patch  - Increment patch version (0.1.2 → 0.1.3)
#   make bump-minor  - Increment minor version (0.1.2 → 0.2.0)
#   make bump-major  - Increment major version (0.1.2 → 1.0.0)
#   make show-versions - Show current versions in all files

# Get current version from package.json
CURRENT_VERSION := $(shell jq -r '.version' package.json 2>/dev/null || echo "0.0.0")

.PHONY: bump-patch bump-minor bump-major version-sync show-versions

# Semantic version bumping
bump-patch:
	@$(MAKE) bump-version BUMP_TYPE=patch

bump-minor:
	@$(MAKE) bump-version BUMP_TYPE=minor

bump-major:
	@$(MAKE) bump-version BUMP_TYPE=major

# Internal target for version bumping
bump-version:
	@if [ -z "$(BUMP_TYPE)" ]; then \
		echo "Error: Don't call 'make bump-version' directly!"; \
		echo ""; \
		echo "Use one of these commands instead:"; \
		echo "  make bump-patch  - Increment patch version (0.1.2 → 0.1.3)"; \
		echo "  make bump-minor  - Increment minor version (0.1.2 → 0.2.0)"; \
		echo "  make bump-major  - Increment major version (0.1.2 → 1.0.0)"; \
		echo ""; \
		exit 1; \
	fi
	@echo "Current version: $(CURRENT_VERSION)"
	@npm version $(BUMP_TYPE) --no-git-tag-version >/dev/null
	@NEW_VERSION=$$(jq -r '.version' package.json); \
	echo "New version: $$NEW_VERSION"; \
	$(MAKE) update-all-versions VERSION=$$NEW_VERSION; \
	$(MAKE) commit-version VERSION=$$NEW_VERSION

# Update all files with the same version
update-all-versions:
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION is empty!"; \
		exit 1; \
	fi
	@echo "Updating all files to version: $(VERSION)"
	@# Update src/cli/index.ts VERSION constant
	@sed -i '' 's/const VERSION = "[^"]*";/const VERSION = "$(VERSION)";/' src/cli/index.ts
	@# Update skill frontmatter versions
	@sed -i '' 's/^version: .*/version: $(VERSION)/' skills/upkeep-deps/SKILL.md
	@sed -i '' 's/^version: .*/version: $(VERSION)/' skills/upkeep-audit/SKILL.md
	@sed -i '' 's/^version: .*/version: $(VERSION)/' skills/upkeep-quality/SKILL.md
	@echo "Updated: package.json, src/cli/index.ts, skills/*/SKILL.md"

# Commit the version changes
commit-version:
	@echo "Committing version $(VERSION)"
	@git add package.json src/cli/index.ts skills/*/SKILL.md
	@git commit -m "chore: bump version to v$(VERSION)"
	@git tag v$(VERSION)
	@echo ""
	@echo "Created tag v$(VERSION)"
	@echo ""
	@echo "Push with:"
	@echo "  git push origin main --tags"

# Manual version setting (for fixing out-of-sync versions)
set-version:
	@read -p "Enter version (e.g., 0.1.3): " version; \
	$(MAKE) update-all-versions VERSION=$$version

# Sync versions if they're out of sync (uses package.json as source of truth)
version-sync:
	@echo "Syncing all files to version $(CURRENT_VERSION)..."
	@$(MAKE) update-all-versions VERSION=$(CURRENT_VERSION)
	@echo "All files now at version $(CURRENT_VERSION)"

# Show current versions in all files
show-versions:
	@echo "=== Current Versions ==="
	@echo "package.json:           $$(jq -r '.version' package.json)"
	@echo "src/cli/index.ts:       $$(grep 'const VERSION' src/cli/index.ts | sed 's/.*"\(.*\)".*/\1/')"
	@echo "upkeep-deps/SKILL.md:   $$(grep '^version:' skills/upkeep-deps/SKILL.md | sed 's/version: //')"
	@echo "upkeep-audit/SKILL.md:  $$(grep '^version:' skills/upkeep-audit/SKILL.md | sed 's/version: //')"
	@echo "upkeep-quality/SKILL.md: $$(grep '^version:' skills/upkeep-quality/SKILL.md | sed 's/version: //')"
