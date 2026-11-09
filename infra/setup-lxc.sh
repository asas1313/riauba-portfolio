#!/usr/bin/env bash
# infra/setup-lxc.sh
#
# Spec 004, AC-10, plus the "Added requirements" follow-up fixed by
# docs/specs/004-deployment-setup-lxc-fixes.plan.md. Run manually, once,
# as root inside a fresh, unprivileged Debian LXC on Proxmox (see
# docs/technical/runbook.md for the full step-by-step). Idempotent: every
# step checks whether it's already satisfied before acting, so running
# this a second time (e.g. after a Caddyfile or hostname change) is
# always safe.
#
# This script never runs in CI (nothing here can be exercised without a
# real LXC); `make lint` only syntax-checks it with `bash -n`, and
# .github/workflows/ci.yml additionally runs `shellcheck` against it.
# tests/unit/infra-setup-lxc.test.ts spawns the real script as a
# non-root process to cover the variable-resolution step below (the only
# part reachable without root/a real systemd/caddy) -- everything past
# the root check stays manual-only, same boundary spec 004 already
# accepted for this script.
#
# ---------------------------------------------------------------------------
# Required-variable resolution (checked FIRST, before the root check)
# ---------------------------------------------------------------------------
# infra/Caddyfile addresses its site blocks with `{$VAR}` tokens -- today
# exactly `{$PROD_HOSTS}`/`{$STAGING_HOSTS}`, discovered dynamically below
# by grepping the shipped Caddyfile itself (never hardcoded a second time
# here), so a future third `{$VAR}` is picked up automatically instead of
# silently drifting out of sync with this script.
#
# Each discovered variable is resolved from its own checked-in,
# per-environment file (hostnames are not secrets -- spec 004's own
# constraint -- so these are plain-text and committed):
#
#   PROD_HOSTS    -> infra/production.env   (currently: PROD_HOSTS=riauba.org)
#   STAGING_HOSTS -> infra/staging.env      (currently: STAGING_HOSTS=staging.riauba.org)
#
# This mapping (the `var_file` table below) must be extended by hand if
# `infra/Caddyfile` ever grows a third `{$VAR}` -- an unmapped discovered
# variable is itself treated as a problem (fail loudly) rather than
# silently skipped. If either file is missing, unreadable, or doesn't
# actually define its expected variable, this prints one line per problem
# (which file, which variable, why) to stderr and exits 1 -- before the
# root check, before `useradd`, before touching /srv/riauba, before
# touching Caddy at all. This is a deliberate behavioural change from
# this script's original version (which always failed on "must be run as
# root" first, unconditionally): checking root identity is itself a
# pre-install gate, and this ordering is also what makes the check
# testable at all without root (see
# docs/specs/004-deployment-setup-lxc-fixes.plan.md, Design decisions) --
# not an accidental regression.
#
# ---------------------------------------------------------------------------
# Generated systemd EnvironmentFile + drop-in (this script's *output*)
# ---------------------------------------------------------------------------
# infra/production.env/infra/staging.env above are this script's checked-in
# *input*. Their values are merged into a single generated *output* file,
# /etc/caddy/env, as plain `KEY=value` lines with NO quoting -- systemd's
# EnvironmentFile parser is not a shell and does not strip quotes the way
# bash would, so `KEY="value"` would literally include the quote
# characters in the value. Mode 0600, owned by root (systemd reads this
# file as PID 1 before dropping privileges to the caddy service user).
#
# /etc/systemd/system/caddy.service.d/10-riauba-env.conf is the drop-in
# that wires /etc/caddy/env into Caddy's own systemd unit:
#
#   [Service]
#   EnvironmentFile=/etc/caddy/env
#
# Both are rewritten on every run from the currently-resolved values
# (idempotent). Whether either file's *content* actually changed this run
# is tracked explicitly, because that -- not merely "the Caddyfile
# changed" -- decides reload vs. restart below: a systemd EnvironmentFile
# is only ever read when the unit's process starts, never re-read by
# `caddy reload`'s own live-config hot-swap (its admin API), so a changed
# hostname value needs a real `systemctl restart caddy` to take effect.
#
# ---------------------------------------------------------------------------
# Validate before install, install before reload/restart
# ---------------------------------------------------------------------------
# The Caddyfile is validated (`caddy validate --config`, with the
# resolved variables exported into this same shell so validation actually
# sees them) from its *source* location in the repo checkout, BEFORE it
# is ever installed to /etc/caddy/Caddyfile -- not installed-then-gated-
# on-reload. On failure, this exits non-zero without installing anything
# or touching the running Caddy service at all, so a bad Caddyfile is
# never even placed at the live config path where someone might assume
# it's already active. Only on success does `install -m 0644` happen.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Discover every {$VAR} token infra/Caddyfile references, deduped. The
# `|| true` guards survive `set -o pipefail` if the Caddyfile ever stops
# referencing any variable at all (grep/sort would otherwise exit
# non-zero with no match, which `set -e` would treat as a script failure).
mapfile -t required_vars < <(
  grep -oE '\{\$[A-Z_]+\}' "$script_dir/Caddyfile" | sed -E 's/\{\$|\}//g' | sort -u || true
)

