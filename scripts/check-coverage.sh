#!/usr/bin/env bash
#
# Run the test suite with coverage and enforce an aggregate floor.
#
# Why this exists rather than Bun's built-in `coverageThreshold`:
# that setting is enforced PER FILE, not against the aggregate. Because
# src/lib/utils/exec.ts currently sits at 0% functions (see issue #27), any
# non-zero per-file threshold fails the build -- verified down to 0.02. The
# table forms (`coverageThreshold = { line = ..., function = ... }` and a
# `[test.coverageThreshold]` section) are additionally not enforced at all on
# Bun 1.3.9: an impossible 0.99 still exits 0. A silently inert gate is worse
# than no gate, so we parse the aggregate ourselves.
#
# Swap back to the built-in once exec.ts is covered and a per-file floor is
# realistic.
#
# Floors can be overridden for local experimentation:
#   MIN_LINES=80 MIN_FUNCS=85 ./scripts/check-coverage.sh

set -euo pipefail

MIN_LINES="${MIN_LINES:-75}"
MIN_FUNCS="${MIN_FUNCS:-83}"

output=$(bun test --coverage 2>&1) && test_status=0 || test_status=$?
echo "$output"

if [ "$test_status" -ne 0 ]; then
  echo ""
  echo "Tests failed (exit $test_status); not evaluating coverage." >&2
  exit "$test_status"
fi

# The summary row Bun prints for the whole project.
summary=$(printf '%s\n' "$output" | grep -E '^All files' | head -1 || true)

# Fail closed. If the table format ever changes, this must not quietly pass.
if [ -z "$summary" ]; then
  echo ""
  echo "ERROR: could not find the 'All files' coverage summary row." >&2
  echo "The coverage output format may have changed. Refusing to report success." >&2
  exit 1
fi

funcs=$(printf '%s' "$summary" | awk -F'|' '{gsub(/[[:space:]]/, "", $2); print $2}')
lines=$(printf '%s' "$summary" | awk -F'|' '{gsub(/[[:space:]]/, "", $3); print $3}')

for pair in "funcs:$funcs" "lines:$lines"; do
  name=${pair%%:*}
  value=${pair#*:}
  case "$value" in
    ''|*[!0-9.]*)
      echo ""
      echo "ERROR: could not parse a numeric $name percentage (got '$value')." >&2
      echo "Refusing to report success." >&2
      exit 1
      ;;
  esac
done

echo ""
echo "Coverage gate"
echo "  functions: ${funcs}%  (floor ${MIN_FUNCS}%)"
echo "  lines:     ${lines}%  (floor ${MIN_LINES}%)"

failed=0
if awk -v v="$funcs" -v m="$MIN_FUNCS" 'BEGIN { exit (v + 0 >= m + 0) ? 1 : 0 }'; then
  echo "  FAIL: function coverage ${funcs}% is below the ${MIN_FUNCS}% floor." >&2
  failed=1
fi
if awk -v v="$lines" -v m="$MIN_LINES" 'BEGIN { exit (v + 0 >= m + 0) ? 1 : 0 }'; then
  echo "  FAIL: line coverage ${lines}% is below the ${MIN_LINES}% floor." >&2
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "Coverage regressed. Add tests, or lower the floor deliberately in this script." >&2
  exit 1
fi

echo "  OK"
