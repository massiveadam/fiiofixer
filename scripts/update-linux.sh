#!/usr/bin/env bash
# Fetch the newest published Linux release, verify its checksum, and install it.
set -euo pipefail

repo="massiveadam/fiiofixer"
release="$(curl --fail --silent --show-error --header 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/${repo}/releases/latest")"
version="$(printf '%s' "$release" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"].lstrip("v"))')"
installed="$(curl --silent --max-time 2 http://127.0.0.1:8787/api/status 2>/dev/null |
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("version", ""))' 2>/dev/null || true)"

echo "Latest release: ${version}"
echo "Installed:      ${installed:-unknown (helper not running)}"
if [ -n "$installed" ] && python3 -c 'import sys; sys.exit(0 if tuple(map(int, sys.argv[1].split("."))) >= tuple(map(int, sys.argv[2].split("."))) else 1)' "$installed" "$version"; then
  echo "Nothing newer to install."
  exit 0
fi

base="https://github.com/${repo}/releases/download/v${version}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tarball="fiiofixer-${version}-linux.tar.gz"
curl --fail --silent --show-error --location --output "$work/$tarball" "$base/$tarball"
curl --fail --silent --show-error --location --output "$work/$tarball.sha256" "$base/${tarball%.tar.gz}.sha256"
(cd "$work" && sha256sum --check --status "$tarball.sha256") || { echo "Checksum mismatch. Nothing installed." >&2; exit 1; }

tar -xzf "$work/$tarball" -C "$work"
bash "$work/fiiofixer-${version}/scripts/install-linux.sh"
echo "Updated FiiOFixer to ${version}. Reload the app to pick up the new editor."
