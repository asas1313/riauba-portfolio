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
#
# Review finding: redeploying a sha that's already on disk (e.g. a
# re-run of a failed workflow, or a resolved production sha that happens
# to already be live) used to `rm -rf releases/<sha>` followed by
# `cp -a` straight into place -- a window, proportional to the copy's
# size, where `releases/<sha>/` (and therefore `current`, if it was
# already pointing there) was empty or partially written, which Caddy
# could serve errors against. `releases/<sha>` is therefore never a real
# directory any more: it's a symlink into `../.content/<sha>.<nonce>/`
# (a sibling of `releases/`, so it never appears in a `releases/`
# directory listing), built fully off to the side and switched with the
# exact same tmp-symlink + `mv -T` pattern already used for `current`
# below -- one single atomic rename, the same guarantee `current` itself
# gets, with no multi-step swap and therefore no window at all (not even
# a negligible one -- two sequential `mv` *processes*, each with their
# own fork/exec overhead, are not actually "instantaneous", which an
# earlier version of this fix learned the hard way; see
# tests/unit/infra-deploy.test.ts's atomicity regression test). Any
# previous physical content directory a redeployed sha pointed at is
# deleted only *after* the symlink has already moved on, so it's always
# genuinely unreferenced by that point.
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
content_dir="$env_dir/.content"
log_file="$env_dir/releases.log"
current_link="$env_dir/current"
deployed_file="$env_dir/DEPLOYED"

mkdir -p "$releases_dir" "$content_dir"

# Build the real content fully off to the side, under a unique name --
# even a redeploy of the same sha gets a brand new physical directory,
# never the one `releases/<sha>` (and therefore possibly `current`) might
# already be pointing at.
physical_name="$sha.$$"
physical_dir="$content_dir/$physical_name"
rm -rf "$physical_dir"
cp -a "$dist_dir" "$physical_dir"
printf '%s' "$sha" >"$physical_dir/version.txt"

# Remember what releases/<sha> pointed at before (if anything), so it can
# be cleaned up once it's safely unreferenced -- then atomically repoint
# releases/<sha> itself at the new physical directory via the same
# tmp-symlink + `mv -T` pattern as the `current` switch below.
previous_physical_target=""
if [[ -L "$release_dir" ]]; then
  previous_physical_target="$(readlink "$release_dir")"
fi

tmp_release_link="$releases_dir/.tmp.$sha.$$"
ln -sfn "../.content/$physical_name" "$tmp_release_link"
mv -T "$tmp_release_link" "$release_dir"

if [[ -n "$previous_physical_target" && "$previous_physical_target" != "../.content/$physical_name" ]]; then
  rm -rf "$releases_dir/$previous_physical_target"
fi

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
  for entry in "$releases_dir"/*; do
    [[ -e "$entry" ]] || continue
    name="$(basename "$entry")"
    if [[ -z "${keep[$name]:-}" ]]; then
      if [[ -L "$entry" ]]; then
        # Delete the physical content directory this release's symlink
        # points at, then the symlink itself.
        rm -rf "$releases_dir/$(readlink "$entry")"
      fi
      rm -rf "$entry"
    fi
  done
fi
