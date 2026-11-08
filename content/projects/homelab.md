---
title: "Self-hosted homelab"
tagline: "European, self-hosted infrastructure for family services"
status: "live"
order: 3
featured: false
links: { live: null, docs: null, repo: null }
stack: ["Proxmox", "LXC", "Docker", "Nginx Proxy Manager", "Cloudflare Tunnel", "Tailscale", "rclone"]
---
A Proxmox-based homelab running a photo library (Immich), file sync (Nextcloud) and container workloads,
exposed securely through Cloudflare Tunnel and Tailscale, with nightly off-site backups to a
Hetzner Storage Box. Built around data sovereignty and European providers.
