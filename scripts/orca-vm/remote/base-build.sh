# shellcheck shell=bash
# Runs inside the sandbox. Needs BUN_VERSION, ORCA_VERSION,
# ORCA_RELEASE_URL, ORCA_SERVER_SHA256, ORCA_REPO_URL, ORCA_REPO_REF and ORCA_PROJECT_ROOT.
set -euo pipefail
exec 1>&2

sudo dnf install -y -q jq tar gzip unzip which findutils procps-ng gcc14 gcc14-c++ make python3 pkgconf-pkg-config libX11-devel libxkbfile-devel libsecret-devel 'dnf-command(config-manager)'
# Electron's V8 headers need a newer compiler than the image's gcc 11.
printf 'export CC=gcc14-gcc CXX=gcc14-g++\n' | sudo tee /etc/profile.d/paradev-compiler.sh >/dev/null
export CC=gcc14-gcc CXX=gcc14-g++
sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
sudo dnf install -y -q gh

curl -fsSL https://bun.sh/install | bash -s "bun-v$BUN_VERSION"
sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
sudo ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bunx

npm install -g neonctl
sudo ln -sf "$(npm prefix -g)/bin/neonctl" /usr/local/bin/neonctl

curl -fsSL https://claude.ai/install.sh | bash
sudo ln -sf "$HOME/.local/bin/claude" /usr/local/bin/claude

[ "$(uname -m)" = x86_64 ] || { echo "Unsupported architecture: $(uname -m)"; exit 1; }
orca_tarball="$HOME/orca-server.tar.gz"
[ -f "$orca_tarball" ] ||
  curl -fsSL -o "$orca_tarball" "$ORCA_RELEASE_URL/v$ORCA_VERSION/orca-server-linux-x64.tar.gz"
echo "$ORCA_SERVER_SHA256  $orca_tarball" | sha256sum -c -
sudo rm -rf /opt/orca-server
sudo mkdir -p /opt/orca-server
sudo tar -xzf "$orca_tarball" -C /opt/orca-server --strip-components=1
sudo ln -sf /opt/orca-server/bin/orca-ide /usr/local/bin/orca-ide
sudo ln -sf /opt/orca-server/bin/orca-ide /usr/local/bin/orca
rm -f "$orca_tarball"

export GIT_TERMINAL_PROMPT=0
rm -rf "$ORCA_PROJECT_ROOT"
git clone --branch "$ORCA_REPO_REF" "$ORCA_REPO_URL" "$ORCA_PROJECT_ROOT"
cd "$ORCA_PROJECT_ROOT"
bun install

for tool in git jq gh bun neonctl claude orca-ide; do
  command -v "$tool" >/dev/null || { echo "Missing after install: $tool"; exit 1; }
done
bun --version
claude --version
cat /opt/orca-server/VERSION
