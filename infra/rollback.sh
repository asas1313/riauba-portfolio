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
# release itself was reached. releases.log therefore records *three*
# distinct action strings, not two: "deploy", "rollback-explicit" (this
# script invoked with a <sha> argument -- a deliberate jump) and
# "rollback-auto" (this script invoked with no <sha> -- an automatic
# walk-back). Telling these two rollback flavours apart in the log is
# exactly what a second QA-found regression needed: a single "rollback"
# action string can't distinguish "undo a deliberate jump" from "undo a
# previous automatic walk-back," and those two need different "previous"
# logic:
#
#   - If the current release's own most recent releases.log line is a
#     *deploy* or a *rollback-explicit*, the current release was reached
#     by one deliberate action (a build, or an explicit jump) -- undoing
#     it with a no-sha rollback means simply going to the release that
#     was live right before that action, i.e. the literal preceding log
#     line. This covers: the simple case (deploy A, B, C -> roll back to
#     B); "deploy a hotfix on top of an already-rolled-back release, then
#     roll back again" (deploy A, B, C; roll back to B; deploy D; roll
#     back again must land on B, the release actually live immediately
#     before D -- never bounce to C, which was never live at the time D
#     shipped); and "undo a deliberate explicit-sha jump" (deploy A, B,
#     C, D; explicit rollback to B; a following no-sha rollback must land
#     on D -- the release live immediately before that deliberate jump --
#     never fall into the deploy-chronology walk-back below and land on
#     A instead).
#   - If the current release's own most recent releases.log line is
#     itself a *rollback-auto* (i.e. this call is undoing a *previous
#     automatic* walk-back, with no fresh deploy or explicit jump in
#     between), taking the literal preceding log line would just bounce
#     back to the release that walk-back rolled back *from*. Instead,
#     this walks the *deploy*-only lines, finds the current release's own
#     deploy-order predecessor, and keeps walking further back past any
#     run of entries equal to the current release itself, so a second,
#     third, ... automatic rollback with no intervening deploy/explicit
#     jump keeps walking further into history instead of oscillating
#     between the same two releases (see
#     docs/specs/004-deployment.plan.md, "Resolved decisions").
#
# With an explicit [sha], repoints to that exact releases/<sha>/, failing
# loudly (non-zero exit, `current` untouched) if it doesn't exist on disk.
# Either form appends "<sha>  <timestamp>  rollback-explicit|rollback-auto"
# to releases.log and rewrites DEPLOYED to match.
set -euo pipefail

root="${RIAUBA_ROOT:-/srv/riauba}"
env_name="${1:-}"
target_sha="${2:-}"

# Captured before target_sha is potentially overwritten by the no-sha
# "find previous" logic below -- this is what releases.log actually
# records, and is also what decides which "previous" branch a *future*
# no-sha rollback command will take once this one lands.
if [[ -n "$target_sha" ]]; then
  action="rollback-explicit"
else
  action="rollback-auto"
fi

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
  current_action="${all_actions[$last_index]}"
  if [[ "$current_action" == "deploy" || "$current_action" == "rollback-explicit" ]]; then
    # The current release's own most recent activation was one
    # deliberate action (a deploy, or an explicit-sha rollback): the
    # release live immediately before it is simply the preceding log
    # line.
    if [[ $last_index -gt 0 ]]; then
      target_sha="${all_shas[$((last_index - 1))]}"
    fi
  else
    # current_action == "rollback-auto": undoing a previous *automatic*
    # walk-back. Walk the *deploy*-only lines and find the current
    # release's deploy-order predecessor, skipping further back past any
    # run of entries equal to the current release itself, so this never
    # bounces back to the release that walk-back rolled back from.
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
printf '%s  %s  %s\n' "$target_sha" "$timestamp" "$action" >>"$log_file"

tmp_link="$env_dir/.current.tmp.$$"
ln -sfn "releases/$target_sha" "$tmp_link"
mv -T "$tmp_link" "$current_link"

printf '%s  %s\n' "$target_sha" "$timestamp" >"$deployed_file"
