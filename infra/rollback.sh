#!/usr/bin/env bash
# infra/rollback.sh <staging|production> [sha]
#
# Spec 004, AC-5. Repoints /srv/riauba/<env>/current without rebuilding
# ($RIAUBA_ROOT overrides the /srv/riauba base path -- see infra/deploy.sh's
# header comment; only ever overridden by
# tests/unit/infra-rollback.test.ts). With no [sha], computes "the release
# live immediately before the current one" from releases.log (never
# directory mtime) using a hybrid rule, needed because "immediately
# before" means two different things depending on how the *current*
# release itself was reached:
#
#   - If the current release's own most recent releases.log line is a
#     *deploy*, "previous" is simply the release that was live right
#     before that deploy happened -- the literal preceding log line. This
#     is correct both for the simple case (deploy A, B, C -> roll back to
#     B) and for "deploy a hotfix on top of an already-rolled-back
#     release, then roll back again" (deploy A, B, C; roll back to B;
#     deploy D; roll back again must land on B -- the release actually
#     live immediately before D -- never bounce to C, which was never
#     live at the time D shipped). A QA-found regression: an earlier
#     version of this script ignored rollback lines entirely here and
#     always used D's neighbour in pure *deploy* order (C), which is
#     wrong once a rollback has happened in between.
#   - If the current release's own most recent releases.log line is
#     itself a *rollback* (i.e. this call is a rollback-of-a-rollback,
#     with no fresh deploy in between), taking the literal preceding log
#     line would just bounce back to the release we rolled back *from*
#     (undoing our own rollback). Instead, this walks the *deploy*-only
#     lines, finds the current release's own deploy-order predecessor,
#     and keeps walking further back past any run of entries equal to
#     the current release -- so a second, third, ... rollback-of-a-
#     rollback with no intervening deploy keeps walking further into
#     history instead of oscillating between the same two releases (see
#     docs/specs/004-deployment.plan.md, "Resolved decisions").
#
# With an explicit [sha], repoints to that exact releases/<sha>/, failing
# loudly (non-zero exit, `current` untouched) if it doesn't exist on disk.
# Either form appends "<sha>  <timestamp>  rollback" to releases.log and
# rewrites DEPLOYED to match.
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

  mapfile -t all_shas < <(awk '{print $1}' "$log_file")
  mapfile -t all_actions < <(awk '{print $3}' "$log_file")

  last_index=-1
  for i in "${!all_shas[@]}"; do
    if [[ "${all_shas[$i]}" == "$current_sha" ]]; then
      last_index=$i
    fi
  done

  if [[ $last_index -lt 0 ]]; then
    echo "rollback.sh: current release '${current_sha}' has no entry in releases.log" >&2
    exit 1
  fi

  target_sha=""
  if [[ "${all_actions[$last_index]}" == "deploy" ]]; then
    # The current release's own most recent activation was a deploy: the
    # release live immediately before it is simply the preceding log line.
    if [[ $last_index -gt 0 ]]; then
      target_sha="${all_shas[$((last_index - 1))]}"
    fi
  else
    # Rollback-of-a-rollback: walk the *deploy*-only lines and find the
    # current release's deploy-order predecessor, skipping further back
    # past any run of entries equal to the current release itself, so
    # this never bounces back to the release we just rolled back from.
    deploy_shas=()
    for i in "${!all_shas[@]}"; do
      if [[ "${all_actions[$i]}" == "deploy" ]]; then
        deploy_shas+=("${all_shas[$i]}")
      fi
    done

    d_last_index=-1
    for i in "${!deploy_shas[@]}"; do
      if [[ "${deploy_shas[$i]}" == "$current_sha" ]]; then
        d_last_index=$i
      fi
    done

    if [[ $d_last_index -lt 0 ]]; then
      echo "rollback.sh: current release '${current_sha}' has no deploy entry in releases.log" >&2
      exit 1
    fi

    for ((j = d_last_index - 1; j >= 0; j--)); do
      if [[ "${deploy_shas[$j]}" != "$current_sha" ]]; then
        target_sha="${deploy_shas[$j]}"
        break
      fi
    done
  fi

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
