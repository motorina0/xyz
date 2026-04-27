#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  echo "Usage: $0 <search-root> <name-pattern> <output-path>" >&2
  exit 1
fi

search_root="$1"
name_pattern="$2"
output_path="$3"
output_directory="$(dirname "${output_path}")"

mkdir -p "${output_directory}"
asset_path="$(find "${search_root}" -type f -name "${name_pattern}" | sort | sed -n '1p')"

if [[ -z "${asset_path}" ]]; then
  echo "No ${name_pattern} found under ${search_root}." >&2
  exit 1
fi

cp "${asset_path}" "${output_path}"