# Variable -> checked-in input file mapping. Extend by hand if
# infra/Caddyfile ever references a third {$VAR}.
declare -A var_file=(
  [PROD_HOSTS]="production.env"
  [STAGING_HOSTS]="staging.env"
)

problems=()
declare -A resolved=()

for var in "${required_vars[@]}"; do
  file="${var_file[$var]:-}"
  if [[ -z "$file" ]]; then
    problems+=("setup-lxc.sh: {\$${var}} is referenced by infra/Caddyfile but has no mapped input file in this script's var_file table -- add one")
    continue
  fi

  file_path="$script_dir/$file"
  if [[ ! -f "$file_path" || ! -r "$file_path" ]]; then
    problems+=("setup-lxc.sh: missing or unreadable infra/$file (expected to define $var)")
    continue
  fi

  value=""
  if grep -qE "^${var}=" "$file_path"; then
    value="$(grep -E "^${var}=" "$file_path" | tail -n1 | cut -d= -f2-)"
  fi

  if [[ -z "$value" ]]; then
    problems+=("setup-lxc.sh: infra/$file does not define $var")
    continue
  fi

  resolved["$var"]="$value"
done

if [[ ${#problems[@]} -gt 0 ]]; then
  for problem in "${problems[@]}"; do
    echo "$problem" >&2
  done
  exit 1
fi

# Export every resolved variable into this script's own shell -- both so
# `caddy validate` sees them later, and so a `systemctl restart caddy`
# triggered manually in the same shell would too (defence in depth; the
# real source of truth for Caddy's own process is /etc/caddy/env below).
for var in "${!resolved[@]}"; do
  export "${var}=${resolved[$var]}"
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "setup-lxc.sh: must be run as root" >&2
  exit 1
fi

# 1. Unprivileged `deploy` system user -- owns every release and runs the
#    GitHub Actions runner service (never root).
if id deploy >/dev/null 2>&1; then
  echo "setup-lxc.sh: user 'deploy' already exists, skipping"
else
  useradd --system --create-home --shell /usr/sbin/nologin deploy
  echo "setup-lxc.sh: created user 'deploy'"
fi

# 2. /srv/riauba/{staging,production}/releases, owned by deploy.
for env_name in staging production; do
  dir="/srv/riauba/$env_name/releases"
  if [[ -d "$dir" ]]; then
    echo "setup-lxc.sh: $dir already exists, skipping"
  else
    mkdir -p "$dir"
    echo "setup-lxc.sh: created $dir"
  fi
done
chown -R deploy:deploy /srv/riauba

# 3. Caddy, from its official apt repository (idempotent: skipped if
#    already installed).
if command -v caddy >/dev/null 2>&1; then
  echo "setup-lxc.sh: caddy already installed ($(caddy version)), skipping install"
else
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update
  apt-get install -y caddy
  echo "setup-lxc.sh: installed caddy ($(caddy version))"
fi

# 4. Merge the resolved variables into the single systemd EnvironmentFile
#    Caddy's unit actually reads, and the drop-in that wires it in. Both
#    are rewritten unconditionally (idempotent), but whether their
#    *content* changed this run is tracked, since that decides
#    reload-vs-restart below -- not merely whether the Caddyfile changed.
caddy_env_file="/etc/caddy/env"
caddy_dropin_dir="/etc/systemd/system/caddy.service.d"
caddy_dropin_file="$caddy_dropin_dir/10-riauba-env.conf"

mapfile -t sorted_vars < <(printf '%s\n' "${!resolved[@]}" | sort)
env_lines=()
for var in "${sorted_vars[@]}"; do
  env_lines+=("${var}=${resolved[$var]}")
done
new_env_content="$(printf '%s\n' "${env_lines[@]}")"

old_env_content=""
if [[ -f "$caddy_env_file" ]]; then
  old_env_content="$(cat "$caddy_env_file")"
fi

env_changed=0
if [[ "$old_env_content" != "$new_env_content" ]]; then
  env_changed=1
fi

mkdir -p "$(dirname "$caddy_env_file")"
tmp_env_file="$(mktemp "${caddy_env_file}.XXXXXX")"
printf '%s\n' "$new_env_content" >"$tmp_env_file"
chmod 0600 "$tmp_env_file"
chown root:root "$tmp_env_file"
mv -T "$tmp_env_file" "$caddy_env_file"

new_dropin_content="[Service]
EnvironmentFile=/etc/caddy/env"

old_dropin_content=""
if [[ -f "$caddy_dropin_file" ]]; then
  old_dropin_content="$(cat "$caddy_dropin_file")"
fi

dropin_changed=0
if [[ "$old_dropin_content" != "$new_dropin_content" ]]; then
  dropin_changed=1
fi

mkdir -p "$caddy_dropin_dir"
printf '%s\n' "$new_dropin_content" >"$caddy_dropin_file"

if [[ "$env_changed" -eq 1 || "$dropin_changed" -eq 1 ]]; then
  echo "setup-lxc.sh: $caddy_env_file or $caddy_dropin_file content changed, will daemon-reload + restart caddy"
fi

# 5. Validate the *source* Caddyfile (still in the repo checkout) before
#    ever installing it to /etc/caddy/Caddyfile -- on failure, nothing is
#    installed and the running caddy service is left completely alone.
if ! caddy validate --config "$script_dir/Caddyfile"; then
  echo "setup-lxc.sh: caddy validate failed for $script_dir/Caddyfile -- NOT installed, caddy service left untouched" >&2
  exit 1
fi

install -m 0644 "$script_dir/Caddyfile" /etc/caddy/Caddyfile
echo "setup-lxc.sh: validated and installed /etc/caddy/Caddyfile"

systemctl enable caddy >/dev/null 2>&1 || true

# 6. Reload vs. restart: a changed EnvironmentFile/drop-in only takes
#    effect on process start, never via `caddy reload`'s live hot-swap --
#    so this must daemon-reload + restart whenever either changed this
#    run (first run, or a changed hostname value); otherwise the cheaper
#    reload (falling back to restart if Caddy isn't running yet) is
#    sufficient.
if [[ "$env_changed" -eq 1 || "$dropin_changed" -eq 1 ]]; then
  systemctl daemon-reload
  systemctl restart caddy
  echo "setup-lxc.sh: environment changed -- ran daemon-reload and restarted caddy"
else
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  echo "setup-lxc.sh: reloaded caddy (restarted if reload failed, e.g. first run)"
fi

# 7. Print the exact runner-registration commands. These are never run
# automatically: the registration token is single-use and must be fetched
# from GitHub (Settings -> Actions -> Runners -> New self-hosted runner)
# by Andrius himself, per docs/technical/runbook.md.
cat <<'EOF'

setup-lxc.sh: base provisioning done.

To register this LXC as the "homelab-riauba" GitHub Actions runner,
running as the unprivileged "deploy" user:

  sudo -u deploy -i
  mkdir -p ~/actions-runner && cd ~/actions-runner
  curl -o actions-runner-linux-x64.tar.gz -L \
    https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64.tar.gz
  tar xzf ./actions-runner-linux-x64.tar.gz
  ./config.sh --url https://github.com/<owner>/<repo> --token <TOKEN> \
    --labels homelab-riauba --name portfolio-lxc --unattended
  exit  # back to root

  cd /home/deploy/actions-runner
  ./svc.sh install deploy
  ./svc.sh start

Get <TOKEN> from the GitHub repository's Settings -> Actions -> Runners
-> "New self-hosted runner" page. See docs/technical/runbook.md for the
full walkthrough.
EOF
