#!/usr/bin/env bash
# infra/setup-lxc.sh
#
# Spec 004, AC-10. Run manually, once, as root inside a fresh,
# unprivileged Debian LXC on Proxmox (see docs/technical/runbook.md for
# the full step-by-step). Idempotent: every step checks whether it's
# already satisfied before acting, so running this a second time (e.g.
# after a Caddyfile change) is always safe.
#
# This script never runs in CI (nothing here can be exercised without a
# real LXC); `make lint` only syntax-checks it with `bash -n`, and
# .github/workflows/ci.yml additionally runs `shellcheck` against it.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "setup-lxc.sh: must be run as root" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# 3. `make` -- the deploy-staging.yml/deploy-production.yml workflows run
#    `make smoke` on this runner after infra/deploy.sh, and the bare LXC
#    image doesn't ship it.
if command -v make >/dev/null 2>&1; then
  echo "setup-lxc.sh: make already installed, skipping"
else
  apt-get update
  apt-get install -y make
  echo "setup-lxc.sh: installed make"
fi

# 4. Caddy, from its official apt repository (idempotent: skipped if
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

# 5. Install infra/Caddyfile and reload (always re-applied, even when
#    Caddy was already installed, so a Caddyfile edit takes effect on a
#    re-run).
install -m 0644 "$script_dir/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null 2>&1 || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy
echo "setup-lxc.sh: installed /etc/caddy/Caddyfile and reloaded caddy"

# 6. Print the exact runner-registration commands. These are never run
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
