#!/usr/bin/env bash
set -euo pipefail

allowed_refs=(refs/remotes/origin/main refs/remotes/origin/dev)

validate_tag_format() {
  if [[ ! "${GITHUB_REF_NAME}" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    echo "Release tags must match v<major>.<minor>.<patch>; got ${GITHUB_REF_NAME}" >&2
    exit 1
  fi
}

fetch_allowed_refs() {
  git fetch --force origin \
    +refs/heads/main:refs/remotes/origin/main \
    +refs/heads/dev:refs/remotes/origin/dev
}

resolve_tag_commit() {
  git rev-list -n 1 "${GITHUB_REF_NAME}"
}

is_allowed_commit() {
  local commit="$1"

  for allowed_ref in "${allowed_refs[@]}"; do
    if git merge-base --is-ancestor "${commit}" "${allowed_ref}"; then
      return 0
    fi
  done

  return 1
}

write_outputs() {
  local commit="$1"

  {
    echo "tag=${GITHUB_REF_NAME}"
    echo "version=${GITHUB_REF_NAME#v}"
    echo "commit=${commit}"
  } >> "${GITHUB_OUTPUT}"
}

validate_tag_format
fetch_allowed_refs
commit="$(resolve_tag_commit)"

if ! is_allowed_commit "${commit}"; then
  echo "Tag ${GITHUB_REF_NAME} points to ${commit}, which is not reachable from origin/main or origin/dev." >&2
  exit 1
fi

write_outputs "${commit}"
