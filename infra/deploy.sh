#!/usr/bin/env bash
# infra/deploy.sh <staging|production> <sha> <dist-dir>
#
# Spec 004, AC-4. Copies <dist-dir> into
# /srv/riauba/<env>/releases/<sha>/ (the base path is $RIAUBA_ROOT, which
# defaults to /srv/riauba -- only ever overridden by
# tests/unit/infra-deploy.test.ts, pointed at a fs.mkdtempSync temp
# directory; the real deploy workflow always uses the default), atomically
# switches /srv/riauba/<env>/current to point at it (a new symlink under a
# temp name, then `mv -T` over the old one -- never a window with no
# `current` at all), appends an append-only line to releases.log, prunes
# releases/* to the 5 most-recently-*logged* entries (never directory
# mtime -- see docs/specs/004-deployment.plan.md's "Resolved decisions"),
# always keeping whichever release `current` now points at, and writes
# DEPLOYED. Exits 2 (writing nothing) for any env other than
# staging|production.
set -euo pipefail

root="${RIAUBA_ROOT:-/srv/riauba}"
env_name="${1:-}"
sha="${2:-}"
dist_dir="${3:-}"

case "$env_name" in
  staging | production) ;;
  *)
    echo "deploy.sh: env must be 'staging' or 'production', got '${env_name}'" >&2
    exit 2
    ;;
esac

if [[ -z "$sha" || -z "$dist_dir" ]]; then
  echo "usage: deploy.sh <staging|production> <sha> <dist-dir>" >&2
  exit 2
fi

if [[ ! -d "$dist_dir" ]]; then
  echo "deploy.sh: dist dir '${dist_dir}' does not exist" >&2
  exit 2
fi

env_dir="$root/$env_name"
releases_dir="$env_dir/releases"
release_dir="$releases_dir/$sha"
log_file="$env_dir/releases.log"
current_link="$env_dir/current"
deployed_file="$env_dir/DEPLOYED"

mkdir -p "$releases_dir"

rm -rf "$release_dir"
cp -a "$dist_dir" "$release_dir"
printf '%s' "$sha" >"$release_dir/version.txt"

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s  %s  deploy\n' "$sha" "$timestamp" >>"$log_file"

tmp_link="$env_dir/.current.tmp.$$"
ln -sfn "releases/$sha" "$tmp_link"
mv -T "$tmp_link" "$current_link"

printf '%s  %s\n' "$sha" "$timestamp" >"$deployed_file"

# Prune releases/* to the 5 most-recently-logged distinct shas, always
# keeping whichever release `current` now points at. Recency is derived
# purely from releases.log line order (the last line mentioning each sha
# wins), never from `stat`/mtime.
mapfile -t log_shas < <(awk '{print $1}' "$log_file")

declare -A last_index=()
for i in "${!log_shas[@]}"; do
  last_index["${log_shas[$i]}"]=$i
done

mapfile -t ranked_shas < <(
  for s in "${!last_index[@]}"; do
    printf '%s %s\n' "${last_index[$s]}" "$s"
  done | sort -rn | awk '{print $2}'
)

declare -A keep=()
keep["$sha"]=1
kept_count=0
for s in "${ranked_shas[@]}"; do
  if [[ $kept_count -lt 5 ]]; then
    keep["$s"]=1
    kept_count=$((kept_count + 1))
  fi
done

if [[ -d "$releases_dir" ]]; then
  for dir in "$releases_dir"/*/; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    if [[ -z "${keep[$name]:-}" ]]; then
      rm -rf "$dir"
    fi
  done
fi
