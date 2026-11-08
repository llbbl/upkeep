#!/usr/bin/env bash
set -euo pipefail

tag_pattern='^v[0-9]+\.[0-9]+\.[0-9]+$'
if [[ $# -ne 2 ]]; then
  echo "Expected latest and next tags matching vX.Y.Z." >&2
  exit 1
fi
if [[ ! $1 =~ $tag_pattern || ! $2 =~ $tag_pattern ]]; then
  echo "Expected latest and next tags matching vX.Y.Z." >&2
  exit 1
fi

latest_major=${1#v}
latest_major=${latest_major%%.*}
next_major=${2#v}
next_major=${next_major%%.*}
while [[ $latest_major == 0* ]]; do
  latest_major=${latest_major#0}
done
while [[ $next_major == 0* ]]; do
  next_major=${next_major#0}
done

if [[ $latest_major != "$next_major" ]]; then
  echo "Refusing a major version change from $1 to $2." >&2
  exit 1
fi
