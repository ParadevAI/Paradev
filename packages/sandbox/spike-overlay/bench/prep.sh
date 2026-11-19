#!/usr/bin/env bash
# Spike benchmark prep, as root, untimed: prep.sh A|B|C. Same tools on the real root for every layout.
set -euo pipefail
L="$1"
DRIVE=/mnt/superset-drive
exec >> /var/tmp/prep.log 2>&1
echo "== prep $L $(date +%T)"; cd /tmp
command -v bc > /dev/null || apt-get -qq -y install bc
command -v pnpm > /dev/null || npm i -g -s pnpm@10
export PIPX_HOME=/opt/pipx PIPX_BIN_DIR=/usr/local/bin
command -v uv > /dev/null || pipx install uv
command -v poetry > /dev/null || pipx install poetry
pnpm --version; uv --version; poetry --version; /usr/local/go/bin/go version

case "$L" in
	A) ;;
	B)
		# What #9847's golden drive holds: /workspace and these home subtrees, bind-mounted.
		subs=".cache .local/share .local/state .npm .cargo/registry .rustup .claude .codex/sessions go/pkg"
		install -d -o ubuntu -g ubuntu "$DRIVE/workspace" "$DRIVE/home"
		rsync -aH /workspace/ "$DRIVE/workspace/"
		mount --bind "$DRIVE/workspace" /workspace
		for s in $subs; do
			install -d -o ubuntu -g ubuntu "$DRIVE/home/$s" "/home/ubuntu/$s"
			[ -d "/home/ubuntu/$s" ] && rsync -aH "/home/ubuntu/$s/" "$DRIVE/home/$s/"
			mount --bind "$DRIVE/home/$s" "/home/ubuntu/$s"
		done
		runuser -u ubuntu -- env HOME=/home/ubuntu PATH=/home/ubuntu/.bun/bin:/usr/local/bin:/usr/bin:/bin \
			BUN_INSTALL_CACHE_DIR=/workspace/.superset/stores/bun bash -c 'cd /workspace && rm -rf node_modules && bun install --frozen-lockfile'
		;;
	C) superset-overlay-root enter true ;;
esac

clone() {
	local repo="$1" dir="$2"
	[ -d "/workspace/bench/$dir/.git" ] || git clone -q --depth 1 "https://github.com/$repo.git" "/workspace/bench/$dir"
}
CLONES="$(declare -f clone); mkdir -p /workspace/bench
clone vitejs/vite vite; clone facebook/react react; clone jestjs/jest jest; clone microsoft/TypeScript TypeScript
clone fastapi/fastapi fastapi; clone python-poetry/poetry poetry; clone junegunn/fzf fzf
cd /workspace/bench/fastapi && uv export -q --frozen --format requirements-txt --no-hashes --all-groups --no-emit-project > requirements-tests.txt && wc -l requirements-tests.txt
grep -h nodeLinker /workspace/bench/jest/.yarnrc.yml || echo 'jest nodeLinker: default (pnp)'
cd /workspace && git fetch -q --deepen=400 origin && git branch -f bench-head HEAD && git branch -f bench-old HEAD~300 && git log --oneline -1 bench-old"
ENV=(HOME=/home/ubuntu PATH=/home/ubuntu/.bun/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin)
if [ "$L" = C ]; then superset-overlay-root run runuser -u ubuntu -- env "${ENV[@]}" bash -c "$CLONES"
else runuser -u ubuntu -- env "${ENV[@]}" bash -c "$CLONES"; fi
df -h / "$DRIVE" 2>/dev/null || true
echo "== prep $L done $(date +%T)"
