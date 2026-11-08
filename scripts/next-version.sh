#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! $1 =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Expected one latest tag matching vX.Y.Z." >&2
  exit 1
fi

IFS='.' read -r major minor patch <<< "${1#v}"
input_major=$major
minor_bump=false
breaking_subject='^[^[:space:]():!]+(\([^()]+\))?!:'
breaking_footer=$'\n''BREAKING[ -]CHANGE:'
feature_subject='^feat(\([^()]+\))?!?:'

while IFS= read -r -d '' message || [[ -n $message ]]; do
  # Git inserts a newline between NUL-delimited log records.
  while [[ $message == $'\n'* ]]; do
    message=${message#$'\n'}
  done
  subject=${message%%$'\n'*}
  if [[ $subject =~ $breaking_subject || $message =~ $breaking_footer ]]; then
    minor_bump=true
    warning_subject=${subject//%/%25}
    warning_subject=${warning_subject//$'\r'/%0D}
    printf '::warning::Breaking commit maps to a minor release: %s\n' "$warning_subject" >&2
  elif [[ $subject =~ $feature_subject ]]; then
    minor_bump=true
  fi
done

if $minor_bump; then
  minor=$((10#$minor + 1))
  patch=0
else
  patch=$((10#$patch + 1))
fi

next="v${major}.${minor}.${patch}"
if [[ ${next%%.*} != "v$input_major" ]]; then
  echo "Refusing to change the major version from $input_major." >&2
  exit 1
fi
printf 'next=%s\nversion=%s\n' "$next" "${next#v}"
