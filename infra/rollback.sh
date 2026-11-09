#!/usr/bin/env bash
# infra/rollback.sh <staging|production> [sha]
#
# Spec 004, AC-5. Repoints /srv/riauba/<env>/current without rebuilding
# ($RIAUBA_ROOT overrides the /srv/riauba base path -- see infra/deploy.sh's
# header comment; only ever overridden by
# tests/unit/infra-rollback.test.ts). With no [sha], finds the entry
# immediately before the currently-live release's own *deploy* line in
# releases.log and rolls back to that -- log order, not directory mtime,
# so a rollback-of-a-rollback walks further back through history instead
# of bouncing between the same two releases (see
# docs/specs/004-deployment.plan.md, "Resolved decisions"). With an
# explicit [sha], repoints to that exact releases/<sha>/, failing loudly
# (non-zero exit, `current` untouched) if it doesn't exist on disk. Either
# form appends "<sha>  <timestamp>  rollback" to releases.log and rewrites
# DEPLOYED to match.
set -euo pipefail

root="${RIAUBA_ROOT:-/srv/riauba}"
env_name="${1:-}"
target_sha="${2:-}"

case "$env_name" in
  staging | production) ;;
  *)
    echo "rollback.sh: env must be 'staging' or 'production', got '${env_name}'" >&2
    exit 2
    ;;
esac

env_dir="$root/$env_name"
releases_dir="$env_dir/releases"
log_file="$env_dir/releases.log"
current_link="$env_dir/current"
deployed_file="$env_dir/DEPLOYED"

if [[ ! -e "$log_file" ]]; then
  echo "rollback.sh: no releases.log for env '${env_name}' -- nothing to roll back" >&2
  exit 1
fi

if [[ -z "$target_sha" ]]; then
  if [[ ! -L "$current_link" ]]; then
    echo "rollback.sh: no 'current' symlink for env '${env_name}' -- nothing to roll back from" >&2
    exit 1
  fi
  current_sha="$(basename "$(readlink "$current_link")")"

  mapfile -t deploy_shas < <(awk '$3 == "deploy" {print $1}' "$log_file")

  last_index=-1
  for i in "${!deploy_shas[@]}"; do
    if [[ "${deploy_shas[$i]}" == "$current_sha" ]]; then
      last_index=$i
    fi
  done

  if [[ $last_index -lt 0 ]]; then
    echo "rollback.sh: current release '${current_sha}' has no deploy entry in releases.log" >&2
    exit 1
  fi

  target_sha=""
  for ((j = last_index - 1; j >= 0; j--)); do
    if [[ "${deploy_shas[$j]}" != "$current_sha" ]]; then
      target_sha="${deploy_shas[$j]}"
      break
    fi
  done

  if [[ -z "$target_sha" ]]; then
    echo "rollback.sh: no earlier release to roll back to for env '${env_name}'" >&2
    exit 1
  fi
fi

target_dir="$releases_dir/$target_sha"
if [[ ! -d "$target_dir" ]]; then
  echo "rollback.sh: release '${target_sha}' does not exist under ${releases_dir}" >&2
  exit 1
fi

timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s  %s  rollback\n' "$target_sha" "$timestamp" >>"$log_file"

tmp_link="$env_dir/.current.tmp.$$"
ln -sfn "releases/$target_sha" "$tmp_link"
mv -T "$tmp_link" "$current_link"

printf '%s  %s\n' "$target_sha" "$timestamp" >"$deployed_file"
